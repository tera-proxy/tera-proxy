const log = require('log')('updater'),
	fs = require('fs'),
	path = require('path'),
	https = require('https'),
	crypto = require('crypto'),
	zlib = require('zlib')

class Updater {
	constructor(maxSockets = 10) {
		this.agent = https.Agent({keepAlive: true, maxSockets})
	}

	// opts: { dir, manifestUrl, defaultUrl, compat }
	// Returns (bool) updated
	// Can throw errors
	async update(opts) {
		// Update manifest

		let fromManifest, toManifest
		try {
			const manifestPath = path.join(opts.dir, 'manifest.json')
			fromManifest = await callAsync(fs, 'readFile', manifestPath, 'utf8')
			try {
				fromManifest = JSON.parse(fromManifest)
				if(opts.compat) fromManifest = manifestFromCaali(fromManifest)
			}
			catch(e) {
				log.warn(`Failed to parse ${manifestPath}`)
				log.warn(e)
				throw e
			}
		}
		catch(e) {
			fromManifest = { data: {} }
		}

		let res
		try {
			const getOpts = { agent: this.agent, headers: { 'accept-encoding': 'gzip' } }
			if(fromManifest.etag) getOpts.headers['if-none-match'] = fromManifest.etag
			res = await httpAsync(https, 'get', opts.manifestUrl, getOpts)
		}
		catch(e) {
			if(e.statusCode === 304) return false
			throw e
		}

		toManifest = JSON.parse(await getBody(res))
		if(opts.compat) toManifest = manifestFromCaali(toManifest)

		if(!toManifest.url) toManifest.url = opts.defaultUrl
		toManifest.etag = res.headers.etag

		// Update files

		const filesNew = diffNew(fromManifest.data, toManifest.data),
			filesDeleted = diffDeleted(fromManifest.data, toManifest.data)

		if(!filesNew.length && !filesDeleted.length) {
			// There were no changes, so just silently update local manifest
			await callAsync(fs, 'writeFile', path.join(opts.dir, 'manifest.json'), JSON.stringify(toManifest))
			return false
		}

		// Download files in parallel
		const downloaded = await this.downloadFiles(toManifest, filesNew.filter(file => !file.endsWith('/') && file !== 'manifest.json'))

		// Create directories
		await ensureDirs(opts.dir, filesNew)

		// Write new files / delete old ones in parallel
		const promises = new Set()
		promises.add(callAsync(fs, 'writeFile', path.join(opts.dir, 'manifest.json'), JSON.stringify(toManifest)))
		for(let [file, data] of downloaded) promises.add(callAsync(fs, 'writeFile', path.join(opts.dir, file), data))
		for(let file of filesDeleted)
			promises.add(callAsync(fs, 'unlink', path.join(opts.dir, file)).catch(e => { if(e.code !== 'ENOENT') throw e }))
		await Promise.all(promises)

		return true
	}

	async downloadFiles(manifest, files) {
		const getOpts = { agent: this.agent, headers: { 'accept-encoding': 'gzip' } },
			promises = new Set(),
			activeRequests = new Set(),
			downloaded = new Map()

		// Simultaniously queue downloads of all files
		for(const file of files)
			promises.add((async () => {
				let url = new URL(manifest.url)
				url.pathname = url.pathname + file

				const p = httpAsync(https, 'get', url.toString(), getOpts)
				activeRequests.add(p.request)

				const data = await getBody(await p)
				activeRequests.delete(p.request)

				if(crypto.createHash('sha256').update(data).digest('base64') !== manifest.data[file])
					throw Error(`Downloaded file hash mismatch: ${file}`)

				downloaded.set(file, data)
			})())

		try { await Promise.all(promises) }
		catch(e) {
			for(let req of activeRequests) req.abort() // One of the files failed, so cancel the rest of our downloads
			throw e
		}

		return downloaded
	}

	// Must call this after call(s) to update() or else connections will be left hanging
	done() {
		this.agent.destroy() // Actually resets the agent instead of destroying it
	}
}

function manifestFromCaali(manifest) {
	if(!manifest.files) return manifest

	manifest = {data: manifest.files}
	for(let file in manifest.data) {
		let hash = manifest.data[file]
		if(hash.hash) hash = hash.hash
		manifest.data[file] = Buffer.from(hash, 'hex').toString('base64')
	}
	return manifest
}

function diffNew(mFrom, mTo) {
	const res = []
	for(let file in mTo)
		if(mTo[file] !== mFrom[file]) res.push(file)
	return res
}

function diffDeleted(mFrom, mTo) {
	const res = []
	for(let file in mFrom)
		if(!mTo[file]) res.push(file)
	return res
}

async function ensureDirs(base, files) {
	const created = new Set()

	for(let file of files) {
		const dirs = file.split(/[\/\\]/)
		dirs.pop()
		for(let i = 1; i < dirs.length; i++) dirs[i] = dirs[i - 1] + path.sep + dirs[i]
		for(let dir of dirs)
			if(!created.has(dir)) {
				try {
					await callAsync(fs, 'mkdir', path.join(base, dir))
				}
				catch(e) { if(e.code !== 'EEXIST') throw e }

				created.add(dir)
			}
	}
}

function httpAsync(lib, func, ...args) {
	let request
	const p = new Promise((resolve, reject) => {
		request = lib[func](...args, res => {
			if(res.statusCode !== 200) {
				res.resume() // We only care about the status code

				const err = Error(`${res.statusCode} ${res.statusMessage}: https://${request.getHeader('host')}${request.path}`)
				err.request = request
				err.statusCode = res.statusCode
				reject(err)
				return
			}
			resolve(res)
		})
		.setTimeout(10000)
		.on('timeout', () => {
			request.abort()

			const err = Error(`Request timed out: https://${request.getHeader('host')}${request.path}`)
			err.request = request
			reject(err)
		})
		.on('error', reject)
	})
	p.request = request
	return p
}

async function getBody(res) {
	let data = await readStreamAsync(res)
	if(res.headers['content-encoding'] === 'gzip') data = await callAsync(zlib, 'gunzip', data)
	return data
}

function callAsync(lib, func, ...args) {
	return new Promise((resolve, reject) => {
		lib[func](...args, (err, rtn) => { err ? reject(err) : resolve(rtn) })
	})
}

function readStreamAsync(stream) {
	return new Promise((resolve, reject) => {
		const chunks = []
		stream
		.on('data', data => { chunks.push(data) })
		.on('end', () => { resolve(Buffer.concat(chunks)) })
		.on('error', reject)
	})
}

module.exports = Updater
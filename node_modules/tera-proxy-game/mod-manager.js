'use strict'

const log = require('log')('mod-manager'),
	fs = require('fs'),
	path = require('path'),
	https = require('https'),
	crypto = require('crypto'),
	zlib = require('zlib'),
	yauzl = require('yauzl')

const updateAgent = https.Agent({keepAlive: true, maxSockets: 10})

class ModManager {
	constructor(opts) {
		Object.assign(this, {
			modsDir: opts.modsDir,
			settingsDir: opts.settingsDir,
			autoUpdate: Boolean(opts.autoUpdate),
			packages: new Map(),
			brokenMods: new Set()
		})
	}

	async init() {
		if(this.packages.size) return

		await this.reloadPackages()
		if(this.autoUpdate) await this.updateMods()
		else this.preloadMods() // TODO separate option
	}

	resolve(name) {
		const pkg = this.packages.get(name)
		if(!pkg) return null
		return path.join(pkg._path, pkg.main || '')
	}

	canLoad(name) { return this.packages.has(name) && !this.brokenMods.has(name) }

	async reloadPackages() {
		this.packages.clear()

		const stats = new Stats()
		for(let name of fs.readdirSync(this.modsDir).filter(name => !name.startsWith('_') && !name.startsWith('.')))
			stats.update(await this.loadPackage(path.join(this.modsDir, name)))
		stats.done('Verified', 'package')
	}

	async updateMods() {
		log.info('Checking for mod updates')

		const promises = [],
			stats = new Stats()

		for(let name of this.packages.keys()) promises.push((async () => { stats.update(await this.updateMod(name)) })())

		await Promise.all(promises)
		this.updateDone()
		stats.done('Update checked', 'mod')
	}

	// Must call this after call(s) to updateMod() or else connections will be left hanging
	updateDone() {
		updateAgent.destroy() // Actually resets the agent instead of destroying it
	}

	preloadMods() {
		this.brokenMods.clear()

		const stats = new Stats()
		for(let name of this.packages.keys()) stats.update(this.preloadMod(name))
		stats.done('Preloaded', 'mod')
	}

	async loadPackage(_path) {
		const baseName = path.basename(_path),
			extName = path.extname(baseName)

		let safeName

		// Load package, fall back to legacy if it does not exist
		let pkg
		if(fs.lstatSync(_path).isDirectory()) {
			safeName = getSafeName(baseName, true)

			try {
				pkg = fs.readFileSync(path.join(_path, 'mod.json'), 'utf8')
				try {
					pkg = JSON.parse(pkg)
				}
				catch(e) {
					log.error(`Failed to parse "${baseName}/mod.json"`)
					log.error(e)
					return false
				}
			}
			catch(e) {
				try {
					const caaliPkg = Object.assign({options: {}}, JSON.parse(fs.readFileSync(path.join(_path, 'module.json'), 'utf8')))
					pkg = {
						_compat: 2,
						_compatInfo: caaliPkg,
						name: caaliPkg.name || safeName,
						update: caaliPkg.servers[0],
						conflicts: caaliPkg.conflicts,
						title: caaliPkg.options.guiName || baseName,
						version: caaliPkg.version,
						author: caaliPkg.author,
						description: caaliPkg.description
					}
				}
				catch(e) {
					// Detect and correct folder-within-folder (user did not extract correctly)
					let badBase = path.join(_path, baseName)
					if(fs.existsSync(badBase) && fs.lstatSync(badBase).isDirectory() && fs.readdirSync(_path).length === 1) {
						fs.renameSync(badBase, badBase = path.join(_path, '__temp__'))		// Rename to prevent conflicts
						for(let file of fs.readdirSync(badBase))							// Move files out of folder
							fs.renameSync(path.join(badBase, file), path.join(_path, file))
						fs.rmdirSync(badBase)												// Cleanup

						log.info(`Automatically corrected folder-within-folder for mod "${baseName}"`)
						return this.loadPackage(_path)
					}

					// Detect folder that isn't actually a mod
					if(!fs.existsSync(path.join(_path, 'package.json')) && !fs.existsSync(path.join(_path, 'index.js'))) {
						log.error(`"${baseName}" is not a valid mod`)
						return false
					}
				}
			}
		}
		else {
			safeName = getSafeName(baseName, false)

			// Automatically extract .zip
			if(extName === '.zip') {
				try {
					const zip = await callAsync(yauzl, 'open', _path, {autoClose: false}),
						entries = []
					// Get entries
					await new Promise((resolve, reject) => {
						zip.on('entry', entry => { entries.push(entry) })
						.on('end', resolve)
						.on('error', reject)
					})

					if(!entries.length) throw Error('zip is empty')

					if(entries.some(e => e.isEncrypted())) {
						log.error(`Cannot extract encrypted zip "${baseName}", please extract it manually`)
						return false
					}

					// Find the "root" directory that contains our package
					let zipBase = ''
					for(let {fileName} of entries) {
						const dir = fileName.replace(/[^/]+$/, '')				// Chop off file

						if(!zipBase || zipBase.startsWith(dir)) zipBase = dir	// Move down 1 or more levels
						else if(!dir.startsWith(zipBase)) {						// 2+ directories in root
							zipBase = ''
							break
						}
					}

					// Attempt to determine correct name by parsing package in memory
					let name = safeName,
						standalone = false
					{
						let entry
						if(entry = entries.find(e => e.fileName === zipBase + `mod.json`)
							|| entries.find(e => e.fileName === zipBase + `module.json`)) {
							try {
								name = strOrUndef(JSON.parse(
									await readStreamAsync(await callAsync(zip, 'openReadStream', entry))
								).name) || name
							}
							catch(e) {
								log.error(`Error parsing ${path.basename(entry.fileName)} from "${baseName}"`)
								log.error(e)
								return false
							}
						}
						else if(!entries.some(e => e.fileName === zipBase + `package.json` || e.fileName === zipBase + `index.js`)) {
							if(entries.length !== 1) {
								log.error(`"${baseName}" contains multiple standalone scripts, please extract it manually`)
								return false
							}
							standalone = true
						}
					}

					const newPath = path.join(this.modsDir, name)

					if(fs.existsSync(newPath)) {
						log.error(`Cannot extract "${baseName}", "${name}" already exists`)
						return false
					}

					if(this.packages.has(name)) {
						log.error(`"${baseName}" conflicts with "${path.basename(this.packages.get(name)._path)}"`)
						return false
					}

					// Create directories
					if(!standalone)
					{
						await callAsync(fs, 'mkdir', newPath)
						await ensureDirs(newPath, entries.map(e => e.fileName.slice(zipBase.length)))
					}

					// Extract files
					for(let entry of entries)
						if(!entry.fileName.endsWith('/')) { // Ignore directories
							const rs = await callAsync(zip, 'openReadStream', entry)		// Start unpacking
							await new Promise((resolve, reject) => {
								rs
								.on('error', reject)										// Handle errors for readStream
								.pipe(fs.createWriteStream(									// Pipe to file
									path.join(newPath, entry.fileName.slice(zipBase.length))))
								.on('error', reject)										// Handle errors for writeStream
								.on('finish', resolve)										// Handle success
							})
						}

					// Delete ZIP
					zip.close()
					await callAsync(fs, 'unlink', _path)

					// Finish up and load the extracted mod
					log.info(`Extracted "${baseName}" to "${name}"`)
					return this.loadPackage(newPath)
				}
				catch(e) {
					log.error(`Error extracting "${baseName}"`)
					log.error(e)
					return false
				}
			}
			else if(extName !== '.js') {
				log.error(`"${baseName}" is not a recognised mod`)
				return false
			}
		}

		// Legacy mode
		if(!pkg) pkg = { _compat: 1, name: safeName, title: baseName }

		// Sanitize
		pkg = {
			_compat: pkg._compat || 0,
			_compatInfo: pkg._compatInfo || null,
			_path: _path,
			name: strOrUndef(pkg.name) || safeName,
			main: strOrUndef(pkg.main),
			update: strOrUndef(pkg.update),
			conflicts: Array.isArray(pkg.conflicts) ? pkg.conflicts : [],
			title: strOrUndef(pkg.title) || baseName,
			version: strOrUndef(pkg.version),
			author: strOrUndef(pkg.author),
			description: strOrUndef(pkg.description)
		}

		for(let name of [pkg.name, ...pkg.conflicts])
			if(this.packages.has(name)) {
				log.error(`"${baseName}" conflicts with "${path.basename(this.packages.get(name)._path)}"`)
				return false
			}

		if(pkg.main && pkg.main.split(/[\/\\]/).some(p => p === '..')) {
			log.error(`(${baseName}/mod.json) main cannot contain '..' ("${pkg.main}")`)
			return false
		}

		if(pkg.update !== undefined && !parseGithubUrl(pkg.update)) {
			log.warn(`(${baseName}/mod.json) only GitHub URLs are supported ("${pkg.update}")`)
			pkg.update = undefined
		}

		this.packages.set(pkg.name, pkg)
		return true
	}

	async updateMod(name) {
		const pkg = this.packages.get(name)
		if(!pkg.update) {
			if(!pkg._compat) log.info(`${log.color('1', name)} does not support auto-update`)
			return null
		}

		let fromManifest, toManifest
		try {
			fromManifest = fs.readFileSync(path.join(pkg._path, 'manifest.json'))
			try { fromManifest = JSON.parse(fromManifest) }
			catch(e) {
				log.error(`Failed to parse ${pkg._path}/manifest.json`)
				log.error(e)
				return false
			}
		}
		catch(e) {
			fromManifest = { data: {} }
		}

		if(pkg._compat === 2) fromManifest = manifestFromCaali(fromManifest)

		try {
			let manifestUrl, baseUrl

			const github = parseGithubUrl(pkg.update)
			if(github) {
				const [user, repo, branch = 'master'] = github
				baseUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/`
				manifestUrl = `${baseUrl}manifest.json`
			}
			else if(pkg._compat === 2) {
				baseUrl = pkg.update
				manifestUrl = `${baseUrl}manifest.json${pkg._compatInfo.drmKey ? `?drmkey=${encodeURIComponent(pkg._compatInfo.drmKey)}` : ''}`
			}
			else {
				manifestUrl = pkg.update

				baseUrl = new URL(manifestUrl)
				baseUrl.pathname = baseUrl.pathname.slice(0, baseUrl.pathname.lastIndexOf('/') + 1)
				baseUrl = baseUrl.toString()
			}

			let res
			try {
				const opts = { agent: updateAgent, headers: { 'accept-encoding': 'gzip' } }
				if(fromManifest.etag) opts.headers['if-none-match'] = fromManifest.etag
				res = await httpAsync(https, 'get', manifestUrl, opts)
			}
			catch(e) {
				if(e.statusCode === 304) return true
				throw e
			}

			toManifest = parseManifest(pkg, await getBody(res))

			if(!toManifest.url) toManifest.url = baseUrl
			toManifest.etag = res.headers.etag

			await this.updatePackage(pkg, fromManifest, toManifest)
			return true
		}
		catch(e) {
			log.error(`Failed to update ${log.color('1', name)}`)
			if(e.request) log.error(e.message)
			else log.error(e)
			return false
		}
	}

	async updatePackage(pkg, fromManifest, toManifest) {
		const filesNew = diffNew(fromManifest.data, toManifest.data),
			filesDeleted = diffDeleted(fromManifest.data, toManifest.data)

		if(!filesNew.length && !filesDeleted.length) {
			// There were no changes, so just silently update local manifest
			await callAsync(fs, 'writeFile', path.join(pkg._path, 'manifest.json'), JSON.stringify(toManifest))
			return
		}

		log.info(`${log.color('1', pkg.name)}: ${filesNew.length} changed, ${filesDeleted.length} deleted`)

		// Download files in parallel
		const downloaded = await downloadFiles(toManifest, filesNew.filter(file => !file.endsWith('/') && file !== 'manifest.json'))

		// Create directories
		await ensureDirs(pkg._path, filesNew)

		// Write new files / delete old ones in parallel
		const promises = new Set()
		promises.add(callAsync(fs, 'writeFile', path.join(pkg._path, 'manifest.json'), JSON.stringify(toManifest)))
		for(let [file, data] of downloaded) promises.add(callAsync(fs, 'writeFile', path.join(pkg._path, file), data))
		for(let file of filesDeleted)
			promises.add(callAsync(fs, 'unlink', path.join(pkg._path, file)).catch(e => { if(e.code !== 'ENOENT') throw e }))
		await Promise.all(promises)

		log.info(`Updated ${log.color('1', pkg.name)}`)

		this.packages.delete(pkg.name)
		this.loadPackage(pkg._path)
	}

	preloadMod(name) {
		if(this.brokenMods.has(name)) return false
		try {
			if(typeof require(this.resolve(name)) !== 'function') throw Error('Mod does not export a constructor')
			return true
		}
		catch(e) {
			this.brokenMods.add(name)
			log.error(`Failed to preload mod "${name}"`)
			log.error(e)
			return false
		}
	}
}

function getSafeName(name, isDir) {
	if(!isDir) name = path.basename(name, path.extname(name))
	name = name.replace(/\./g, '_').replace(/[^0-9a-zA-Z\-_]/g, '').slice(0, 50)
	return name || 'bad-name'
}

function parseGithubUrl(url) {
	let match = /^github:([^/]+)\/([^/@]+)(?:@(.+))?$/.exec(url)
		|| /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+?)\/$/.exec(url)
	if(match) {
		match.shift()
		return [...match]
	}
	return null
}

function parseManifest(pkg, data) {
	let manifest = JSON.parse(data.toString())
	if(pkg._compat === 2) manifest = manifestFromCaali(manifest)
	return manifest
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

async function downloadFiles(manifest, files) {
	const getOpts = { agent: updateAgent, headers: { 'accept-encoding': 'gzip' } },
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

// TODO: Move these to a proper utilities library
function pluralize(number, noun, ext, extNon) { return `${number} ${noun + (number !== 1 ? (ext || 's') : (extNon || ''))}` }
function strOrUndef(v) { return v != null ? String(v) : undefined }

function callAsync(lib, func, ...args) {
	return new Promise((resolve, reject) => {
		lib[func](...args, (err, rtn) => { err ? reject(err) : resolve(rtn) })
	})
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

function readStreamAsync(stream) {
	return new Promise((resolve, reject) => {
		const chunks = []
		stream
		.on('data', data => { chunks.push(data) })
		.on('end', () => { resolve(Buffer.concat(chunks)) })
		.on('error', reject)
	})
}

class Stats {
	constructor() { Object.assign(this, { start: Date.now(), true: 0, false: 0, null: 0 }) }

	update(res) { this[res]++ }

	done(verb, noun, ...etc) {
		log.info(`${verb} ${pluralize(this.true, noun, ...etc)} in ${Date.now() - this.start}ms${
			this.false ? log.color('91', ` (${this.false} failed)`) : ''
		}${this.null ? log.color('90', ` (${this.null} ignored)`) : ''}`)
	}
}

module.exports = ModManager
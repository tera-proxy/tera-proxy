const path = require('path'),
	fs = require('fs'),
	cp = require('child_process'),
	dns = require('dns'),
	url = require('url'),
	http = require('http'),
	https = require('https'),
	zlib = require('zlib')

const proxy = require('http-proxy'),
	xmldom = require('xmldom')

const log = require('./logger')

function asArray(nodes) { return Array.from(nodes || []) }

function modifySlsXml(doc, customServers) {
	const servers = asArray(doc.getElementsByTagName('server'))
	for(let server of servers)
		for(const node of asArray(server.childNodes)) {
			if(node.nodeType !== 1 || node.nodeName !== 'id') continue

			const settings = customServers[node.textContent]
			if(!settings) continue

			if(settings.keepOriginal) server.parentNode.appendChild(server.cloneNode(true))

			for(const n of asArray(server.childNodes)) {
				if(n.nodeType !== 1) continue // ensure type: element

				switch (n.nodeName) {
					case 'ip': {
						n.textContent = settings.ip || '127.0.0.1'
						break
					}

					case 'port': {
						if(settings.port) n.textContent = settings.port
						break
					}

					case 'category': {
						if(settings.keepOriginal) {
							for(const a of asArray(n.attributes)) {
								if(a.name === 'sort') {
									// 0 crowdness makes this server highest priority
									// if there are multiple servers with this ID
									a.value = '0'
									break
								}
							}
						}
						if(customServers.tag) n.textContent = customServers.tag + n.textContent
						break
					}

					case 'name': {
						if(settings.name) {
							for(const c of asArray(n.childNodes))
								if(c.nodeType === 4) { // CDATA_SECTION_NODE
									c.data = settings.name
									break
								}
							for(const a of asArray(n.attributes))
								if(a.name === 'raw_name') {
									a.value = settings.name
									break
								}
						}
						break
					}

					case 'crowdness': {
						if(settings.keepOriginal) {
							for(const a of asArray(n.attributes))
								if(a.name === 'sort') {
									// 0 crowdness makes this server highest priority
									// if there are multiple servers with this ID
									a.value = '0'
									break
								}
						}
						break
					}
				}
			}
		}

	// appease RU sls (prevent conversion to <popup/>)
	for(const server of asArray(doc.getElementsByTagName('server')))
		for(const node of asArray(server.childNodes))
			if(node.nodeType === 1 && node.nodeName === 'popup')
				if(!node.hasChildNodes())
					node.appendChild(doc.createCDATASection(''))

	return new xmldom.XMLSerializer().serializeToString(doc)
}

const errorHandler = {
	warning(msg) { log.warn({err: msg}, 'xml parser warning') },
	error(msg) { log.error({err: msg}, 'xml parser error') },
	fatalError(msg) { log.error({err: msg}, 'xml parser fatal error') }
}

class SlsProxy {
	constructor(opts = {}) {
		const slsUrl = opts.url || 'http://tera.nexon.com/launcher/sls/servers/list.xml'
		const parsed = Object.assign(url.parse(slsUrl), opts)

		this.https = parsed.https || parsed.protocol === 'https:'
		this.host = parsed.hostname
		this.port = Number(parsed.port) || (this.https ? 443 : 80)
		this.path = parsed.pathname || '/'
		this.paths = new Set(Array.isArray(this.path) ? this.path : [this.path])

		this.customServers = opts.customServers || {}

		this.address = opts.address || null
		this.proxy = null
		this.server = null
		this.fetches = new Map()
	}

	addRootCertificate() {
		cp.execFileSync(path.join(__dirname, 'bin/certmgr.exe'), ['-add', path.join(__dirname, 'https/ca.cer'), '-s', '-r', 'localMachine', 'root', '-all'])
	}

	delRootCertificate() {
		cp.execFileSync(path.join(__dirname, 'bin/certmgr.exe'), ['-del', '-c', '-n', 'Pinkie Pie', '-s', '-r', 'localMachine', 'root'])
	}

	async resolve() {
		if(!this.address) {
			const addrs = await new Promise((resolve, reject) => {
				dns.resolve(this.host, (e, addrs) => { e ? reject(e) : resolve(addrs) })
			})
			this.address = addrs[0]
		}
	}

	async fetch() {
		await this.resolve()

		return new Promise((resolve, reject) => {
			const req = (this.https ? https : http).request({
				hostname: this.address || this.host,
				port: this.port,
				path: [...this.paths][0],
				headers: { 'Host': `${this.host}:${this.port}` }
			})

			req.on('response', (res) => {
				const buffer = []

				res.on('error', (err) => {
					// TODO what kind of errors will be here? how should we handle them?
					log.error({ err, req, res }, 'error fetching server list')
				})

				res.on('data', chunk => buffer.push(chunk))

				res.on('end', () => {
					const data = Buffer.concat(buffer).toString('utf8')
					log.debug({ data }, 'received response')

					const parser = new xmldom.DOMParser({ errorHandler })
					const doc = parser.parseFromString(data, 'text/xml')
					if(!doc) {
						callback(new Error('failed to parse document'))
						return
					}

					const servers = {}
					for(const server of asArray(doc.getElementsByTagName('server'))) {
						const serverInfo = {}

						for(const node of asArray(server.childNodes)) {
							if(node.nodeType !== 1) continue
							switch (node.nodeName) {
								case 'id':
								case 'ip':
								case 'port': {
									serverInfo[node.nodeName] = node.textContent
									break
								}

								case 'name': {
									for(const c of asArray(node.childNodes)) {
										if(c.nodeType === 4) { // CDATA_SECTION_NODE
											serverInfo.name = c.data
											break
										}
									}
									break
								}
							}
						}

						if(serverInfo.id) servers[serverInfo.id] = serverInfo
					}

					resolve(servers)
				})
			})

			req.on('error', reject)
			req.end()
		})
	}

	async listen(hostname) {
		await this.resolve()

		return new Promise((resolve, reject) => {
			const proxied = proxy.createProxyServer({ target: `${this.https ? 'https' : 'http'}://${this.address}:${this.port}` })

			proxied.on('proxyReq', proxyReq => {
				const port = (this.port !== 80) ? `:${this.port}` : ''
				proxyReq.setHeader('Host', this.host + port)
			})

			const cb = (req, res) => {
				if(req.url[0] !== '/') return res.end()

				if(this.paths.has(req.url)) {
					const writeHead = res.writeHead,
						write = res.write,
						end = res.end

					const buffer = []

					res.writeHead = (...args) => {
						res.removeHeader('Content-Length')
						writeHead.apply(res, args)
					}

					res.write = chunk => { buffer.push(chunk) }

					res.end = chunk => {
						if(chunk) buffer.push(chunk)

						// TODO doing this all in-memory is pretty not-great
						const gzipped = (res.getHeader('content-encoding') === 'gzip'),
							response = Buffer.concat(buffer),
							decoded = (gzipped ? zlib.gunzipSync(response) : response),
							data = decoded.toString('utf8')

						const doc = new xmldom.DOMParser().parseFromString(data, 'text/xml')
						const transformed = doc
							? modifySlsXml(doc, this.customServers)
							: data // assume xmldom already logged an error

						const out = (gzipped ? zlib.gzipSync(transformed) : transformed)

						write.call(res, out, 'utf8')
						end.call(res)
					}
				}

				proxied.web(req, res, (err) => {
					log.error({ err, req, res }, 'error proxying request')

					res.writeHead(500, err.toString(), { 'Content-Type': 'text/plain' })
					res.end()
				})
			}

			const server = this.https ? https.createServer({key: fs.readFileSync(path.join(__dirname, 'https/sls.key')), cert: fs.readFileSync(path.join(__dirname, 'https/sls.cer'))}, cb) : http.createServer(cb)

			this.proxy = proxied
			this.server = server

			server.listen(this.port, hostname, resolve).on('error', reject)
		})
	}

	close() {
		if(this.proxy) this.proxy.close()
		if(this.server) this.server.close()

		for(const { req } of this.fetches.values()) {
			if(req) {
				req.removeAllListeners('error')
				req.on('error', () => {})
				req.abort()

				const { res } = req
				if(res) {
					res.removeAllListeners('error')
					res.on('error', () => {})
					res.destroy()
				}
			}
		}
		this.fetches.clear()
	}
}

module.exports = SlsProxy

const logRoot = require('log'),
	log = logRoot('proxy')

if(['11.0.0', '11.1.0', '11.2.0', '11.3.0'].includes(process.versions.node)) {
	log.error(`Node.JS ${process.versions.node} contains a critical bug preventing timers from working.
Please install a newer version or revert to 10.14.1 LTS.`)
	process.exit()
}
if(typeof BigInt === 'undefined' || require('module').createRequireFromPath === undefined) {
	log.error(`Your version of Node.JS is outdated.
Please install the latest Current from https://nodejs.org/`)
	process.exit()
}

async function init() {
	const path = require('path'),
		settings = require('../../settings/_tera-proxy_.json')

	log.info(`Node version: ${process.versions.node}, game region: ${settings.region}`)

	if(settings.devWarnings) require('log').level = 'dwarn'

	if(settings.autoUpdate) {
		log.info('Checking for updates')

		try {
			const branch = settings.branch || 'master'

			if(await (new (require('updater'))).update({
				dir: path.join(__dirname, '../..'),
				manifestUrl: `https://raw.githubusercontent.com/tera-proxy/tera-proxy/${branch}/manifest.json`,
				defaultUrl: `https://raw.githubusercontent.com/tera-proxy/tera-proxy/${branch}/`,
			})) {
				log.info('TERA Proxy has been updated. Please restart it to apply changes.')
				return
			}
			log.info('Proxy is up to date')
		}
		catch(e) {
			log.error('Error checking for updates:')
			if(e.request) log.error(e.message)
			else log.error(e)
		}
	}

	const SlsProxy = require('tera-proxy-sls'),
		{ ModManager, Dispatch, Connection, RealClient } = require('tera-proxy-game'),
		{ protocol } = require('tera-data-parser'),
		regions = require('./regions'),
		currentRegion = regions[settings.region]

	if(!currentRegion) {
		log.error('Unsupported region: ' + settings.region)
		return
	}

	const fs = require('fs'),
		net = require('net'),
		dns = require('dns'),
		url = require('url'),
		hosts = require('./hosts')

	const sls = new SlsProxy(currentRegion),
		slsProxyIp = '127.0.0.' + (10 + currentRegion.index)

	// Test if we're allowed to modify the hosts file
	try { hosts.remove() }
	catch(e) {
		switch(e.code) {
			case 'EBUSY':
				log.error(`Hosts file is being locked by another application.

* Completely uninstall any anti-virus software.`)
				break
			case 'EACCES':
				log.error(`Hosts file is set to read-only.

* Make sure no anti-virus software is running.
* Locate "${e.path}", right click the file, click 'Properties', uncheck 'Read-only' then click 'OK'.`)
				break
			case 'EPERM':
				log.error(`Insufficient permission to modify hosts file.

* Make sure no anti-virus software is running.
* Right click TeraProxy.bat and select 'Run as administrator'.`)
				break
			default:
				throw e
		}

		process.exit(1)
	}

	const servers = new Map()

	dns.setServers(['8.8.8.8', '8.8.4.4'])

	// Init
	const modManager = new ModManager({
		modsDir: path.join(__dirname, '..', '..', 'mods'),
		settingsDir: path.join(__dirname, '..', '..', 'settings'),
		autoUpdate: settings.autoUpdateMods
	})

	await modManager.init()

	// Retrieve server list
	let serverList
	try {
		serverList = await sls.fetch()
	}
	catch(e) {
		switch(e.code) {
			case 'ETIMEDOUT':
				log.error(`Server list timed out. Please check your internet connection and try again.`)
				break
			default:
				throw e
		}

		process.exit(1)
	}

	// Create game proxies for all servers
	const customServers = sls.customServers = { tag: currentRegion.tag }
	{
		let i = 0
		for(let id in serverList) {
			const target = serverList[id]

			customServers[id] = {
				ip: '127.0.0.' + (20 + i++),
				port: 9250 + currentRegion.index,
				keepOriginal: true
			}

			const server = net.createServer(socket => {
				const logThis = log(`client ${socket.remoteAddress}:${socket.remotePort}`)

				socket.setNoDelay(true)

				const dispatch = new Dispatch(modManager),
					connection = new Connection(dispatch, { classic: settings.region.split('-')[1] === 'CLASSIC' }),
					client = new RealClient(connection, socket),
					srvConn = connection.connect(client, { host: target.ip, port: target.port })

				logThis.log('connecting')

				connection.dispatch.once('init', () => {
					connection.dispatch.region = settings.region.split('-')[0].toLowerCase()

					dispatch.loadAll()
				})

				socket.on('error', err => {
					if(err.code === 'ECONNRESET') logThis.log('lost connection to client')
					else logThis.warn(err)
				})

				srvConn.on('connect', () => {
					logThis.log(`connected to ${srvConn.remoteAddress}:${srvConn.remotePort}`)
				})

				srvConn.on('error', err => {
					if(err.code === 'ECONNRESET') logThis.log('lost connection to server')
					else logThis.warn(err)
				})

				srvConn.on('close', () => { logThis.log('disconnected') })
			})

			servers.set(id, server)
		}
	}

	// Run SLS proxy
	try {
		await sls.listen(slsProxyIp)
	}
	catch(e) {
		if(e.code === 'EADDRINUSE') {
			log.error('Another instance of TeraProxy is already running, please close it then try again.')
			process.exit()
		}
		if(e.code === 'EACCES') {
			log.error(`Another process is already using port ${sls.port}.\nPlease close or uninstall the application first:\n${require('./netstat')(sls.port)}`)
			process.exit()
		}
		if(e.code === 'EADDRNOTAVAIL') {
			log.error(`Loopback address not available. Restart your computer and try again.

If this does not work:
* Disable your firewall.
* Disable or uninstall any third-party firewall or anti-virus software.`)
			process.exit()
		}
		throw e
	}
	log.info(`${settings.region}-SLS listening on ${slsProxyIp}:${sls.port}`)

	// Run game proxies
	const gameProxyQ = []

	for(let [id, server] of servers)
		gameProxyQ.push(new Promise((resolve, reject) => {
			server.listen(customServers[id].port, customServers[id].ip, resolve)
			.on('error', reject)
		}).then(() => {
			const address = server.address()
			log.info(`${settings.region}-${id} listening on ${address.address}:${address.port}`)
		}))

	try {
		await Promise.all(gameProxyQ)
	}
	catch(e) {
		if(e.code === 'EACCES') {
			let port = customServers[0].port
			log.error(`Another process is already using port ${port}.\nPlease close or uninstall the application first:\n${require('./netstat')(port)}`)
			return require('./netstat')(port)
		}
		throw e
	}

	hosts.set(slsProxyIp, sls.host)
	log.info('Added hosts file entry')

	if(sls.https) {
		sls.addRootCertificate()
		log.info('Added SLS root certificate')
	}

	log.info('OK')

	// Exit/crash handlers

	function cleanup() {
		try { hosts.remove(sls.host) } catch(e) {}

		if(sls.https)
			try { sls.delRootCertificate() } catch(e) {}

		sls.close()
		for(let server of servers.values()) server.close()
	}

	function cleanExit() {
		log.info('Terminating...')
		cleanup()
		process.exit()
	}

	process.on('SIGHUP', cleanExit)
	process.on('SIGINT', cleanExit)
	process.on('SIGTERM', cleanExit)

	process.on('uncaughtException', e => {
		logRoot.error(e)
		cleanup()
		process.exitCode = 1
	})
}

init()
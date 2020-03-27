// Waits for proxy to exit and then terminates. Intended for use by self-updater batch script

'use strict'

const net = require('net')

;(async () => {
	while(true)
		try {
			await new Promise((resolve, reject) => {
				net.createServer().listen('\\\\.\\pipe\\tera-proxy', resolve).on('error', reject)
			})
			process.exit()
		}
		catch {
			await new Promise(resolve => setTimeout(resolve, 100))
		}
})()
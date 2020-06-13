'use strict'

const fs = require('fs'),
	path = require('path'),
	crypto = require('crypto')

const [,, base, privateKeyFile] = process.argv,
	manifestFile = path.resolve(base, 'manifest.json'),
	manifest = require(manifestFile),
	privateKey = crypto.createPrivateKey({ key: fs.readFileSync(privateKeyFile), type: 'pkcs8', format: 'der' })

manifest.publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64')
manifest.signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest.data)), privateKey).toString('base64')

fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, '\t'))
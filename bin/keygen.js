'use strict'

const fs = require('fs'),
	path = require('path'),
	crypto = require('crypto')

let outFile = process.argv[2]
if(!outFile) {
	console.error('Usage: keygen [output-file]')
	process.exit(1)
}
if(fs.existsSync(outFile)) {
	if(!fs.lstatSync(outFile).isDirectory() || fs.existsSync(outFile = path.join(outFile, 'private.key'))) {
		console.error('Output keyfile already exists')
		process.exit(1)
	}
}
outFile = path.resolve(outFile)

const keyPair = crypto.generateKeyPairSync('ed25519', {
	publicKeyEncoding: { type: 'spki', format: 'der' },
	privateKeyEncoding: { type: 'pkcs8', format: 'der' }
})

fs.writeFileSync(outFile, keyPair.privateKey)

console.log(`Private key: ${outFile}`)
console.log(`Public key: ${keyPair.publicKey.toString('base64')}`)
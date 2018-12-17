'use strict'

const fs = require('fs'),
	path = require('path'),
	crypto = require('crypto')

const startTime = Date.now()

let count = 0

function generate(base) {
	const manifest = {}
	addDir(manifest, base, '')
	delete manifest['manifest.json']
	return manifest
}

function addDir(manifest, base, relDir) {
	const absDir = path.join(base, relDir)

	for(let file of fs.readdirSync(absDir))
		if(file !== '.git') {
			const absFile = path.join(absDir, file),
				relFile = relDir ? `${relDir}/${file}` : file

			if(fs.lstatSync(absFile).isDirectory()) addDir(manifest, base, relFile)
			else {
				manifest[relFile] = crypto.createHash('sha256').update(fs.readFileSync(absFile)).digest().toString('base64')
				count++
			}
		}
}

const base = process.argv[2],
	manifest = { data: generate(base) }

console.log(`Added ${count} file(s) in ${Date.now() - startTime}ms`)

fs.writeFileSync(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, '\t'))

console.log('Done!')
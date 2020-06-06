'use strict'

const fs = require('fs')

const [,, inFile, outFile] = process.argv

if(!inFile || !outFile) {
	console.log('Usage: gendoc [inFile] [outFile]')
	return
}

let meta = { title: '', body: '' },
	properties = new Map(),
	methods = new Map()

const lines = fs.readFileSync(inFile, 'utf8').split('\n')
for(let i = 0, blockComment = false, obj = null; i < lines.length; i++) {
	let line = lines[i].trim()

	let inComment = blockComment
	if(line.startsWith(`/*`)) {
		blockComment = inComment = true
		line = line.slice(2).trim()
	}
	else if(line.endsWith('*/')) {
		blockComment = false
		obj = null
	}

	if(inComment)
		if(!obj) { // First line
			if(line.startsWith('@@')) obj = meta = { title: line.slice(2), body: '' }
			else if(line.startsWith('#')) properties.set(line.slice(1), obj = { body: '' })
			else if(line.startsWith('@')) {
				const parts = line.slice(1).split(':').map(p => p.trim())
				methods.set(parts[0], obj = { args: parts[1], body: '' })
			}
		}
		else obj.body += `\n${line.startsWith('/') ? line.slice(1) : line}`
}

let doc = `#${meta.title}${meta.body}`

if(properties.size) {
	doc += `\n##Properties`
	for(let [name, { body }] of [...properties].sort((a, b) => a[0].localeCompare(b[0]))) {
		doc += `\n###\`${name}\``
		doc += replaceRefs(body)
	}
}

if(methods.size) {
	doc += `\n##Methods`
	for(let [name, { args, body }] of [...methods].sort((a, b) => a[0].localeCompare(b[0]))) {
		doc += `\n###\`${name}()\``
		if(args) doc += `\n**Arguments:** \`${args}\``
		doc += replaceRefs(body)
	}
}

function replaceRefs(str) {
	return str
		.replace(/#([^\s()/:,.]+)/g, (m, name) => `\`${name}\``)
		.replace(/@([^\s()/:,.]+)/g, (m, name) => `[${name}()](#${name})`)
}

fs.writeFileSync(outFile, doc)
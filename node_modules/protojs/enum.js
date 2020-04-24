'use strict'

const fs = require('fs')

module.exports = function parse(str, nameObj) {
	const lines = str.split('\n'),
		map = {
			name: nameObj ? Object.create(null) : new Map(),
			code: new Map()
		}

	for(let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/#.*/, '').trim()

		if(!line) continue

		const match = line.match(/^(\S+)(?:\s+|\s*=\s*)(\d+)$/)
		if(!match) throw Error(`Malformed line (line ${i + 1})`)

		const name = match[1],
			code = Number(match[2])

		if(nameObj) map.name[name] = code
		else map.name.set(name, code)

		map.code.set(code, name)
	}

	return map
}
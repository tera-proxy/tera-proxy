'use strict'

const fs = require('fs')

module.exports = function parse(path, nameObj) {
	const lines = fs.readFileSync(path, 'utf8').split('\n'),
		map = {
			name: nameObj ? Object.create(null) : new Map(),
			code: new Map()
		}

	for(let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/#.*/, '').trim()

		if(!line) continue

		const match = line.match(/^(\S+)(?:\s+|\s*=\s*)(\S+)$/)
		if(!match) {
			console.warn(`[parsers/enum] Error: Malformed line\n    at (${path}:${i + 1})`)
			continue
		}

		const name = match[1],
			code = parseInt(match[2])
		if(isNaN(code)) {
			console.warn(`[parsers/enum] Error: Non-numeric code\n    at (${path}:${i + 1})`)
			continue
		}

		if(nameObj) map.name[name] = code
		else map.name.set(name, code)

		map.code.set(code, name)
	}

	return map
}
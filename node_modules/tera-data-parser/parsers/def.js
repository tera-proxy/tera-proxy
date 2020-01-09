'use strict'

const fs = require('fs'),
	path = require('path')

function parse(str, includeDir) {
	const lines = str.split(/\r?\n/),
		root = ['object', []],
		stack = [root[1]]

	let includeCount = 0,
		target = stack[0]

	str = null // garbage collect

	for(let i = 0; i < lines.length; i++) {
		try {
			const line = lines[i].replace(/#.*$/, '').trim()
			if(!line) continue // Ignore empty lines

			{
				const match = line.match(/^@include\s+(.+)$/)
				if(match) {
					if(!includeDir) throw Error('No include directory specified')
					if(++includeCount > 5) throw Error('Too many includes') // Prevents infinite loops

					lines.splice(i--, 1, ...fs.readFileSync(path.join(includeDir, match[1]), 'utf8').split(/\r?\n/))
					continue
				}
			}

			const match = line.match(/^((?:-\s*)*)(\S+)\s+(\S+?)(?:=(\S+))?(?:\s+\^([^-]+)(?:-(\S+))?)?$/)
			if(!match) throw Error('Malformed line')

			const depth = match[1].replace(/[^-]/g, '').length + 1,
				typeInfo = parseType(match[2]),
				key = match[3],
				init = match[4] || null,
				version = [Number(match[5]) || 0, Number(match[6]) || Infinity]

			if(depth > stack.length) {
				const inner = getInnerType(target[target.length - 1]),
					props = []

				inner[1] = inner[0] === 'object' ? props : ['object', props]
				stack.push(props)
				target = stack[stack.length - 1]

				if(depth > stack.length) throw Error('Array nesting too deep')
			}
			else {
				while(depth < stack.length) stack.pop()
				target = stack[stack.length - 1]
			}

			getInnerType(typeInfo).push(init)
			target.push([key, typeInfo, version])
		}
		catch(e) {
			e.message += ` (line ${i + 1})`
			throw e
		}
	}

	return root
}

function compile(root, proto) {
	return proto.compile(cloneType(root, proto.gameVersion))
}

// [type, subType]
function cloneType(arr, gameVersion) {
	if(!arr) return null
	const out = [arr[0], (arr[0] === 'object' ? cloneProps : cloneType)(arr[1], gameVersion)]
	if(arr[2]) out.push(arr[2])
	return out
}

// [field1, field2, ...]
function cloneProps(arr, gameVersion) {
	if(!arr) return null
	return arr
		.filter(field => gameVersion >= field[2][0] && gameVersion < field[2][1])
		.map(field => cloneField(field, gameVersion))
}

// [key, typeInfo, versionInfo]
function cloneField(arr, gameVersion) {
	return [arr[0], cloneType(arr[1], gameVersion)] // Omit versionInfo
}

function parseType(str) {
	const self = [str, null]
	let outer = self,
		match = null

	while(match = /\[(\d+)\]$/.exec(str)) { // Fixed-length array(s)
		outer = [Number(match[1]), outer]
		str = str.slice(0, match.index)
	}

	if(match = /<(\S+)>$/.exec(str)) { // Nested type
		self[1] = parseType(match[1])
		str = str.slice(0, match.index)
	}

	self[0] = str

	return outer
}

function getInnerType(typeInfo) {
	while(typeInfo[0] !== 'object' && typeInfo[1]) typeInfo = typeInfo[1]

	return typeInfo
}

module.exports = { parse, compile }
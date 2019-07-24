'use strict'

const util = require('util')

const LOG_LEVELS = [
		{ alias: ['trace'], prefix: 'Trace:', color: '35' },
		{ alias: ['debug'], prefix: 'Debug:', color: '36' },
		{ alias: ['dwarn', 'deprecate', 'deprecated', 'deprecation'], prefix: 'DeprecationWarning:', color: '33' },
		{ alias: ['info', 'log'], prefix: 'Info:', color: '32' },
		{ alias: ['warn'], prefix: 'Warning:', color: '93' },
		{ alias: ['error'], prefix: 'Error:', color: '91' },
		{ alias: ['fatal'], prefix: 'Fatal:', color: '97;101' }
	],
	COLOR_SUPPORT = process.stdout.isTTY,
	kConstructor = Symbol(),
	kResolve = Symbol(),
	kWrite = Symbol(),
	kLevel = Symbol()

class Log {
	constructor() { return this[kConstructor].call(null, ...arguments) }

	// Recursive pseudo-constructor whose return value can be called to construct a child instance
	[kConstructor](name) {
		const child = function Log() { return child[kConstructor](...arguments) }
		delete child.name
		Object.setPrototypeOf(child, Log.prototype)

		// Internal constructor
		Object.assign(child, typeof name === 'string' ? {name} : name, { parent: this })
		return child
	}

	get level() { return LOG_LEVELS[this[kLevel]].alias[0] }
	set level(name) {
		for(let i = 0; i < LOG_LEVELS.length; i++)
			if(LOG_LEVELS[i].alias.includes(name)) {
				this[kLevel] = i
				return
			}

		delete this[kLevel]
	}

	// Recursively resolves the specified property
	[kResolve](key) {
		const val = this[key]
		return val === undefined && this.parent ? this.parent[kResolve](key) : val
	}

	// Writes a message to the console (process.stdout)
	[kWrite](level, msg = '') {
		if(level < this[kResolve](kLevel)) return

		const date = new Date()

		if(typeof msg !== 'string') msg = util.inspect(msg, {colors: COLOR_SUPPORT})

		let timeStr = `${padNum(date.getHours(), 2)}:${padNum(date.getMinutes(), 2)}:${padNum(date.getSeconds(), 2)}`
		if(this[kResolve]('preciseTime')) timeStr += `.${padNum(date.getMilliseconds(), 3)}` 

		const tag = this[kResolve]('name')

		console.log(`${this.color('90', timeStr)} ${this.color((level = LOG_LEVELS[level]).color, level.prefix)} ${tag ? `[${tag}] ` : ''}${msg}`)
	}

	color(id, str) { return COLOR_SUPPORT ? `\x1b[${id}m${str}\x1b[0m` : str }
}

function padNum(n, len) { return n.toString().padStart(len, '0') }

for(let i = 0; i < LOG_LEVELS.length; i++) {
	const level = i

	for(let alias of LOG_LEVELS[i].alias) Log.prototype[alias] = function(msg) { this[kWrite](level, msg) }
}

module.exports = new Log({level: 'info'})
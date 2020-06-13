'use strict'

const util = require('util')

const LOG_LEVELS = [
		{ alias: ['trace'], prefix: 'Trace:', color: 'magenta' },
		{ alias: ['debug'], prefix: 'Debug:', color: 'cyan' },
		{ alias: ['dwarn', 'deprecate', 'deprecated', 'deprecation'], prefix: 'DeprecationWarning:', color: 'yellow' },
		{ alias: ['info', 'log'], prefix: 'Info:', color: 'green' },
		{ alias: ['warn'], prefix: 'Warning:', color: 'syellow' },
		{ alias: ['error'], prefix: 'Error:', color: 'sred' },
		{ alias: ['fatal'], prefix: 'Fatal:', color: 'stext,bg-sred' }
	],
	COLOR_TO_ANSI = {
		text: 37,
		stext: 97,
		bg: 30,
		sbg: 30,
		gray: 90,
		red: 31,
		sred: 91,
		green: 32,
		sgreen: 92,
		blue: 34,
		sblue: 94,
		yellow: 33,
		syellow: 93,
		magenta: 35,
		smagenta: 95,
		cyan: 36,
		scyan: 96,
		'bg-text': 47,
		'bg-stext': 107,
		'bg-gray': 100,
		'bg-red': 41,
		'bg-sred': 101,
		'bg-green': 42,
		'bg-sgreen': 102,
		'bg-blue': 44,
		'bg-sblue': 104,
		'bg-yellow': 43,
		'bg-syellow': 103,
		'bg-magenta': 45,
		'bg-smagenta': 105,
		'bg-cyan': 46,
		'bg-scyan': 106
	},
	ANSI_TO_COLOR = Object.entries(COLOR_TO_ANSI).reduce((map, [key, value]) => (map[value] = key, map), {}),
	kConstructor = Symbol('constructor'),
	kResolve = Symbol('resolve'),
	kWrite = Symbol('write'),
	kLevel = Symbol('level')

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

	// Formats output and passes it to the write handler
	[kWrite](level, msg = '') {
		if(level < this[kResolve](kLevel)) return

		const date = new Date()

		if(typeof msg !== 'string')
			// Replace ANSI color sequences with color() calls so that they may be overridden
			msg = util.inspect(msg, { colors: true }).replace(/\x1b\[([\d;]+)m(.+?)\x1b\[[\d;]+m/g,
				(m, ansi, str) => this.color(ansi.split(';').map(id => ANSI_TO_COLOR[id]).join(','), str)
			)

		let timeStr = `${padNum(date.getHours(), 2)}:${padNum(date.getMinutes(), 2)}:${padNum(date.getSeconds(), 2)}`
		if(this[kResolve]('preciseTime')) timeStr += `.${padNum(date.getMilliseconds(), 3)}` 

		const tag = this[kResolve]('name')

		this.write(`${this.color('gray', timeStr)} ${this.color((level = LOG_LEVELS[level]).color, level.prefix)} ${tag ? `[${tag}] ` : ''}${msg}`)
	}

	// Writes a message to the console (process.stdout) - Can be overridden
	write(msg) { console.log(msg) }

	color(colors, str) {
		if(!process.stdout.isTTY) return str

		let ansi = ''
		for(let color of colors.split(',')) {
			color = COLOR_TO_ANSI[color] ?? (/^[\d;]+$/.test(color) ? color : null)
			if(color) ansi += (!ansi ? '' : ';') + color
		}

		return !ansi ? str : `\x1b[${ansi}m${str}\x1b[0m`
	}
}

function padNum(n, len) { return n.toString().padStart(len, '0') }

for(let i = 0; i < LOG_LEVELS.length; i++) {
	const level = i

	for(let alias of LOG_LEVELS[i].alias) Log.prototype[alias] = function(msg) { this[kWrite](level, msg) }
}

module.exports = new Log({level: 'info'})
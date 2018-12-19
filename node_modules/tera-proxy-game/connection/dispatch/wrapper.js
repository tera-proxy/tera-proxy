const logger = require('log'),
	path = require('path'),
	Settings = require('./settings')

const kTimers = Symbol(),
	kSettings = Symbol()

const UNLOADED_PROTO = (() => {
	const error = (obj, key) => { throw Error(`Attempting to access property "${key}" after being unloaded`) }
	return new Proxy(Object.create(null), { get: error, set: error })
})()

class ModWrapper {
	constructor(modConstructor, info, dispatch) {
		const log = logger(info.name)

		Object.assign(this, {
			info,
			dispatch,
			name: info.name,
			log
		})

		this[kTimers] = new Set()
		this[kSettings] = new Settings(path.join(dispatch.modManager.settingsDir, this.name + '.json'), this.name)

		// Caali-proxy compatibility
		if(info._compat === 2) {
			Object.defineProperties(this, {
				activeTimeouts: {configurable: true, get() { return new Set([...this[kTimers]].filter(t => !t._repeat)) }},
				activeIntervals: {configurable: true, get() { return new Set([...this[kTimers]].filter(t => t._repeat)) }},
				command: {configurable: true, get() { return dispatch.require.command }},
				game: {configurable: true, get() {
					try {
						return dispatch.require['tera-game-state']
					}
					catch(e) {
						log.error('Please install tera-game-state:\n    https://github.com/caali-hackerman/tera-game-state')
						throw e
					}
				}},
			})

			Object.assign(this, {
				info: info._compatInfo,
				options: info._compatInfo.options,
				niceName: info._compatInfo.options.niceName,
				rootFolder: info._path,

				manager: {
					get: name => this.dispatch.loadedMods.get(name),
					isLoaded: name => this.isLoaded(name)
				},

				// Timers
				clearAllTimeouts() { for(let t of this[kTimers]) if(!t._repeat) this.clearTimeout(t) },
				clearAllIntervals() { for(let t of this[kTimers]) if(t._repeat) this.clearTimeout(t) },

				// Old functions
				tryHook(...args) { try { return this.hook(...args) } catch(e) { return null } },
				tryHookOnce(...args) { try { return this.hookOnce(...args) } catch(e) { return null } },
				trySend(...args) { try { return this.send(...args) } catch(e) { return false } },

				// Logging
				log(msg, ...args) { console.log(`[${this.name}] ${msg}`, ...args) },
				warn(msg, ...args) { console.log(`[${this.name}] Warning: ${msg}`, ...args) },
				error(msg, ...args) { console.log(`[${this.name}] Error: ${msg}`, ...args) },

				// Settings
				saveSettings() {}
			})

			// Settings migration
			const settingsVersion = this.options.settingsVersion
			if(settingsVersion)
				try {
					if(this.settings._version !== settingsVersion) {
						this.settings = require(
							path.join(this.rootFolder, this.options.settingsMigrator || 'module_settings_migrator.js')
						)(this.settings._version, settingsVersion, this.settings)
						this.settings._version = settingsVersion
					}
				}
				catch(e) {
					console.log(`[caali-compat] Error migrating settings for "${this.name}"`)
					console.log(e)
				}

 			if(this.name !== 'tera-game-state')
				this.hook('S_RETURN_TO_LOBBY', 'raw', () => {
					for(let t of this[kTimers]) this.clearTimeout(t)
				})
		}

		this.instance = new modConstructor(this)
	}

	destroy(unload) {
		// Clear all timers
		for(let t of this[kTimers]) this.clearTimeout(t)

		try {
			// Call mod-defined destructor
			if(this.instance.destructor) {
				this.instance.destructor(unload)
				return true
			}
		}
		finally {
			// Attempt to dereference as much as possible, hopefully crashing any memory leaked functions
			const instanceUnloadedProto = (() => {
				const modName = this.name,
					error = (obj, key) => { throw Error(`Attempting to access property "${key}" of unloaded mod "${modName}"`) }
				return new Proxy(Object.create(null), { get: error, set: error })
			})()

			Object.setPrototypeOf(this.instance, instanceUnloadedProto)
			Object.setPrototypeOf(this, UNLOADED_PROTO)

			for(let obj of [this.instance, this]) {
				if(typeof obj === 'function') obj.prototype = undefined
				for(let key of Object.getOwnPropertyNames(obj)) try { delete obj[key] } catch(e) {}
				for(let key of Object.getOwnPropertySymbols(obj)) try { delete obj[key] } catch(e) {}
				Object.freeze(obj)
			}
		}
		return false
	}

	get require() { return this.dispatch.require }

	// Note: Calls require to prevent race condition
	isLoaded(name) {
		try {
			this.dispatch.require[name]
			return true
		}
		catch(e) { return false }
	}

	get settings() { return this[kSettings].root }
	set settings(obj) {
		this[kSettings].loadRoot(obj)
		this[kSettings].changed()
	}

	setTimeout(cb, ms, ...args) {
		const timers = this[kTimers],
			t = setTimeout(function () {
				timers.delete(t)
				cb(...args)
			}, Math.floor(ms))

		timers.add(t)
		return t
	}

	setInterval(cb, ms, ...args) {
		const t = setInterval(cb, Math.floor(ms), ...args)
		this[kTimers].add(t)
		return t
	}

	clearTimeout(t) {
		clearTimeout(t)
		this[kTimers].delete(t)
	}

	hook(...args) { return this.dispatch.hook(this.name, ...args) }

	hookOnce(...args) {
		const cb = args.pop()
		if(typeof cb !== 'function') throw Error('last argument not a function')

		const dispatch = this.dispatch
		return this.hook(...args, function(...hookArgs) {
			dispatch.unhook(this)
			return cb.call(this, ...hookArgs)
		})
	}

	hookAsync(...args) {
		return new Promise((resolve, reject) => {
			this.hookOnce(...args, event => {
				if(event) resolve(event)
				else reject(Error('Hook timed out'))
			})
		})
	}

	unhook(...args) { return this.dispatch.unhook(...args) }

	send(name, version, data) {
		if(typeof name !== 'string') throw TypeError('Raw send() is not supported')

		switch(name[0]) {
			case 'C':
				return this.dispatch.write(true, name, version, data)
			case 'I':
			case 'S':
				return this.dispatch.write(false, name, version, data)
			default:
				throw Error(`Unknown packet direction: ${name}`)
		}
	}

	toClient(...args) { return this.dispatch.write(false, ...args) }
	toServer(...args) { return this.dispatch.write(true, ...args) }

	parseSystemMessage(...args) { return this.dispatch.parseSystemMessage(...args) }
	buildSystemMessage(...args) { return this.dispatch.buildSystemMessage(...args) }

	get protocolVersion() { return this.dispatch.protocolVersion }
	get region() { return this.dispatch.region }
	get patchVersion() { return this.dispatch.getPatchVersion() }
	get majorPatchVersion() { return this.dispatch.majorPatchVersion }
	get minorPatchVersion() { return this.dispatch.minorPatchVersion }
}

// Assign aliases
(function() {
	Object.assign(this, {
		clearInterval: this.clearTimeout
	})
}).call(ModWrapper.prototype)

module.exports = ModWrapper
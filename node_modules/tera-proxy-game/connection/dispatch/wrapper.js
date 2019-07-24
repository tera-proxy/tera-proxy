const logger = require('log'),
	path = require('path'),
	Settings = require('./settings'),
	Hotswap = require('./hotswap')

const kTimers = Symbol(),
	kSettings = Symbol()

const UNLOADED_PROTO = (() => {
	const error = (obj, key) => { throw Error(`Attempting to access property "${key}" after being unloaded`) }
	return new Proxy(Object.create(null), { get: error, set: error })
})()

class ModWrapper {
	constructor(modConstructor, info, dispatch, hotswapProxy) {
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

			const dispatchOverride = {
				protocol: require('tera-data-parser').protocol,
				moduleManager: {
					get: name => dispatch.loadedMods.get(name),
					isLoaded: name => this.isLoaded(name)
				},
				fromRaw: dispatch.parse,
				toRaw: dispatch.serialize
			}

			Object.assign(this, {
				dispatch: new Proxy(dispatch, { get: (obj, key) => dispatchOverride[key] || obj[key] }),

				info: info._compatInfo,
				options: info._compatInfo.options,
				niceName: info._compatInfo.options.niceName,
				rootFolder: info._path,
				isClassic: this.patchVersion < 28,
				platform: this.patchVersion < 28 ? 'classic' : 'pc',
				manager: dispatchOverride.moduleManager,

				// Timers
				clearAllTimeouts() { for(let t of this[kTimers]) if(!t._repeat) this.clearTimeout(t) },
				clearAllIntervals() { for(let t of this[kTimers]) if(t._repeat) this.clearTimeout(t) },

				// Old functions
				tryHook(...args) { try { return this.hook(...args) } catch(e) { return null } },
				tryHookOnce(...args) { try { return this.hookOnce(...args) } catch(e) { return null } },
				trySend(...args) { try { return this.send(...args) } catch(e) { return false } },

				// Logging
				log(...msg) { log.info(msg.join(' ')) },
				warn(...msg) { log.warn(msg.join(' ')) },
				error(...msg) { log.error(msg.join(' ')) },

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
						)(this.settings._version || null, settingsVersion, this.settings)
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

			// Workaround improper usage
			if(this.info.servers && this.info.servers.some(s =>
				/^https:\/\/raw\.githubusercontent\.com\/(caali-hackerman|tera-toolbox(-mods)?)\//i.test(s.toLowerCase())
			))
				dispatchOverride.proxyAuthor = this.proxyAuthor = 'caali'
		}

		if(info.reloadable) {
			if(hotswapProxy) {
				const instance = new modConstructor(this)

				if(typeof instance !== typeof hotswapProxy)
					throw TypeError(`Cannot hotswap to different type: ${typeof instance} (expected ${typeof hotswapProxy})`)

				this.instance = hotswapProxy
				this.instance.__target__ = instance
			}
			else this.instance = Hotswap(new modConstructor(this))
		}
		else this.instance = new modConstructor(this)
	}

	destroy(multiPass) {
		try {
			if(multiPass !== 2) {
				// Flush any changed settings to disk
				this[kSettings].flush()

				// Clear all timers
				for(let t of this[kTimers]) this.clearTimeout(t)

				// Call mod-defined destructor
				if(this.instance.destructor) {
					this.instance.destructor()
					return true
				}
			}
		}
		finally {
			// Attempt to dereference as much as possible, hopefully crashing any memory leaked functions
			if(multiPass !== 1) {
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
				}

				Object.freeze(this)
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

	reload(name) { return this.dispatch.reload(name) }

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

	parse(...args) { return this.dispatch.parse(...args) }
	serialize(...args) { return this.dispatch.serialize(...args) }

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
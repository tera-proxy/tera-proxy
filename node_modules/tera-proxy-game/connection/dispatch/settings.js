const SAVE_INTERVAL = 10000

const fs = require('fs')

function autoMigrate(settings, defaults, version) {
	const old = Object.assign({}, settings)

	for(let key in settings) delete settings[key]

	if(version !== undefined) settings._version = version

	for(let key in defaults) {
		const oldValue = old[key],
			defValue = defaults[key]

		settings[key] = oldValue === undefined ? defValue : 
			typeof defValue === 'object' && defValue !== null && Object.keys(defValue).length
				? autoMigrate(oldValue, defValue) : oldValue
	}

	return settings
}

class SettingsRoot {
	$init(opts) {
		if(opts.version == null) throw TypeError('Must specify version')
		if(opts.defaults == null) throw TypeError('Must specify defaults')

		if(this._version !== opts.version) {
			if(this._version == null)
				for(let key in this) delete this[key]
			else if(opts.migrate)
				try {
					opts.migrate.call(this, this._version)
				}
				catch(e) {
					console.log('Error in migrate() - Using default settings')
					console.log(e)
				}

			autoMigrate(this, opts.defaults, opts.version)
		}
	}
}

class Settings {
	constructor(path, modName) {
		this.path = path
		this.modName = modName
		this.root = null
		this.dirty = false
		this.saving = false
		this.saveTimeout = null

		this.load()
	}

	loadRoot(obj) {
		this.root = this.createProxy(new SettingsRoot)
		Object.assign(this.root, obj)
	}

	createProxy(target = Object.create(null)) {
		return new Proxy(target, {
			set: (obj, key, value) => {
				this.changed()
				value = typeof value === 'object' && value !== null ? this.createProxy(value) : value
				return Reflect.set(obj, key, value)
			},
			defineProperty() { throw Error('Cannot define property on settings') },
			deleteProperty: (obj, key) => {
				this.changed()
				return Reflect.deleteProperty(obj, key)
			}
		})
	}

	changed() {
		this.dirty = true
		if(!this.saveTimeout) this.saveTimeout = setTimeout(() => { this.save() }, SAVE_INTERVAL)
	}

	save() {
		clearTimeout(this.saveTimeout)
		this.dirty = false
		this.saving = true
		fs.writeFile(this.path, this.toString(), e => {
			if(this.dirty) this.save()
			else {
				this.saving = false
				this.saveTimeout = null
			}
		})
	}

	flush() {
		clearTimeout(this.saveTimeout)
		if(this.dirty && !this.saving) { // Prevent disk conflict resulting in corrupted file
			this.dirty = false
			try {
				fs.writeFileSync(this.path, this.toString())
			}
			catch(e) {}
		}
	}

	load() {
		try {
			this.loadRoot(JSON.parse(fs.readFileSync(this.path, 'utf8')))
		}
		catch(e) {
			if(e.code === 'ENOENT') this.loadRoot()
			else {
				console.error(`Error loading settings for mod "${this.modName}":`)
				console.error(e)
			}
		}
	}

	toString() { return JSON.stringify(this.root, null, '\t') }
}

module.exports = Settings
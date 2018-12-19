const SAVE_INTERVAL = 10000

const fs = require('fs')

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
		this.root = this.createProxy()
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
class Game {
	constructor(mod) {
		this.mod = mod
		this._inventory = null
	}

	// Lazy load - TODO: Prevent loading after login
	get inventory() {
		return this._inventory || (this._inventory = new (require('./lib/inventory'))(this))
	}
}

module.exports = Game
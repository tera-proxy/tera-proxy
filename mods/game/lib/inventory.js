const EventEmitter = require('events')

const kReset = Symbol(),
	kInventory = Symbol()

class Inventory extends EventEmitter {
	constructor(game) {
		super()
		this.setMaxListeners(0)

		this.game = game
		const mod = this.mod = game.mod
		this[kReset]()

		if(mod.patchVersion < 85) {
			mod.hook('S_INVEN', 19, {order: -Infinity}, event => {
				if(event.gameId !== this._gameId) return // Ignore packets from admin tool etc.

				// TODO: Add fixed arrays to parser, then upgrade def
				for(let item of event.items) {
					item.crystals = []
					for(let c of ['crystal1', 'crystal2', 'crystal3', 'crystal4', 'crystal5']) {
						const id = item[c]
						if(id) item.crystals.push(id)
						delete item[c]
					}
				}

				this[kInventory] = event.first ? event.items : this[kInventory].concat(event.items)

				// Once we've received all the parts, re-calculate user-facing data & fire event
				if(!event.more) {
					this.gold = event.gold
					this.tcat = event.tcat
					this.size = event.size

					this.items = []
					this.equipment.clear()
					for(let item of this[kInventory])
						if(item.slot >= 40)
							this.items.push(Object.assign(item, { slot: item.slot - 40, inventory: 0 }))
						else
							this.equipment.set(item.slot, Object.assign(item, { inventory: 14 }))

					this.emit('update')
				}
			})
		}
		else {
			mod.hook('S_INVEN_USERDATA', 1, {order: -Infinity}, event => {
				if(event.gameId !== this._gameId) return

				this.tcat = event.tcat
			})

			mod.hook('S_ITEMLIST', 1, {order: -Infinity}, event => {
				if(event.gameId !== this._gameId) return // Ignore packets from admin tool etc.

				for(let item of event.items)
					Object.assign(item, { inventory: event.container, pocket: event.pocket })

				let inventory = this[kInventory].get(event.container)
				if(!inventory) this[kInventory].set(event.container, inventory = new Map())

				if(event.first)
					inventory.set(event.pocket, {
						size: event.size,
						items: event.items
					})
				else {
					let pocket = inventory.get(event.pocket)
					pocket.items = pocket.items.concat(event.items)
				}

				// Once we've received all the parts, re-calculate user-facing data & fire event
				if(!event.more && event.lastInBatch) {
					this.gold = event.money

					this.size = 0
					this.items = []
					this.equipment.clear()
					for(let [i, inventory] of this[kInventory])
						for(let [p, pocket] of inventory)
							switch(i) {
								case 0:
									this.size += pocket.size
									this.items = this.items.concat(pocket.items)
									break
								case 14:
									if(p === 0)
										for(let item of pocket.items) this.equipment.set(item.slot, item)
									break
							}

					this.emit('update')
				}
			})
		}

		// TODO: Move to own library
		this._gameId = null
		this._location = null
		mod.hook('S_LOGIN', 13, {order: -Infinity}, event => { this._gameId = event.gameId })
		mod.hook('S_RETURN_TO_LOBBY', 'raw', {order: -Infinity}, () => { this[kReset]() })
		mod.hook('S_SPAWN_ME', 3, {order: -Infinity}, event => { this._location = event })
		mod.hook('C_PLAYER_LOCATION', 5, {order: Infinity}, event => { this._location = event })
	}

	[kReset]() {
		this[kInventory] = new Map()
		this.gold = 0n
		this.tcat = 0n
		this.size = 0
		this.items = []
		this.equipment = new Map()
	}

	has(id) { return this.items.some(item => item.id === id) }
	findAll(id) { return this.items.filter(item => item.id === id) }

	// Arguments: item || id
	use(item) {
		if(typeof item === 'number') item = {id: item}

		this.mod.send('C_USE_ITEM', 3, {
			gameId: this._gameId,
			id: item.id,
			dbid: item.dbid,
			amount: 1,
			loc: this._location.loc,
			w: this._location.w,
			unk4: true
		})
	}

	delete(item) {
		if(item.inventory !== 0) throw TypeError('Cannot delete item outside of inventory/pockets.')

		this.mod.send('C_DEL_ITEM', this.mod.patchVersion < 85 ? 2 : 3, {
			gameId: this._gameId,
			pocket: item.pocket,
			slot: item.slot,
			amount: item.amount
		})
	}

	merge(itemFrom, itemTo) {
		if(itemFrom.inventory !== 0 || itemTo.inventory !== 0) throw TypeError('Cannot merge item outside of inventory/pockets.')

		this.mod.send('C_MERGE_ITEM', this.mod.patchVersion < 85 ? 1 : 2, {
			pocketFrom: itemFrom.pocket,
			slotFrom: itemFrom.slot,
			pocketTo: itemTo.pocket,
			slotTo: itemTo.slot
		})
	}
}

module.exports = Inventory
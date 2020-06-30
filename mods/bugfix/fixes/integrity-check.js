// Validates that our packet integrity checks are still working

module.exports = function IntegrityCheck(mod) {
	if(mod.patchVersion < 93) return

	let good = 0
	let hook = mod.hook('*', 'raw', { order: -Infinity, filter: { incoming: false } }, (code, data) => {
		if(!mod.dispatch.protocol.getIntegrity(code)) return

		if(!mod.dispatch.packetIntegrity.validate(data)) {
			mod.log.fatal('Packet integrity check failed! Terminating connection.')
			mod.dispatch.connection.close()
			return
		}

		if(++good === 20) mod.unhook(hook) // We're done. No more overhead
	})
}
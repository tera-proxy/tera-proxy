// Fixes a regression in patch 90 where private chat channels do not load correctly on login

module.exports = function PrivateChat(mod) {
	if(mod.patchVersion < 90) return

	let channels = null

	mod.hook('S_LOGIN', 'raw', () => { channels = [] })

	mod.hook('S_JOIN_PRIVATE_CHANNEL', 'raw', (code, data) => {
		if(channels) {
			channels.push(data)
			return false
		}
	})

	mod.hook('S_REPLY_CLIENT_CHAT_OPTION_SETTING', 'raw', { order: 50, filter: { fake: null } }, () => {
		if(channels) {
			if(channels.length) {
				const tempChannels = channels // Copy channels ref so it's available on the next tick
				process.nextTick(() => {
					for(let pkt of tempChannels) mod.toClient(pkt)
				})
			}
			channels = null
		}
	})
}
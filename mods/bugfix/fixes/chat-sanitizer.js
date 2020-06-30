// Removes potentially malicious injected HTML content from other users' chat messages ~Pinkie Pie

const HTML_ESCAPED = { '<': '&lt;', '>': '&gt;', '&': '&amp;' }

module.exports = function ChatSanitizer(mod) {
	// Chat
	mod.hook('S_CHAT', 2, { order: 10 }, sanitize)
	mod.hook('S_WHISPER', 2, { order: 10 }, sanitize)
	mod.hook('S_PRIVATE_CHAT', 1, { order: 10 }, sanitize)

	// LFG messages
	mod.hook('S_SHOW_PARTY_MATCH_INFO', 1, { order: 10 }, event => {
		let res = undefined
		for(let listing of event.listings)
			if(listing.message !== (listing.message = escapeHtml(listing.message)))
				res = true

		return res
	})

	function sanitize(event) {
		const sanitized = event.message.replace(/<(.+?)>/g, (str, tag) => validateTag(tag) ? str : '')
		return event.message !== (event.message = sanitized) || undefined
	}

	function validateTag(tag) {
		tag = tag.toLowerCase()
		if(tag[0] === '/') tag = tag.slice(1)

		if(tag === 'font')
			return true
		if(/^font( (face="\$chatfont" size="18" )?color="#[0-9a-f]{1,6}"( kerning="0")?)?$/.test(tag))
			return true

		let match = null

		if(mod.patchVersion < 74) {
			if(tag === 'a')
				return true
			if(match = /^a href="asfunction:chatlinkaction,(.+)"$/.exec(tag))
				return validateChatLinkAction(match[1])
		}
		else {
			if(tag === 'chatlinkaction')
				return true
			if(match = /^chatlinkaction param="(.+)"$/.exec(tag))
				return validateChatLinkAction(match[1])
		}

		return false
	}

	function validateChatLinkAction(param) {
		return /^1#####\d+@\d+@[^#@]+$/.test(param)
			|| /^3#####\d+_\d+_\d+@\d+@-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(param)
	}

	function escapeHtml(str) { return str.replace(/[<>&]/g, m => HTML_ESCAPED[m]) }
}
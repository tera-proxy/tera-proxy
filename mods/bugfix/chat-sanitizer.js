// Removes potentially malicious injected HTML content from other users' chat messages ~Pinkie Pie

module.exports = function ChatSanitizer(mod) {
	mod.hook('S_CHAT', 2, {order: 10}, sanitize)
	mod.hook('S_WHISPER', 2, {order: 10}, sanitize)
	mod.hook('S_PRIVATE_CHAT', 1, {order: 10}, sanitize)

	function sanitize(event) {
		let sanitized

		if(mod.patchVersion < 74)
			sanitized = event.message.replace(/<(.+?)>/g, (str, tag) =>
					tag === 'FONT' || tag === '/FONT' || tag === '/A' ||
					/^font (face="\$chatfont" size="18" )?color="#[0-9a-f]{1,6}"( kerning="0")?$/i.test(tag) ||
					/^A HREF="asfunction:chatLinkAction,.+"$/.test(tag)
				? str : '')
		else
			sanitized = event.message.replace(/<(.+?)>/g, (str, tag) =>
					tag === 'FONT' || tag === '/FONT' || tag === '/ChatLinkAction' ||
					/^font (face="\$chatfont" size="18" )?color="#[0-9a-f]{1,6}"( kerning="0")?$/i.test(tag) ||
					/^ChatLinkAction param=".+"$/.test(tag)
				? str : '')

		return event.message !== (event.message = sanitized) || undefined
	}
}
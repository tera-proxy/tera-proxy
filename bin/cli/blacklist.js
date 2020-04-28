const MSG_WARN = `==================================================
TERA Proxy only exists because of volunteers devoting their time to improving your gameplay experience. We only ask that in return, you refrain from using bots or exploits on public game servers.

Use of these kind of mods causes the entire community to receive backlash from Krafton and their publishers in the form of new invasive "anti-cheat" software, DMCA notices, permanent bans, etc. which makes it much harder for us to continue supporting this tool.

Thanks for your understanding. ~Pinkie Pie
==================================================`

const NAME_SALT = Buffer.from('6INIJputA2Fg8NlVi3xd5oFjtQ4abORuhe5kaS66B0UppKK0jbTVw2SW6EUAHhPm0HxYXqzVZN78v3GeyQM+Fw==', 'base64')

const NAME_BOT = new Set([
	'auto-fishing',
	'easy-fishing',
	'fn',
	'let-me-fish',
	'tera-fish'
])
const NAME_EXPLOIT = new Set([
	'anti-cc',
	'auto-heal',
	'auto retaliate',
	'battleground-capper',
	'berserker-unleash',
	'corsair-memes',
	'fast-runeburst',
	'instant-revive',
	'kumas-royale-ru-tera',
	'let-me-target',
	'op-zerker-unleash',
	'parcel-memes',
	'rtport'
])
const NAME_RISK = new Set([
	'fast solo dungeons',
	'faster-petrax'
])
const HASH_BOT = new Set([
	'Zq69/7iHF1EdFlSYiTNoG4uHVnSjY3L4yLa0otfwbrA=',
	'fLg6ccb+ELauoH7d4VnPCa60Er/SK5ctSr0ekUhivzw=',
	'e5EvtmWjQyjwf/VukMKx99UxqEYuRtKGn5enw+p35kQ=',
	'XrhsE8RS2qxc7XCWqoWjhHSzX5PzhDqxUI7Odd+QfKU=',
	'Gcfj+BWZepOejMC0DK4jjbx3B+fewdTHENV7lrbrtTg=',
	'Fkf82rGMQlgTRQ4AElkg6qqXhnlhJyyvKHaMp3uFUtk=',
	'mwXao22muUQ7e6Agn6Ee/ub4GELi66ydCM8JWA6GMPI='
])
const HASH_EXPLOIT = new Set([])

const crypto = require('crypto')

module.exports = function blacklist(pkg) {
	const name = pkg.name.toLowerCase(),
		nameHash = crypto.createHash('sha256').update(NAME_SALT).update(name).digest('base64')

	if(NAME_BOT.has(name) || HASH_BOT.has(nameHash)) return `Fishing bot\n${MSG_WARN}`
	if(NAME_EXPLOIT.has(name) || HASH_EXPLOIT.has(nameHash)) return `Exploit\n${MSG_WARN}`
	if(NAME_RISK.has(name)) return 'High risk of ban'

	if(['caalilogger', 'caalistatetracker'].includes(name)) return 'Data collector'

	// Note: This one is specifically blacklisted because the auto-update redirect will throw confusing errors otherwise
	if(name === 'flasher') return 'Incompatible'

	if(name === 'auto target' && pkg.author === 'Fukki')
		return 'Possible malware/riskware'
}
const MSG_WARN = `==================================================
TERA Proxy only exists because of volunteers devoting their time to improving your gameplay experience. We only ask that in return, you refrain from using bots or exploits on public game servers.

Use of these kind of mods causes the entire community to receive backlash from Krafton and their publishers in the form of new invasive "anti-cheat" software, DMCA notices, permanent bans, etc. which makes it much harder for us to continue supporting this tool.

Thanks for your understanding. ~Pinkie Pie
==================================================`

const NAME_SALT = Buffer.from('6INIJputA2Fg8NlVi3xd5oFjtQ4abORuhe5kaS66B0UppKK0jbTVw2SW6EUAHhPm0HxYXqzVZN78v3GeyQM+Fw==', 'base64')

const HASH_BOT = new Set([
	'AiqDLXPspXsLzC7jxpYnCW75yCVJrxAhmfYzY+VCvQc=',
	'Fkf82rGMQlgTRQ4AElkg6qqXhnlhJyyvKHaMp3uFUtk=',
	'Gcfj+BWZepOejMC0DK4jjbx3B+fewdTHENV7lrbrtTg=',
	'Nr2qpd+jKFZbiAam4p/X0dNwYJWnWhDcEDiBhtpFtpo=',
	'XrhsE8RS2qxc7XCWqoWjhHSzX5PzhDqxUI7Odd+QfKU=',
	'Zq69/7iHF1EdFlSYiTNoG4uHVnSjY3L4yLa0otfwbrA=',
	'aS92svrJakRXgkYFLY/PfvfbQU2q50HZXViTBc3Blm0=',
	'e5EvtmWjQyjwf/VukMKx99UxqEYuRtKGn5enw+p35kQ=',
	'ejMk5YC5s9vqs46WnEKrZ675gqHDAWQq63XxWL1S5Cw=',
	'fLg6ccb+ELauoH7d4VnPCa60Er/SK5ctSr0ekUhivzw=',
	'kcr+qhILpJIRlUbW0nCYhyLIeksJbLFYutlWmPMd/9A=',
	'mwXao22muUQ7e6Agn6Ee/ub4GELi66ydCM8JWA6GMPI='
])
const HASH_EXPLOIT = new Set([
	'+YrA+bcVyq1aS6d/5glIwEpfvKaB2q94URz3gRJ7rpc=',
	'2fQAUkAe4aKE6VaWMZivQTfpN2KauMQY4o0vb1br4x0=',
	'CXHKsur2YvjoKKfciQ35B1D06lshP9lk/Lj7OFdpyW0=',
	'GzdSVULcH0f+d31Q1J0/fhsF4BEQOxzYPK0zEBxDkK8=',
	'HLVYloyzNL68zhRFJQdzVHWkROw5odQBk3C7JQDP/3Y=',
	'JBuwq5wSmOmoJs+M7IqsDT05Mbj31kA3tCdGv3LI5Eo=',
	'ejfTb8hnCU6ZSMMlXWwDug+ZL4FLuqrgE5qdMG7DYR0=',
	'h1dfTV9R7vxL7WXQpm/FSVuBXyjxS4WbAYEpZLeKSZo=',
	'i9DXAUcMIAAY6OH3KRCRjP8RmagQfnd1XWPDLUyKbHc=',
	'qC/axniAgpfLyyVVjnZdeSHH1oshtNc/dGftLfR3Xsc=',
	'qky5esZ3NIHmheHV7MpVRc53uVYODcXD61+yBB1Qqhg=',
	'qmwR7R2UnfqaRsBxIJSlPf0Ly5IwcaX7sO6mTvtjdkM=',
	'sOi1+WcDdnB13vTMSKobx1SdvsUFJfaE878NZcVzZCU=',
	'zm32KKuBkxHUgNxUxERWhSaLfgmlu3uQGAmXHCuMbKU=',
	'zvYmYXUrDyd6pU/I+aJZo1U71xqOGYJnTiyLBUY6c58='
])
const HASH_RISK = new Set([
	'MYZ64lul/u5pRHV11ykhpdTG213L+Ro6ULXN8dIolwg=',
	'pUgWCLh9BOvsPmyVpXTxPbgghPD6ZFuAiO5cZOxIcrs='
])

const crypto = require('crypto')

module.exports = function blacklist(pkg) {
	const name = pkg.name.toLowerCase(),
		nameHash = crypto.createHash('sha256').update(NAME_SALT).update(name).digest('base64')

	if(HASH_BOT.has(nameHash)) return `Fishing bot\n${MSG_WARN}`
	if(HASH_EXPLOIT.has(nameHash)) return `Exploit\n${MSG_WARN}`
	if(HASH_RISK.has(nameHash)) return 'High risk of ban'

	if(name === 'caalilogger' || name === 'caalistatetracker') return 'Data collector'

	// Note: These ones are specifically blacklisted because the auto-update redirect will throw confusing errors otherwise
	if(name === 'flasher' || name === 'tera-game-state-helper') return 'Incompatible'
}
'use strict'

const fs = require('fs'),
	path = require('path'),
	readline = require('readline')

const configDir = path.join(__dirname, '../settings'),
	configFile = path.join(configDir, '_tera-proxy_.json')

let config = {
	branch: 'master',
	autoUpdate: true,
	autoUpdateMods: true,
	devWarnings: false
}

try {
	config = Object.assign(config, JSON.parse(fs.readFileSync(configFile)))
}
catch(e) {
	if(!fs.existsSync(configDir)) fs.mkdirSync(configDir)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function question(q) { return new Promise(resolve => { rl.question(q, resolve) }) }

(async () => {
	config.autoUpdate = config.autoUpdateMods = parseBool(await question(`Automatically update proxy? (${config.autoUpdate ? 'Y/n' : 'y/N'}): `),
		config.autoUpdate)

	if(config.autoUpdate)
		config.autoUpdateMods = parseBool(await question(`Automatically update mods? (${config.autoUpdateMods ? 'Y/n' : 'y/N'}): `),
			config.autoUpdateMods)

	fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'))
	rl.close()
})()

function parseBool(str, def) {
	if(!str) return def
	return ['y', 'yes', 'true', '1'].includes(str.toLowerCase())
}
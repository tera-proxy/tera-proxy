'use strict'

const fs = require('fs'),
	path = require('path'),
	readline = require('readline')

const configDir = path.join(__dirname, '../settings'),
	configFile = path.join(configDir, '_tera-proxy_.json'),
	regions = [{
		name: ['EU'],
		publisher: 'Gameforge'
	}, {
		name: ['EU-TEST'],
		publisher: 'Gameforge - Beta'
	}, {
		name: ['RU'],
		publisher: 'Destiny.Games'
	}, {
		name: ['TW'],
		publisher: 'HappyTuk / MangoT5'
	}, {
		name: ['JP'],
		publisher: 'GameOn / Pmang'
	}, {
		name: ['TH', 'SE', 'ID'],
		publisher: 'PlayWith / Lytogame'
	}, {
		name: ['NA'],
		publisher: 'En Masse'
	}, {
		name: ['KR'],
		publisher: 'Nexon'
	}, {
		name: ['KR-TEST'],
		publisher: 'Nexon - Beta'
	}]

let config = {
	branch: 'master',
	autoUpdate: true,
	autoUpdateMods: true,
	region: '',
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
	console.log(`Supported game regions:\n${regions.map(r => {
		let str = `    ${r.name.join(' / ')}`
		str += ' '.repeat(Math.max(0, 20 - str.length))
		return str + (r.publisher ? `(${r.publisher})` : '')
	}).join('\n')}\n`)

	while(!setRegion(await question(`Game region${config.region ? ` (current = ${config.region})` : ''}: `)))
		console.log('Invalid region')

	config.autoUpdate = config.autoUpdateMods = parseBool(await question(`Automatically update proxy? (${config.autoUpdate ? 'Y/n' : 'y/N'}): `),
		config.autoUpdate)

	if(config.autoUpdate)
		config.autoUpdateMods = parseBool(await question(`Automatically update mods? (${config.autoUpdateMods ? 'Y/n' : 'y/N'}): `),
			config.autoUpdateMods)

	fs.writeFileSync(configFile, JSON.stringify(config, null, '\t'))
	rl.close()
})()

function setRegion(region) {
	if(!region) region = config.region

	region = region.toUpperCase()
	for(let r of regions)
		if(r.name.includes(region)) {
			config.region = r.name[0]
			return true
		}
	return false
}

function parseBool(str, def) {
	if(!str) return def
	return ['y', 'yes', 'true', '1'].includes(str.toLowerCase())
}
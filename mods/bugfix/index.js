const fs = require('fs'),
	path = require('path')

const fixesDir = path.join(__dirname, 'fixes'),
	fixes = fs.readdirSync(fixesDir).map(name => require(path.join(fixesDir, name)))

module.exports = function Bugfix(mod) {
	for(let SubMod of fixes) new SubMod(mod)
}
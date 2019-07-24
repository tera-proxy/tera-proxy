const mods = ['chat-sanitizer', 'swim-fix'].map(mod => require('./' + mod))

module.exports = function Bugfix(dispatch) {
	for(let mod of mods) mod(dispatch)
}
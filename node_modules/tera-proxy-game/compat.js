/*	A partial sandbox built atop the Node modules system.
	Currently hardcoded to emulate caali-proxy - should be split into a library later.
*/

const crypto = require('crypto'),
	path = require('path'),
	fs = require('fs'),
	Module = require('module')

const TERA_PROXY = {
		DevMode: false,
		DiscordUrl: 'https://discord.gg/' + crypto.randomBytes(5).toString('base64').slice(0, 7),
		SupportUrl: 'https://discord.gg/' + crypto.randomBytes(5).toString('base64').slice(0, 7),
		GUIMode: false
	},
	PROXY_GLOBAL = new Proxy(global, { get: (obj, key) => key === 'TeraProxy' ? TERA_PROXY : obj[key] })

function makeRequire(parent) {
	const _require = Module.createRequire(parent.filename),
		dirname = path.join(parent.filename, '..')

	return Object.assign(function require(filename) {
		if(filename === 'tera-mod-ui') return {}

		const abs = path.isAbsolute(filename)
		if(abs || filename.startsWith('.')) {
			if(!abs) filename = path.join(dirname, filename)

			filename = _require.resolve(filename)
			if(path.extname(filename) === '.js') {
				const cache = require.cache[filename]
				if(cache) return cache.exports

				try {
					// Create new module (available as 'module' within the sandbox)
					const compatModule = Object.assign(new Module(filename, parent), {
						filename,
						paths: Module._nodeModulePaths(path.dirname(filename))
					})
					require.cache[filename] = compatModule
					compatModule.inject = {
						require: makeRequire(compatModule),
						global: PROXY_GLOBAL
					}
					// Create sandbox, pull our injected variables into the sandbox, then execute the module
					compatModule._compile(
						'require=module.inject.require;'
						+ 'var global=module.inject.global;'
						+ 'delete module.inject;'
						+ fs.readFileSync(filename, 'utf8'), filename)
					compatModule.loaded = true
					return compatModule.exports
				}
				catch(e) {
					delete require.cache[filename]
					throw e
				}
			}
		}

		return _require(filename)
	}, _require)
}

exports.require = makeRequire(module)
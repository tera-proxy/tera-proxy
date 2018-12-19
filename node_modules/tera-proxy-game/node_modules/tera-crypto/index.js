const fs = require('fs')

for(let file of [
	`${__dirname}/build/Release/teracrypto.node`,
	`${__dirname}/bin/${process.versions.modules}_${process.arch}_${process.platform}.node`
])
	if(fs.existsSync(file)) {
		module.exports = require(file)
		return
	}

throw Error(`tera-crypto: No build found (modulesVer=${process.versions.modules}, arch=${process.arch}, platform=${process.platform})`)
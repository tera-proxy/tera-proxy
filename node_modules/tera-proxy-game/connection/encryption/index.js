const Sha0 = require('./sha0'),
	TeraCrypto = (() => {
		try {
			return require('tera-crypto')
		}
		catch(e) {
			console.error('Your version of Node.JS is not supported. Version 10.0.0 or newer is recommended.')
			throw e
		}
	})()

function getCrypto(key) {
	const data = Buffer.allocUnsafe(680)
	data[0] = 128
	for(let i = 1; i < 680; i++) data[i] = key[i % 128]
	for(let i = 0; i < 680; i += 20) {
		const hash = new Sha0().update(data).digest()
		for(let j = 0; j < 20; j += 4) data.writeUInt32LE(hash.readUInt32BE(j), i + j)
	}
	return new TeraCrypto(data)
}

function shiftKey(tgt, src, n) {
	const len = src.length
	if(n > 0) {
		src.copy(tgt, 0, n)
		src.copy(tgt, len - n)
	} else {
		src.copy(tgt, 0, len + n)
		src.copy(tgt, -n)
	}
	return tgt
}

function xorKey(tgt, key1, key2) {
	for(let i = 0; i < 128; i++) tgt[i] = key1[i] ^ key2[i]
}

class Session {
	constructor() {
		this.encryptor = null
		this.decryptor = null
		this.clientKeys = [Buffer.alloc(128), Buffer.alloc(128)]
		this.serverKeys = [Buffer.alloc(128), Buffer.alloc(128)]
	}

	init() {
		const [c1, c2] = this.clientKeys
		const [s1, s2] = this.serverKeys
		const t1 = Buffer.allocUnsafe(128)
		const t2 = Buffer.allocUnsafe(128)
		shiftKey(t1, s1, -67)
		xorKey(t2, t1, c1)
		shiftKey(t1, c2, 29)
		xorKey(t2, t1, t2)
		this.decryptor = getCrypto(t2)
		shiftKey(t1, s2, -41)
		this.decryptor.apply(t1)
		this.encryptor = getCrypto(t1)
	}

	encrypt(data) { return this.encryptor.apply(data) }
	decrypt(data) { return this.decryptor.apply(data) }

	cloneKeys() {
		const session = new Session()
		this.clientKeys[0].copy(session.clientKeys[0])
		this.clientKeys[1].copy(session.clientKeys[1])
		this.serverKeys[0].copy(session.serverKeys[0])
		this.serverKeys[1].copy(session.serverKeys[1])
		session.init()
		return session
	}
}

module.exports = Session
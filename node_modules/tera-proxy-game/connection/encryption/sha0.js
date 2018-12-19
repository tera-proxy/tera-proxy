const crypto = require('crypto')

class Sha0 {
	constructor() {
		this.state = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
		this.block = Buffer.alloc(64)
		this.blockIndex = 0
		this.lengthHigh = 0
		this.lengthLow = 0
		this.computed = false
	}

	update(data, encoding) {
		try {
			data = Buffer.from(data, encoding)
		}
		catch(e) {
			data = Buffer.from(data)
		}

		for(const b of data) {
			this.block[this.blockIndex++] = b
			this.lengthLow  = this.lengthLow + 8 | 0
			if(this.lengthLow === 0) this.lengthHigh = this.lengthHigh + 1 | 0
			if(this.blockIndex === 64) this.processMessageBlock()
		}

		return this
	}

	digest(encoding) {
		if(!this.computed) {
			this.padMessage()
			this.computed = true
		}

		const buf = Buffer.allocUnsafe(20)

		for(let t = 0; t < 5; t++) buf.writeUInt32BE(this.state[t] >>> 0, t * 4)

		if(encoding)
			try {
				return buf.toString(encoding)
			}
			catch(e) {}

		return buf
	}

	processMessageBlock() {
		const w = Array(80)

		for(let t = 0; t < 16; t++) w[t] = this.block.readUInt32BE(t * 4) // initialize the first 16 words in the array W
		for(let t = 16; t < 80; t++) w[t] = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]

		let [a, b, c, d, e] = this.state

		for(let t = 0; t < 80; t++) {
			let temp = leftRotate(a, 5) + e + w[t]
			if(t < 20) {
				temp += (b & c) | ((~b) & d)
				temp += 0x5A827999
			} else if(t < 40) {
				temp += b ^ c ^ d
				temp += 0x6ED9EBA1
			} else if(t < 60) {
				temp += (b & c) | (b & d) | (c & d)
				temp += 0x8F1BBCDC
			} else {
				temp += b ^ c ^ d
				temp += 0xCA62C1D6
			}
			e = d
			d = c
			c = leftRotate(b, 30)
			b = a
			a = temp | 0
		}

		this.state[0] = (this.state[0] + a) | 0
		this.state[1] = (this.state[1] + b) | 0
		this.state[2] = (this.state[2] + c) | 0
		this.state[3] = (this.state[3] + d) | 0
		this.state[4] = (this.state[4] + e) | 0
		this.blockIndex = 0
	}

	padMessage() {
		// Check to see if the current message block is too small to hold the initial padding bits and length.	If so, we will pad the
		// block, process it, and then continue padding into a second block.
		this.block[this.blockIndex++] = 0x80

		if(this.blockIndex > 56) {
			this.block.fill(0, this.blockIndex, 64)
			this.processMessageBlock()
		}

		if(this.blockIndex < 56) this.block.fill(0, this.blockIndex, 56)

		this.block.writeInt32BE(this.lengthHigh, 56)
		this.block.writeInt32BE(this.lengthLow, 60)
		this.processMessageBlock()
	}
}

function leftRotate(x, n) { return (x << n) | (x >>> (32 - n)) }

module.exports = Sha0
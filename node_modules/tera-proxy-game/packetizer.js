class Packetizer {
	constructor(opts, callback) {
		if(typeof opts === 'function') {
			callback = opts
			opts = {}
		}

		this.headerLength = opts.headerLength || 2
		this.readLength = opts.readLength || ((data, pos) => data.readUInt16LE(pos))
		this.callback = callback

		this.buffer = Buffer.allocUnsafe(0xffff)
		this.position = 0
		this.length = 0
	}

	recv(data) {
		for(let pos = 0; pos < data.length;) {
			if(this.length) { // We have a previous buffer
				if(this.length === -1) { // Buffer contains incomplete header
					// Append buffer until we have a complete header or run out of data
					this.position += data.copy(this.buffer, this.position, pos, pos += this.headerLength - this.position)

					if(this.position < this.headerLength) break // Buffer contains incomplete header

					// Buffer contains complete header
					this.length = this.readLength(this.buffer, 0)
				}

				// Append buffer until we have a complete packet or run out of data
				this.position += data.copy(this.buffer, this.position, pos, pos += this.length - this.position)

				if(this.position === this.length) {
					this.callback(this.buffer.slice(0, this.length))
					this.position = this.length = 0
				}
				continue
			}

			const remaining = data.length - pos

			if(remaining < this.headerLength) { // Chunk contains incomplete header
				this.position = data.copy(this.buffer, 0, pos)
				this.length = -1
				break
			}

			// Chunk contains complete header
			const length = this.readLength(data, pos)

			if(length > remaining) { // Chunk contains incomplete packet
				this.position = data.copy(this.buffer, 0, pos)
				this.length = length
				break
			}

			// Chunk contains complete packet
			this.callback(length === data.length ? data : data.slice(pos, pos + length))
			pos += length
		}
	}
}

module.exports = Packetizer
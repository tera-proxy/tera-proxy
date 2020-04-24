class ProtoCompiler {
	constructor(proto) {
		Object.assign(this, {
			proto,

			str: '',		// Function body
			strPending: '',	// Pending body (chunk footer)
			i: 0,			// Current unused local variable index
			init: new Set()	// List of identifiers that have been initialized
		})
	}

	needsInit(name) {
		if(!this.init.has(name)) {
			this.init.add(name)
			return true
		}
		return false
	}

	// Returns an unused local variable name
	local() { return `i${this.i++}` }

	// Makes id into a local variable and returns the local variable name
	// Usage: id = makeLocal(id[, default])
	makeLocal(id, defaultStr) {
		const temp = this.local()
		this.str += `let ${temp} = ${id}\n`
		if(defaultStr) this.str += `if(${temp} == null) ${temp} = ${defaultStr}\n`
		return temp
	}

	property(objId, propName) {
		return /^[_$a-z][_$a-z0-9]*/i.test(propName)
			? `${objId}.${propName}`
			: `${objId}['${propName.replace('\\', '\\\\').replace('\'', '\\\'')}']`
	}

	// Pops current state from pending and creates a new state
	popState() {
		const rtnStr = this.str
		this.str = this.strPending
		this.strPending = ''
		return rtnStr
	}

	// Flushes pending state into current state - must be called prior to pushState()
	flushState() { this.str += this.strPending }

	// Pushes current state into pending and restores previous state
	pushState(str) {
		this.strPending = this.str
		this.str = str
	}

	read(type, id) {
		if(typeof type[0] === 'number') { // Fixed-length array
			this.str += `${id} = []\n`
			for(let i = 0; i < type[0]; i++) this.read(type[1], `${id}[${i}]`)
			return
		}

		if(!this.proto[type[0]]) throw Error(`Invalid type ${type[0]}`)

		if(this.proto[type[0]].compileRead)
			this.proto[type[0]].compileRead(this, id, type[1])
		else
			this.str += `${id} = ${this.property('this', type[0])}.read(data)\n`
	}

	write(type, id) {
		if(typeof type[0] === 'number') { // Fixed-length array
			id = this.makeLocal(id)
			this.str += `if(${id} == null) ${id} = []\n`
			for(let i = 0; i < type[0]; i++) this.write(type[1], `${id}[${i}]`)
			return
		}

		if(!this.proto[type[0]]) throw Error(`Invalid type ${type[0]}`)

		if(this.proto[type[0]].compileWrite)
			this.proto[type[0]].compileWrite(this, id, type[1], type[2])
		else
			this.str += `${this.property('this', type[0])}.write(data, ${id})\n`
	}

	length(type, id) {
		if(typeof type[0] === 'number') { // Fixed-length array
			if(type[0] === 0) return 0

			const length = this.length(type[1], '') // Test whether this type is static or not
			if(typeof length === 'number')
				return length * type[0]

			id = this.makeLocal(id, '[]')
			for(let i = 0; i < type[0]; i++) this.str += this.length(type[1], `${id}[${i}]`)

			const str = this.str
			this.str = ''
			return str
		}

		const staticLength = this.proto[type[0]].length
		if(staticLength !== undefined)
			return staticLength
		return this.proto[type[0]].compileLength(this, id, type[1], type[2])
	}

	readFunc(type) {
		this.read(type, 'val')
		return new Function('data', `let val\n${this.str}${this.strPending}return val`).bind(this.proto)
	}

	writeFunc(type) {
		this.write(type, 'val')
		return new Function('data,val', `${this.str}${this.strPending}`).bind(this.proto)
	}

	lengthFunc(type) {
		const length = this.length(type, 'val')
		if(typeof length === 'number') return () => length
		return new Function('val', `let len=0\n${length}return len`).bind(this.proto)
	}
}

const data = { pos: 0, dv: null, buf: null },	// Pre-allocated data object for passing to internal functions
	readBuffer = Buffer.allocUnsafe(0x1800),	// Should be just small enough that copying is faster than new DataView()
	readViews = [],
	writeBuffer = Buffer.allocUnsafe(0xffff),
	writeView = new DataView(writeBuffer.buffer, writeBuffer.byteOffset, writeBuffer.length)

for(let i = 0; i <= readBuffer.length; i++)
	readViews[i] = new DataView(readBuffer.buffer, readBuffer.byteOffset, i)

class Proto {
	constructor(gameVersion, packetLen16) {
		this.gameVersion = gameVersion
		this.packetLen16 = packetLen16

		this.object = {
			compileRead(compile, id, props) {
				if(compile.needsInit(id)) compile.str += `${id} = {}\n`

				if(props) for(let [name, type] of props) compile.read(type, compile.property(id, name))
			},

			compileWrite(compile, id, props) {
				id = compile.makeLocal(id, '{}')

				if(props) for(let [name, type] of props) compile.write(type, compile.property(id, name))
			},

			compileLength(compile, id, props) {
				let staticLength = 0,
					str = ''

				if(props)
					for(let [name, type] of props) {
						const length = compile.length(type, compile.property(id, name))
						if(typeof length === 'number')
							staticLength += length
						else
							str += length
					}

				if(!str) return staticLength

				id = compile.makeLocal(id, '{}')
				if(staticLength) compile.str += `len += ${staticLength}\n`

				str = compile.str + str
				compile.str = ''
				return str
			}
		}
	}

	compile(type) {
		const readFunc = new ProtoCompiler(this).readFunc(type),
			writeFunc = new ProtoCompiler(this).writeFunc(type),
			lengthFunc = new ProtoCompiler(this).lengthFunc(type)

		return {
			read(buf, pos = 0) {
				data.pos = pos

				// Fast (small data): Copy data to an existing Buffer and use a cached DataView
				if(buf.length + pos < readViews.length) {
					buf.copy(readBuffer, pos, pos, buf.length)
					data.buf = readBuffer
					data.dv = readViews[buf.length + pos]
					return readFunc(data)
				}

				// Slow (large data): Construct a new DataView
				data.buf = buf
				data.dv = new DataView(buf.buffer, buf.byteOffset, buf.length)
				const val = readFunc(data)
				data.buf = null
				data.dv = null
				return val
			},

			write: (val, offset = 0, extend = 0) => {
				// Fast (16-bit or lower packet length): Write to a temporary buffer, then copy the result
				if(this.packetLen16) {
					data.pos = offset
					data.buf = writeBuffer
					data.dv = writeView
					writeFunc(data, val)
					return Buffer.from(writeBuffer.slice(0, data.pos + extend))
				}

				// Slow (unlimited packet length): Calculate length, then allocate a new Buffer + DataView
				const buf = Buffer.allocUnsafe(offset + lengthFunc(val) + extend)
				data.pos = offset
				data.buf = buf
				data.dv = new DataView(buf.buffer, buf.byteOffset, buf.length)
				writeFunc(data, val)
				data.buf = null
				data.dv = null
				return buf
			},

			length: lengthFunc
		}
	}
}

Object.assign(Proto, {
	StandardType(type, bigEndian = false) {
		const length = Number(/\d+/.exec(type)[0]) / 8

		return {
			compileRead(compile, id) {
				if(length === 1) {
					compile.str += `${id} = data.dv.get${type}(data.pos++)\n`
					return
				}
				compile.str += `${id} = data.dv.get${type}(data.pos, ${!bigEndian})\n`
				compile.str += `data.pos += ${length}\n`
			},
			compileWrite(compile, id) {
				if(length === 1) {
					compile.str += `data.dv.set${type}(data.pos++, ${id})\n`
					return
				}
				if(type.startsWith('Big')) {
					id = compile.makeLocal(id, '0n')
					compile.str += `else if(typeof ${id} !== 'bigint') ${id} = BigInt(${id})\n`
				}
				if(type.startsWith('Float'))
					compile.str += `data.dv.set${type}(data.pos, ${id} == null ? 0 : ${id}, ${!bigEndian})\n`
				else
					compile.str += `data.dv.set${type}(data.pos, ${id}, ${!bigEndian})\n`
				compile.str += `data.pos += ${length}\n`
			},
			length
		}
	}
})

module.exports = Proto
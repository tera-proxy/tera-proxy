const func = function() {}, obj = {}

module.exports = function HotswapProxy(target = func) {
	// Initial target affects typeof() and apply/construct errors
	const proxy = new Proxy(typeof target === 'function' ? func : obj, {
		getPrototypeOf(obj) { return Reflect.getPrototypeOf(this.target) },
		setPrototypeOf(obj, value) { return Reflect.setPrototypeOf(this.target, value) },
		isExtensible(obj) { return true },
		preventExtensions(obj) { throw Error('Cannot prevent extensions on hotswap proxy') },
		getOwnPropertyDescriptor(obj, key) { return Reflect.getOwnPropertyDescriptor(this.target, key) },
		defineProperty(obj, key, value) { return Reflect.defineProperty(this.target, key, value) },
		has(obj, key) { return Reflect.has(this.target, key) },
		get(obj, key, receiver) {
			return Reflect.get(this.target, key, receiver === proxy ? this.target : receiver)
		},
		set(obj, key, value, receiver) {
			if(key === '__target__') {
				this.target = value
				return true
			}
			return Reflect.set(this.target, key, value, receiver === proxy ? this.target : receiver)
		},
		deleteProperty(obj, key) { return Reflect.deleteProperty(this.target, key) },
		ownKeys(obj) { return Reflect.ownKeys(this.target) },
		apply(obj, thisArg, args) { return Reflect.apply(this.target, thisArg, args) },
		construct(obj, args, newTarget) {
			return Reflect.construct(this.target, args)
		}
	})
	proxy.__target__ = target
	return proxy
}
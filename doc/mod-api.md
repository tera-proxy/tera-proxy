# Mod API
This API is exposed to mods as the first argument passed to their constructor. An example mod is as follows:
```js
module.exports = function HelloWorld(mod) {
	mod.log.info('Hello, world!')
}
```
## Properties
### `info`
`<Object>` A parsed version of this mod's `mod.json`.
### `log`
`<Object>` This mod's logger.
### `patchVersion`
`<Number>` A getter which returns the game's version number (ie. 93.04).
### `require`
`<Object>` A Proxy object which returns the specified mod's current instance. Throws an error if the required mod is not installed.
### `settings`
`<Object>` A persistent storage object backed by JSON. Each mod has their own `settings`.
## Methods
### `clearInterval()`
**Arguments:** `timeout`
Clears timers set by [setTimeout()](#setTimeout) or [setInterval()](#setInterval).
### `clearTimeout()`
**Arguments:** `timeout`
Clears timers set by [setTimeout()](#setTimeout) or [setInterval()](#setInterval).
### `hook()`
**Arguments:** `id, def[, options], callback`
* `id` `<String>` Packet name | `<Number>` Packet code | `'*'` All packets
* `def` `<Number>` Version number | `<Object>` Compiled protocol definition | `'raw'` Raw data
* `options` `<Object>`
* * `order` `<Number>` Hook priority. Lower numbers receive callbacks first, while higher numbers receive them later.
* * `filter` `<Object>`
* * * `$fake` `<Boolean>` | `null` (default: `false`)
* * * `$incoming` `<Boolean>` | `null` (default: `null`)
* * * `$modified` `<Boolean>` | `null` (default: `null`)
* * * `$silenced` `<Boolean>` | `null` (default: `false`)
* * `timeout` `<Number>` Milliseconds to wait before unhooking. When timeout occurs, `callback` is fired with a single `null` argument.
* `callback` `<Function>` in normal mode:
* * `event` `<Object>` The parsed data object
* * * `$fake` `<Boolean>`
* * * `$incoming` `<Boolean>`
* * * `$modified` `<Boolean>`
* * * `$silenced` `<Boolean>`
* * `fake` `<Boolean>` **`Deprecated`**
* `callback` `<Function>` in raw mode:
* * `code` `<Number>`
* * `data` `<Buffer>`
* * * `$fake` `<Boolean>`
* * * `$incoming` `<Boolean>`
* * * `$modified` `<Boolean>`
* * * `$silenced` `<Boolean>`
* * `incoming` `<Boolean>` **`Deprecated`**
* * `fake` `<Boolean>` **`Deprecated`**
* Returns: `<Object>` The hook reference. See [unhook()](#unhook).
Hooks a packet.
### `hookAsync()`
**Arguments:** `name, version[, options], callback`
Returns a Promise that resolves with `event` or rejects if timed out. See [hook()](#hook) for options.
### `hookOnce()`
**Arguments:** `name, version[, options], callback`
Hooks a single packet, unhooking on callback. See [hook()](#hook) for options.
### `isLoaded()`
**Arguments:** `name`
Returns `true` if the specified mod is installed, `false` otherwise.
### `send()`
**Arguments:** `id, def[, object]`
* Returns: `<Boolean>` Success
Sends a packet, inferring direction from the packet's name. Fields not specified are set to default values.
### `setInterval()`
**Arguments:** `callback, milliseconds[, ...args]`
Equivalent to `globalThis.setInterval`, but is canceled when the mod is unloaded.
### `setTimeout()`
**Arguments:** `callback, milliseconds[, ...args]`
Equivalent to `globalThis.setTimeout`, but is canceled when the mod is unloaded.
### `toClient()`
**Arguments:** `id, def[, object] | data`
* Returns: `<Boolean>` Success
Sends a packet to the client. Fields not specified are set to default values.
### `toServer()`
**Arguments:** `id, def[, object] | data`
* Returns: `<Boolean>` Success
Sends a packet to the server. Fields not specified are set to default values.
### `unhook()`
**Arguments:** `hook`
Unhooks a previously hooked packet. If `hook` is invalid, then this method silently fails.
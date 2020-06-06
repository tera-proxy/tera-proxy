# Getting started
## Your First Mod
Mods are located in your `tera-proxy/mods/` folder. TERA Proxy searches this folder on startup to determine which mods to load when you log in.

A mod consists of the following:
* A package file (`mod.json`) describing your mod and how to load it.
* A Node.JS Module (`index.js` by default) which contains your mod's logic.

First, we'll create a folder in `tera-proxy/mods/` named `hello-world`. The folder name may be anything you wish, but **it cannot start with an underscore (`_`) or dot (`.`)**, or else it will be skipped over during loading.

Next, inside our `hello-world` folder we create our `mod.json` with the following contents:
```json
{
	"name": "hello-world",
	"title": "Hello World",
	"author": "Anonymous",
	"description": "An example mod."
}
```
* `name` is the only required field, and **must be unique**. If two mods have the same `name`, then only one of them will be loaded. This is to prevent users from installing the same mod twice.
* `title`, `author` and `description` are what the user will see in the UI.

Then, we create our `index.js`:
```js
// Code here will run only once, before anything else

module.exports = function HelloWorld(mod) {
	// Code here will run every time the user selects a server in-game
	mod.log.info('Hello, world!')
}
```

Once the user selects a server, our mod is passed a single variable called `mod`, which allows us to access the [Mod API](mod-api.md). The above example simply logs an info message to the console, letting us know it's working.

## Hooking network packets
The main feature of TERA Proxy is its ability to hook, modify, block and inject new network packets. These are parsed into readable objects by Protocol Definitions, which can be found in `tera-proxy/node_modules/tera-data/protocol/`.

Protocol definitions have the format `(name).(version).def` where `name` is the packet's readable name, and `version` is the definition version which changes every time a field is renamed or modified significantly. You can open these files with any text editor to see a list of fields. For example, we can see that `S_LOGIN.14.def` is version `14` and has a string field called `name`, which is our character's name:
```
string name
```

We can call the API function `mod.hook(name, version, callback)` to hook a specific packet and get the parsed object as a callback parameter. Thus, we can modify `index.js` to print the character's name in the console upon logging in:
```js
module.exports = function HelloWorld(mod) {
	mod.log.info('Hello, world!')

	mod.hook('S_LOGIN', 14, event => {
		mod.log.info(`Logged in as: ${event.name}`)
	})
}
```

There are an overwhelming number of packets, but to make things easier we can use a packet logger such as [Debug](https://github.com/tera-mods/debug) to see which ones the game is sending in response to various actions. You can also take a look at how [other mods](https://github.com/tera-mods) work, or ask other developers in [our Discord](https://discord.gg/RR9zf85).

## Using libraries
Sometimes it's easier to use an existing library than to work with packets directly. For this, there's `mod.require`, a JS Proxy object which allows us to access other mods at runtime.

The most commonly used library is [Command](https://github.com/tera-mods/command), which ships with TERA Proxy by default. This allows you to hook specific commands entered in in-game chat, as well as sending messages in chat (full documentation can be found in the mod's README.md).

We can load the library using `const command = mod.require.command`, or the destructuring shorthand `const { command } = mod.require`. From there we can call its methods:
```js
module.exports = function HelloWorld(mod) {
	const { command } = mod.require

	let myName

	mod.hook('S_LOGIN', 14, event => {
		myName = event.name
	})

	command.add('hello', () => {
		command.message(`Hello, ${myName}!`)
	})
}
```

The above runs when you type `/!hello` in chat, and responds withs `[Proxy]Hello, (name)!` (in Private Channel 8, by default). This is all handled locally, so other players cannot see these messages.

## Modifying and blocking packets
TERA Proxy makes it easy to modify or block a packet. Returning `true` from a hook's callback will modify the packet, while returning `false` will block it. Any other return value will not affect the packet in any way.

```js
module.exports = function Test(mod) {
	// Set our level to appear as 99 and modify the packet
	mod.hook('S_LOGIN', 14, event => {
		event.level = 99
		return true
	})

	// Block all chat messages from players
	mod.hook('S_CHAT', 3, event => {
		return false
	})
}
```

The above makes our character appear (to us) as level 99, while hiding all chat messages from players (including yourself). Note that modifying certain values such as your character name **will cause the client to respond with invalid data to the server**. While TERA is generally relaxed when it comes to third-party mods, caution is still advised when modifying packets so that you don't accidentally get yourself (or others!) banned.

## Sending packets
Sending packets is primarily done through the `mod.send(name, version, object)` function, which automatically selects the correct direction based on the packet's name. `C_` prefixed packets are sent from the client to the server, while `S_` and `I_` packets are sent to the client.

Below is a very simple, yet functional mod that blocks all cutscenes (a variant of the [No Cutscenes](https://github.com/tera-mods/no-cutscenes) mod):
```js
module.exports = function NoCutscenes(mod) {
	// Hook the cutscene packet from the server
	mod.hook('S_PLAY_MOVIE', 1, event => {
		// Send our reply to the server saying we cancelled the cutscene
		mod.send('C_END_MOVIE', 1, {
			movie: event.movie,
			unk: true // This field is unknown, but we know it's a boolean and that the real client always replies with true
		})
		return false // Block the packet so that the client doesn't play the cutscene
	})
}
```
# UI
Custom ingame UI library for TERA.

## Example
**index.js**
```js
const UI = require('ui'),
    Command = require('command')

module.exports = function TestUI(dispatch) {
    const ui = UI(dispatch),
        command = Command(dispatch)

    ui.use(UI.static(__dirname + '/ui'))

    command.add('testui', () => { ui.open() })
}
```
**ui/index.html**
```html
<html>
	<head>
		<script>
			window.addEventListener('error', function(e) {
				_tera_client_proxy_.alert('Error: ' + e.message)
			})

			window.onload = function() {
				_tera_client_proxy_.resize_to(200, 200)
				_tera_client_proxy_.set_title('Test UI')
			}
		</script>
	</head>
	<body>
		Hello ponies!
	</body>
</html>
```

## API
The API is identical to [Express](https://expressjs.com/), with a few notable differences:
* The constructor `UI(dispatch[, options])` returns an instance of `UI.Router`.
* `UI.Router` has a new function called `open([path])` which opens an ingame window pointing to the specified route.

## __tera_client_proxy__
The ingame Awesomium browser has a property of `window` called `__tera_client_proxy__` that allows scripts to interact with the client. It has the following functions:
#### `get_gender()`
Returns the player's gender name (localized).
#### `get_race()`
Returns the player's race name (localized).
#### `get_class()`
Returns the player's class name (localized).
#### `get_name()`
Returns the player's name.
#### `get_level()`
Returns the player's level.
#### `get_continent()`
Returns the player's continent ID.
#### `get_server_id()`
Returns the arbiter server ID.
#### `get_language()`
Returns the client's language code (ex. `'USA'`).
#### `get_locale()`
Returns the client's locale (ex. `'en'`).
#### `get_size()`
Returns the browser window size.
#### `save_feedback(str1, str2, str3, str4)`
#### `open_web_direct(url)`
#### `close()`
Closes the browser window.
#### `invoke_menu(unk)`
#### `alert(string)`
Prints a system alert message to the ingame chat box.
#### `open_external_web(website_id)`
#### `open_web(url)`
#### `purchase(unk1, unk2)`
#### `query_coin(unk)`
Sends `C_QUERY_COIN`.
#### `reload()`
Reloads the page.
#### `resize_to(width, height)`
Resizes the browser window.
#### `set_title(title)`
Sets the window title.
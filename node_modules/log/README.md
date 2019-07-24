## Usage
`require('log')` returns a global Log instance, from which you can create named child loggers for various components of your application.

### Examples
```js
const log = require('log')('my-app')

log.info('Hi')
```
```js
const log = require('log')({ name: 'my-app', level: 'debug' })

log.debug('This is a debug message')
```

## Log

### Properties

#### level
(String) Minimum log output level. Logs below this level will not be shown.

#### preciseTime
(Boolean) Show milliseconds in timestamp.

### Functions

#### *this*(options)
Returns a child instance. `options` may be either a String (name) or an object containing optional properties.

#### color(id, string)
Returns a colored string if `process.stdout` supports TTY output. `id` is an ANSI.SYS escape string (for example `'97'`), a semi-complete list of which can be found [here](https://stackoverflow.com/a/38617204).

### Default log levels
All functions take a single argument, which may be of any type (Objects and Errors are handled specially).

#### trace
For debug messages that are only needed in specific, rare cases.

#### debug
For general debug messages that developers might want to see.

#### dwarn | deprecate | deprecated | deprecation
For deprecation warnings that developers should see.

#### info | log
For generic messages that users might want to see.

#### warn
For warnings that something *might* be broken or needs attention.

#### error
For when something *is* broken, but the program will try to continue anyway.

#### fatal
For critical errors that terminate the process.
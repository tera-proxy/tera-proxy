module.exports = port => {
	const lines = require('child_process').spawnSync('netstat', '-abno -p TCP'.split(' ')).stdout.toString().split('\n')

	for(let i = 0; i < lines.length; i++) lines[i] = lines[i].trim().replace(/ +/g, ' ').split(' ')

	for(let i = 0; i < lines.length; i++) {
		let line = lines[i]

		if(line[0] == 'TCP' && line[1] == '0.0.0.0:' + port && line[2] == '0.0.0.0:0') {
			const pid = line[4]

			if(pid === '4') return 'Kernel (Microsoft IIS?)'

			let proc

			for(let i2 = 1; i2 < 4; i2++) {
				if(!lines[++i] || lines[i].length !== 1) break

				if(proc = /\[(.+?)\]/.exec(lines[i])) {
					proc = proc[1]
					break
				}
			}

			return (proc || 'unknown') + ':' + pid
		}
	}
}
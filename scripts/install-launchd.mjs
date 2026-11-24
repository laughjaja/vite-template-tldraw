// Install only jastldraw's own user LaunchAgent. Preserve an existing plist before replacing it.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

if (process.platform !== 'darwin') throw new Error('This installer requires macOS.')
const label = 'com.ja.jastldraw.server'
const home = homedir()
const runtime = path.join(home, '.local', 'share', 'jastldraw', 'runtime')
const existingNode = path.join(home, '.hermes', 'node', 'bin', 'node')
const nodeBinary = existsSync(existingNode) ? existingNode : process.execPath
if (!existsSync(path.join(runtime, '.server-dist/server/nativeServer.js'))) throw new Error('Install the runtime first: npm run install:runtime')
const agents = path.join(home, 'Library', 'LaunchAgents')
const logs = path.join(home, 'Library', 'Logs')
await mkdir(agents, { recursive: true })
await mkdir(logs, { recursive: true })
const plist = path.join(agents, `${label}.plist`)
let previousPlist = ''
if (existsSync(plist)) {
	previousPlist = await readFile(plist, 'utf8')
	const previous = spawnSync('/usr/bin/plutil', ['-extract', 'Label', 'raw', '-o', '-', plist], { encoding: 'utf8' })
	if (previous.status !== 0 || previous.stdout.trim() !== label) throw new Error('Existing plist does not belong to this app. No change made.')
	await copyFile(plist, `${plist}.backup-${Date.now()}`)
}
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(nodeBinary)}</string><string>${xml(path.join(runtime, '.server-dist/server/nativeServer.js'))}</string></array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string><key>HOST</key><string>127.0.0.1</string><key>PORT</key><string>4173</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(path.join(logs, 'jastldraw.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, 'jastldraw.err.log'))}</string>
</dict></plist>`
await writeFile(plist, contents, { mode: 0o600 })
const domain = `gui/${process.getuid()}`
const running = spawnSync('/bin/launchctl', ['print', `${domain}/${label}`], { stdio: 'ignore' }).status === 0
if (running && previousPlist === contents) {
	const restart = spawnSync('/bin/launchctl', ['kickstart', '-k', `${domain}/${label}`], { stdio: 'inherit' })
	if (restart.status !== 0) throw new Error('Could not restart the existing app job.')
} else {
	const removal = spawnSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' })
	// launchd completes unregistering an old job asynchronously after bootout returns.
	if (removal.status === 0) await new Promise((resolve) => setTimeout(resolve, 2000))
	let bootstrap = spawnSync('/bin/launchctl', ['bootstrap', domain, plist], { stdio: 'inherit' })
	if (bootstrap.status !== 0 && removal.status === 0 && spawnSync('/bin/launchctl', ['print', `${domain}/${label}`], { stdio: 'ignore' }).status !== 0) {
		await new Promise((resolve) => setTimeout(resolve, 3000))
		bootstrap = spawnSync('/bin/launchctl', ['bootstrap', domain, plist], { stdio: 'inherit' })
	}
	if (bootstrap.status !== 0) throw new Error('LaunchAgent bootstrap failed. Preserved plist backup is available beside the installed plist.')
}
console.log(`Installed ${label}: starts at user login and restarts after process failure. Tailscale settings were not changed.`)

// Install an immutable runtime release outside macOS's protected Documents directory.
import { cp, mkdir, rename, rm, chmod, lstat, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = path.join(homedir(), '.local', 'share', 'jastldraw')
const release = path.join(base, 'releases', new Date().toISOString().replace(/[:.]/g, '-'))
const runtime = path.join(base, 'runtime')
for (const name of ['dist/index.html', '.server-dist/server/nativeServer.js', 'package-lock.json']) {
	if (!existsSync(path.join(source, name))) throw new Error(`Missing build artifact: ${name}. Run npm run build first.`)
}
await mkdir(release, { recursive: true, mode: 0o700 })
try {
	for (const name of ['dist', '.server-dist', 'package.json', 'package-lock.json']) await cp(path.join(source, name), path.join(release, name), { recursive: true })
	for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
		if (!existsSync(path.join(source, name))) continue
		await cp(path.join(source, name), path.join(release, name))
		await chmod(path.join(release, name), 0o600)
	}
	const npm = path.join(path.dirname(process.execPath), 'npm')
	const install = spawnSync(npm, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
		cwd: release, stdio: 'inherit', env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ''}` },
	})
	if (install.status !== 0) throw new Error('Runtime dependency installation failed; active release was not changed.')
	const next = path.join(base, `runtime-next-${process.pid}`)
	await symlink(release, next)
	if (existsSync(runtime) && !(await lstat(runtime)).isSymbolicLink()) {
		await rename(runtime, path.join(base, `runtime-backup-${Date.now()}`))
	}
	await rename(next, runtime)
	console.log('Installed runtime release. Existing releases were preserved. Restart the launch agent to activate it.')
} catch (error) {
	await rm(release, { recursive: true, force: true })
	throw error
}

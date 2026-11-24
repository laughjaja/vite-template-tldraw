import { randomUUID } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface StorageConfig {
	root: string
	source: 'runtime' | 'config' | 'env' | 'default'
}

export interface WorkspaceSummary {
	id: string
	name: string
	revision: number
	updatedAt: string
}

export interface WorkspaceRecord extends WorkspaceSummary {
	snapshot: unknown
	comments: unknown
}

export interface WorkspaceSaveInput {
	id: string
	name: string
	snapshot: unknown
	comments?: unknown
	baseRevision?: number
}

const WORKSPACE_FILE = 'workspace.json'
const VERSIONS_DIR = 'versions'
const CONFIG_DIR = process.env.JASTLDRAW_CONFIG_DIR || path.join(os.homedir(), '.config', 'jastldraw')
const CONFIG_FILE = path.join(CONFIG_DIR, 'storage.json')
const DEFAULT_ROOT = path.join(os.homedir(), 'Documents', 'jastldraw-workspaces')

let runtimeRoot: string | null = null
let cachedConfig: Promise<StorageConfig> | null = null

export class WorkspaceConflictError extends Error {
	current: WorkspaceSummary

	constructor(current: WorkspaceSummary) {
		super(`Workspace changed on disk (revision ${current.revision}).`)
		this.name = 'WorkspaceConflictError'
		this.current = current
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function cleanEnv(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed ? trimmed : undefined
}

function normalizePath(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) throw new Error('Enter a folder path.')
	const expanded =
		trimmed === '~'
			? os.homedir()
			: trimmed.startsWith('~/')
				? path.join(os.homedir(), trimmed.slice(2))
				: trimmed
	if (!path.isAbsolute(expanded)) {
		throw new Error(`Folder path must be absolute or start with ~: ${trimmed}`)
	}
	return path.resolve(expanded)
}

export async function validateStorageRoot(input: string): Promise<string> {
	const root = normalizePath(input)
	let stats
	try {
		stats = await fs.stat(root)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`Storage folder does not exist: ${root}. Create it or choose a different folder.`)
		}
		throw new Error(`Cannot access storage folder ${root}: ${message(error)}`)
	}
	if (!stats.isDirectory()) throw new Error(`Storage path is not a folder: ${root}`)
	try {
		await fs.access(root, fsConstants.W_OK)
	} catch {
		throw new Error(`Storage folder is not writable: ${root}. Choose a folder you can write to.`)
	}
	const probe = path.join(root, `.jastldraw-write-test-${randomUUID()}`)
	try {
		await fs.writeFile(probe, '', 'utf-8')
	} catch (error) {
		throw new Error(`Cannot write to storage folder ${root}: ${message(error)}`)
	} finally {
		await fs.rm(probe, { force: true }).catch(() => undefined)
	}
	return root
}

async function withStorageTimeout<T>(operation: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(Object.assign(new Error('Reading workspace storage timed out. Choose an accessible local folder in Settings. Existing files were not changed.'), { code: 'ETIMEDOUT' })), 5000)
	})
	try { return await Promise.race([operation, timeout]) }
	finally { clearTimeout(timer) }
}

function readTextFile(filename: string): Promise<string> {
	return withStorageTimeout(fs.readFile(filename, 'utf-8'))
}

async function readConfiguredRoot(): Promise<string | null> {
	let raw: string
	try {
		raw = await readTextFile(CONFIG_FILE)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
		throw new Error(`Cannot read storage config ${CONFIG_FILE}: ${message(error)}`)
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new Error(`Storage config ${CONFIG_FILE} is not valid JSON. Fix or remove it, then restart.`)
	}
	const configured = (parsed as { root?: unknown } | null)?.root
	if (typeof configured !== 'string' || !configured.trim()) {
		throw new Error(`Storage config ${CONFIG_FILE} has no folder path. Fix or remove it, then restart.`)
	}
	return normalizePath(configured)
}

async function persistRoot(root: string): Promise<void> {
	try {
		await fs.mkdir(CONFIG_DIR, { recursive: true })
		const temp = path.join(CONFIG_DIR, `storage.${randomUUID()}.tmp`)
		try {
			await fs.writeFile(temp, JSON.stringify({ root }, null, 2), 'utf-8')
			await fs.rename(temp, CONFIG_FILE)
		} finally {
			await fs.rm(temp, { force: true }).catch(() => undefined)
		}
	} catch (error) {
		throw new Error(`Could not save storage config ${CONFIG_FILE}: ${message(error)}`)
	}
}

async function resolveStorageConfig(): Promise<StorageConfig> {
	if (runtimeRoot) {
		return { root: await validateStorageRoot(runtimeRoot), source: 'runtime' }
	}
	const configured = await readConfiguredRoot()
	if (configured) {
		return { root: await validateStorageRoot(configured), source: 'config' }
	}
	const envRoot = cleanEnv(process.env.TLDRAW_DATA_DIR)
	if (envRoot) {
		return { root: await validateStorageRoot(envRoot), source: 'env' }
	}
	try {
		await fs.mkdir(DEFAULT_ROOT, { recursive: true })
	} catch (error) {
		throw new Error(`Cannot create default storage folder ${DEFAULT_ROOT}: ${message(error)}`)
	}
	return { root: await validateStorageRoot(DEFAULT_ROOT), source: 'default' }
}

export function getStorageConfig(): Promise<StorageConfig> {
	if (!cachedConfig) {
		cachedConfig = resolveStorageConfig().catch((error) => {
			cachedConfig = null
			throw error
		})
	}
	return cachedConfig
}

export async function getStorageRoot(): Promise<string> {
	return (await getStorageConfig()).root
}

export async function setStorageRoot(input: string): Promise<StorageConfig> {
	const root = await validateStorageRoot(input)
	await persistRoot(root)
	runtimeRoot = root
	cachedConfig = null
	return { root, source: 'runtime' }
}


function safeId(id: string): string {
	if (!/^[a-zA-Z0-9_-]{1,96}$/.test(id)) throw new Error('Invalid workspace id.')
	return id
}

function summaryOf(record: WorkspaceRecord): WorkspaceSummary {
	return {
		id: record.id,
		name: record.name,
		revision: record.revision,
		updatedAt: record.updatedAt,
	}
}

async function workspacePath(id: string, root = ''): Promise<string> {
	root ||= await getStorageRoot()
	return path.join(root, safeId(id), WORKSPACE_FILE)
}

async function versionsPath(id: string, root = ''): Promise<string> {
	root ||= await getStorageRoot()
	return path.join(root, safeId(id), VERSIONS_DIR)
}

async function readWorkspace(id: string, root = ''): Promise<WorkspaceRecord | null> {
	try {
		const raw = await readTextFile(await workspacePath(id, root))
		const parsed = JSON.parse(raw) as WorkspaceRecord
		if (!parsed.id || !parsed.name || typeof parsed.revision !== 'number') return null
		return parsed
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
		throw error
	}
}

async function writeJsonAtomic(target: string, value: unknown) {
	await fs.mkdir(path.dirname(target), { recursive: true })
	const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`)
	try {
		await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf-8')
		await fs.rename(temp, target)
	} finally {
		await fs.rm(temp, { force: true }).catch(() => undefined)
	}
}

async function keepVersion(record: WorkspaceRecord, suffix = '', root = '') {
	const directory = await versionsPath(record.id, root)
	const file = path.join(directory, `${record.revision}${suffix}.json`)
	await writeJsonAtomic(file, record)
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
	const root = await getStorageRoot()
	const entries = await withStorageTimeout(fs.readdir(root, { withFileTypes: true }))
	const workspaces: WorkspaceSummary[] = []
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		try {
			const raw = await readTextFile(path.join(root, entry.name, WORKSPACE_FILE))
			const parsed = JSON.parse(raw) as WorkspaceRecord
			if (parsed.id && parsed.name && typeof parsed.revision === 'number') {
				workspaces.push(summaryOf(parsed))
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code
			if (code && code !== 'ENOENT') throw error
		}
	}
	return workspaces.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | null> {
	return readWorkspace(id)
}

const saveQueues = new Map<string, Promise<void>>()

export async function saveWorkspace(input: WorkspaceSaveInput): Promise<WorkspaceSummary> {
	const root = await getStorageRoot()
	const id = safeId(input.id)
	const key = path.join(root, id)
	const previous = saveQueues.get(key) ?? Promise.resolve()
	const operation = previous.then(() => saveWorkspaceRecord(input, root))
	const settled = operation.then(() => undefined, () => undefined)
	saveQueues.set(key, settled)
	try { return await operation }
	finally { if (saveQueues.get(key) === settled) saveQueues.delete(key) }
}

async function saveWorkspaceRecord(input: WorkspaceSaveInput, root: string): Promise<WorkspaceSummary> {
	const id = safeId(input.id)
	const existing = await readWorkspace(id, root)
	if (
		input.baseRevision !== undefined &&
		existing &&
		input.baseRevision !== existing.revision
	) {
		await keepVersion(existing, `-conflict-${Date.now()}`, root)
		throw new WorkspaceConflictError(summaryOf(existing))
	}
	if (!existing && input.baseRevision !== undefined && input.baseRevision !== 0) {
		throw new Error('Cannot create a workspace with a non-zero revision.')
	}

	if (existing) await keepVersion(existing, '', root)

	const record: WorkspaceRecord = {
		id,
		name: input.name.trim() || (existing?.name ?? 'Untitled workspace'),
		revision: (existing?.revision ?? 0) + 1,
		updatedAt: new Date().toISOString(),
		snapshot: input.snapshot,
		comments: input.comments ?? existing?.comments ?? [],
	}
	await writeJsonAtomic(await workspacePath(id, root), record)
	return summaryOf(record)
}

export async function listWorkspaceVersions(id: string): Promise<WorkspaceSummary[]> {
	const directory = await versionsPath(id)
	let entries: string[]
	try {
		entries = await withStorageTimeout(fs.readdir(directory))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	const versions: WorkspaceSummary[] = []
	for (const entry of entries.filter((name) => name.endsWith('.json'))) {
		try {
			const raw = await readTextFile(path.join(directory, entry))
			const parsed = JSON.parse(raw) as WorkspaceRecord
			if (parsed.id && parsed.name && typeof parsed.revision === 'number') {
				versions.push(summaryOf(parsed))
			}
		} catch {
			continue
		}
	}
	return versions.sort((a, b) => b.revision - a.revision)
}

export async function getWorkspaceVersion(id: string, revision: number): Promise<WorkspaceRecord | null> {
	try {
		const raw = await readTextFile(path.join(await versionsPath(id), `${revision}.json`))
		return JSON.parse(raw) as WorkspaceRecord
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
		throw error
	}
}

export async function restoreWorkspaceVersion(id: string, revision: number): Promise<WorkspaceSummary> {
	const version = await getWorkspaceVersion(id, revision)
	if (!version) throw new Error(`Version ${revision} was not found.`)
	return saveWorkspace({
		id,
		name: version.name,
		snapshot: version.snapshot,
		comments: version.comments,
	})
}

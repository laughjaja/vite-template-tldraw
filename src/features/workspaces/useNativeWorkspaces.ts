import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

const ACTIVE_WORKSPACE_KEY = 'jastldraw-active-workspace-v1'
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
export interface StorageConfig { root: string; source: string }
export interface WorkspaceSummary { id: string; name: string; revision: number; updatedAt: string }
export interface WorkspaceRecord extends WorkspaceSummary { snapshot: unknown; comments: unknown[] }

export function useNativeWorkspaces(editor: Editor | null, comments: unknown[]) {
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
	const [active, setActive] = useState<WorkspaceRecord | null>(null)
	const [status, setStatus] = useState('')
	const [ready, setReady] = useState(false)
	const [storage, setStorage] = useState<StorageConfig | null>(null)
	const [storageError, setStorageError] = useState('')
	const activeRef = useRef(active)
	const commentsRef = useRef(comments)
	const saving = useRef(Promise.resolve())
	const initializing = useRef(false)
	activeRef.current = active
	commentsRef.current = comments

	const refresh = useCallback(async () => {
		const response = await fetch('/api/workspaces')
		if (!response.ok) throw Error('Could not load workspaces.')
		const result = await response.json() as { workspaces: WorkspaceSummary[] }
		setWorkspaces(result.workspaces)
	}, [])

	const refreshStorage = useCallback(async () => {
		const response = await fetch('/api/storage/config')
		const result = await response.json() as { config?: StorageConfig; error?: string }
		if (!response.ok || !result.config) throw Error(result.error || 'Could not load storage configuration.')
		setStorage(result.config)
		setStorageError('')
	}, [])

	const load = useCallback(async (id: string) => {
		if (!editor) return
		await saving.current
		setReady(false)
		const response = await fetch(`/api/workspaces/${encodeURIComponent(id)}`)
		const result = await response.json() as { workspace?: WorkspaceRecord; error?: string }
		if (!response.ok || !result.workspace) throw Error(result.error || 'Could not load workspace.')
		editor.loadSnapshot(result.workspace.snapshot as Parameters<Editor['loadSnapshot']>[0])
		window.dispatchEvent(new CustomEvent('jastldraw-workspace-comments', { detail: result.workspace.comments }))
		activeRef.current = result.workspace
		setActive(result.workspace)
		localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
		setReady(true)
	}, [editor])

	const saveNow = useCallback((name?: string, forceNew = false): Promise<void> => {
		const operation = saving.current.then(async () => {
			if (!editor) return
			const current = forceNew ? null : activeRef.current
			const body = { id: current?.id ?? crypto.randomUUID(), name: name ?? current?.name ?? 'Main workspace',
				snapshot: editor.getSnapshot(), comments: commentsRef.current, baseRevision: current?.revision ?? 0 }
			const response = await fetch(`/api/workspaces/${body.id}`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
			})
			const result = await response.json() as { workspace?: WorkspaceSummary; current?: WorkspaceSummary; error?: string }
			if (!response.ok || !result.workspace) throw Error(result.current ? `Save blocked: newer revision ${result.current.revision} exists on disk. Reload that workspace before saving.` : result.error || 'Could not save workspace.')
			const record = { ...body, ...result.workspace }
			activeRef.current = record
			setActive(record)
			localStorage.setItem(ACTIVE_WORKSPACE_KEY, record.id)
			setReady(true)
			setStatus('Saved')
			await refresh()
		})
		saving.current = operation.catch(() => undefined)
		return operation
	}, [editor, refresh])

	const setStorageFolder = useCallback(async (folderPath: string) => {
		try {
			await saving.current
			const response = await fetch('/api/storage/set-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: folderPath }) })
			const result = await response.json() as { config?: StorageConfig; error?: string }
			if (!response.ok || !result.config) throw Error(result.error || 'Could not set storage folder.')
			setReady(false)
			activeRef.current = null
			setActive(null)
			localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
			initializing.current = false
			setStorage(result.config)
			setStorageError('')
			await refresh()
			setStatus('Folder changed. Existing files remain in their original folder. Save this canvas to create a workspace here.')
		} catch (error) { setStorageError(message(error)) }
	}, [refresh])

	useEffect(() => {
		void refresh().catch((error) => setStatus(message(error)))
		void refreshStorage().catch((error) => setStorageError(message(error)))
	}, [refresh, refreshStorage])

	useEffect(() => {
		if (!editor || !storage || initializing.current) return
		initializing.current = true
		const storedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY)
		if (storedId) void load(storedId).catch((error) => setStatus(message(error)))
		else setReady(true)
	}, [editor, storage, load])

	useEffect(() => {
		if (!editor || !ready) return
		let timer = 0
		const schedule = () => {
			window.clearTimeout(timer)
			timer = window.setTimeout(() => { void saveNow().catch((error) => setStatus(message(error))) }, 1500)
		}
		const unsubscribe = editor.store.listen(schedule, { scope: 'document', source: 'user' })
		return () => { window.clearTimeout(timer); unsubscribe() }
	}, [editor, ready, saveNow])

	const previousComments = useRef(comments)
	useEffect(() => {
		const changed = previousComments.current !== comments
		previousComments.current = comments
		if (!changed || !ready || !activeRef.current) return
		const timer = window.setTimeout(() => { void saveNow().catch((error) => setStatus(message(error))) }, 1500)
		return () => window.clearTimeout(timer)
	}, [comments, ready, saveNow])

	const createWorkspace = useCallback(async (name: string) => {
		try { await saveNow(name, true) } catch (error) { setStatus(message(error)) }
	}, [saveNow])

	const restore = useCallback(async (revision: number) => {
		try {
			await saving.current
			const current = activeRef.current
			if (!current) return
			const response = await fetch(`/api/workspaces/${encodeURIComponent(current.id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }) })
			const result = await response.json() as { workspace?: WorkspaceSummary; error?: string }
			if (!response.ok || !result.workspace) throw Error(result.error || 'Could not restore version.')
			await load(result.workspace.id)
			setStatus(`Restored revision ${revision}`)
		} catch (error) { setStatus(message(error)) }
	}, [load])

	return { workspaces, active, status, setStatus, storage, storageError, setStorageFolder, load, saveNow, createWorkspace, restore }
}

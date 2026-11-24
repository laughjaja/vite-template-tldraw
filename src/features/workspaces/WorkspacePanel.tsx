import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import { useNativeWorkspaces, type WorkspaceSummary } from './useNativeWorkspaces'

interface WorkspacePanelProps {
	editor: Editor | null
	comments: unknown[]
}

interface Version {
	revision: number
	updatedAt: string
}

export function WorkspacePanel({ editor, comments }: WorkspacePanelProps) {
	const workspaces = useNativeWorkspaces(editor, comments)
	const [versions, setVersions] = useState<Version[]>([])
	const [folderInput, setFolderInput] = useState('')

	useEffect(() => {
		if (workspaces.storage) setFolderInput(workspaces.storage.root)
	}, [workspaces.storage])

	useEffect(() => {
		if (!workspaces.active) return
		void fetch(`/api/workspaces/${workspaces.active.id}/versions`)
			.then((response) => response.json())
			.then((result: { versions: Version[] }) => setVersions(result.versions))
			.catch(() => setVersions([]))
	}, [workspaces.active])

	const create = () => {
		const name = window.prompt('Workspace name', 'New workspace')
		if (name?.trim()) void workspaces.createWorkspace(name.trim())
	}

	return (
		<div style={{ display: 'grid', gap: 10, padding: 12 }}>
			<strong>Workspaces</strong>
			<div style={{ display: 'grid', gap: 6 }}>
				<strong>Workspace folder</strong>
				<span>Current: {workspaces.storage?.root ?? 'Loading…'}</span>
				<small>Enter a full folder path. Changing folders does not move existing files.</small>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<input
						aria-label="Storage folder path"
						value={folderInput}
						onChange={(event) => setFolderInput(event.target.value)}
						style={{ flex: '1 1 220px', minWidth: 0 }}
					/>
					<button
						type="button"
						disabled={!folderInput.trim()}
						onClick={() => void workspaces.setStorageFolder(folderInput.trim())}
					>
						Set folder
					</button>

				</div>
				{workspaces.storageError && (
					<span role="alert" style={{ color: '#b91c1c' }}>
						{workspaces.storageError}
					</span>
				)}
			</div>
			<select
				value={workspaces.active?.id ?? ''}
				onChange={(event) => {
					const id = event.target.value
					if (id) void workspaces.load(id)
				}}
			>
				<option value="">Select workspace</option>
				{workspaces.workspaces.map((workspace: WorkspaceSummary) => (
					<option key={workspace.id} value={workspace.id}>
						{workspace.name} · r{workspace.revision}
					</option>
				))}
			</select>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				<button type="button" onClick={create}>
					New
				</button>
				<button type="button" onClick={() => void workspaces.saveNow()}>
					Save now
				</button>
			</div>
			{workspaces.active && (
				<>
					<span>Saved revision: {workspaces.active.revision}</span>
					<select
						onChange={(event) => {
							const revision = Number(event.target.value)
							if (revision) void workspaces.restore(revision)
						}}
						defaultValue=""
					>
						<option value="">Restore version…</option>
						{versions.map((version) => (
							<option key={version.revision} value={version.revision}>
								r{version.revision} · {new Date(version.updatedAt).toLocaleString()}
							</option>
						))}
					</select>
				</>
			)}
			{workspaces.status && <span style={{ opacity: 0.75 }}>{workspaces.status}</span>}
		</div>
	)
}

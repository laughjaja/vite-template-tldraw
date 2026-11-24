import { useState } from 'react'
import { createShapeId, useValue, type Editor } from 'tldraw'
import { getNodeDefinitions, type NodeType } from '../../workflowOfficial/nodes/nodeTypes'
import { executionState, startExecution, stopExecution } from '../../workflowOfficial/execution/executionState'

interface WorkflowPanelProps {
	editor?: Editor
}

export function WorkflowPanel({ editor }: WorkflowPanelProps) {
	const running = useValue('workflow running', () => !!editor && !!executionState.get(editor).runningGraph, [editor])
	const [error, setError] = useState('')
	const [nodeType, setNodeType] = useState<NodeType['type']>('ai')
	const addNode = () => {
		if (!editor) return
		const id = createShapeId()
		const definition = getNodeDefinitions(editor)[nodeType]
		const center = editor.getViewportPageBounds().center
		editor.markHistoryStoppingPoint('create workflow node')
		editor.createShape({ id, type: 'node', x: center.x - 150, y: center.y - 70, props: { node: definition.getDefault() } }).select(id)
	}

	const run = async () => {
		if (!editor || running) return
		const selected = editor.getSelectedShapes().filter((shape) => shape.type === 'node')
		const nodes =
			selected.length > 0
				? selected
				: editor.getCurrentPageShapes().filter((shape) => shape.type === 'node')
		if (nodes.length === 0) {
			setError('Add a workflow node first.')
			return
		}
		setError('')
		try {
			await startExecution(
				editor,
				new Set(nodes.map((shape) => shape.id))
			)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause))
		}
	}

	const stop = () => {
		if (!editor) return
		stopExecution(editor)
	}

	return (
		<div style={{ display: 'grid', gap: 10, padding: 12 }}>
			<p style={{ margin: 0, opacity: 0.75 }}>
				Build a workflow with nodes and connections, then run it manually. AI steps only call the
				server when they execute.
			</p>
			<div style={{ display: 'flex', gap: 8 }}>
				<select aria-label="Workflow node type" value={nodeType} onChange={(event) => setNodeType(event.target.value as NodeType['type'])}>
					{editor && Object.values(getNodeDefinitions(editor)).map((definition) => <option key={definition.type} value={definition.type}>{definition.title}</option>)}
				</select>
				<button type="button" onClick={addNode} disabled={!editor || running}>Add node</button>
			</div>
			<p style={{ margin: 0 }}>Drag an output port to an input port to connect nodes.</p>
			<div style={{ display: 'flex', gap: 8 }}>
				<button type="button" onClick={() => void run()} disabled={!editor || running}>
					{running ? 'Running…' : 'Run workflow'}
				</button>
				<button type="button" onClick={stop} disabled={!running}>
					Stop
				</button>
			</div>
			{error && <p style={{ margin: 0, color: 'var(--color-warn, #b45309)' }}>{error}</p>}
		</div>
	)
}

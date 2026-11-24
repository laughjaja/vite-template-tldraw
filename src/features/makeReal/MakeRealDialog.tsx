import { useState } from 'react'
import type { Editor } from 'tldraw'
import { makeReal } from './makeReal'

export function MakeRealDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
	const [instruction, setInstruction] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	async function generate() {
		if (!editor || busy) return
		setBusy(true)
		setError('')
		try { await makeReal(editor, instruction); onClose() }
		catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
		finally { setBusy(false) }
	}
	return <div className="ws-modal-backdrop" onKeyDown={(event) => event.stopPropagation()}><section className="make-real-dialog" role="dialog" aria-modal="true" aria-labelledby="make-real-title">
		<h2 id="make-real-title">Make Real</h2>
		<p>Select a wireframe to generate a prototype. Select a previous prototype with annotations to refine its HTML.</p>
		<label htmlFor="make-real-instruction">Instructions or changes</label>
		<textarea id="make-real-instruction" rows={4} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the design or changes you want…" disabled={busy} />
		{error && <p role="alert">{error}</p>}
		<div><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" onClick={() => void generate()} disabled={!editor || busy}>{busy ? 'Generating…' : 'Generate prototype'}</button></div>
	</section></div>
}

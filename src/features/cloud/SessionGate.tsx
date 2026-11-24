import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import './cloud.css'

export function SessionGate({ children }: { children: (signOut: () => void) => ReactNode }) {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null)
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	const checkSession = useCallback(async () => {
		try {
			const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
			const data = await response.json()
			if (!response.ok) throw new Error(data.error || `Session check failed (HTTP ${response.status}).`)
			setAuthenticated(data.authenticated === true)
			setError('')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not reach sign-in service.')
			setAuthenticated(false)
		}
	}, [])

	useEffect(() => {
		void checkSession()
		const onFocus = () => void checkSession()
		window.addEventListener('focus', onFocus)
		return () => window.removeEventListener('focus', onFocus)
	}, [checkSession])

	async function signIn(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError('')
		try {
			const response = await fetch('/api/session', {
				method: 'POST', credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
			})
			const data = await response.json()
			if (!response.ok || !data.authenticated) throw new Error(data.error || 'Sign-in failed.')
			setPassword('')
			setAuthenticated(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Sign-in failed.')
		} finally { setBusy(false) }
	}

	async function signOut() {
		try {
			const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' })
			if (!response.ok) throw new Error('Sign-out failed. Please retry.')
			setAuthenticated(false)
		} catch (err) { window.alert(err instanceof Error ? err.message : 'Sign-out failed.') }
	}

	if (authenticated) return children(() => void signOut())
	return <main className="cloud-login">
		<form onSubmit={(event) => void signIn(event)}>
			<h1>jastldraw</h1>
			<p>Sign in to your shared workspace.</p>
			{authenticated === null ? <p role="status">Checking session…</p> : <>
				<label htmlFor="workspace-password">Workspace password</label>
				<input id="workspace-password" type="password" autoComplete="current-password" value={password}
					onChange={(event) => setPassword(event.target.value)} required autoFocus disabled={busy} />
				<button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
			</>}
			{error && <p role="alert">{error}</p>}
		</form>
	</main>
}

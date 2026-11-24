// Exercise a separately started native test server; never point this at the live workspace.
import assert from 'node:assert/strict'
import path from 'node:path'
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4174'
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname) || new URL(origin).port === '4173') throw Error('Use an isolated test server, not the live app.')
const root = process.env.TEST_DATA_ROOT
if (!root) throw Error('TEST_DATA_ROOT must name an existing isolated test folder.')
async function request(route, method = 'GET', body, expected = 200) {
	const response = await fetch(origin + route, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
	assert.equal(response.status, expected, `${method} ${route}`)
	return response
}
const health = await (await request('/api/system/health')).json()
assert.equal(health.ok, true)
assert.equal(health.ai.geminiConfigured, false)
assert.equal(health.ai.agentProviderConfigured, false)
await request('/api/storage/set-folder', 'POST', null, 400)
await request('/api/workspaces', 'POST', null, 400)
await request('/api/storage/select-folder', 'POST', {}, 410)
await request('/api/storage/set-folder', 'POST', { path: 'relative/folder' }, 400)
await request('/api/storage/set-folder', 'POST', { path: root })
const id = `native-test-${Date.now()}`
const snapshot = { fixture: 'first canvas', document: { store: {} } }
const first = await (await request(`/api/workspaces/${id}`, 'POST', { name: 'Native fixture', snapshot, comments: [{ text: 'preserve this' }], baseRevision: 0 })).json()
assert.equal(first.workspace.revision, 1)
const updates = await Promise.all(['second', 'racing'].map(fixture => fetch(`${origin}/api/workspaces/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Native fixture', snapshot: { fixture }, baseRevision: 1 }) })))
assert.deepEqual(updates.map(response => response.status).sort(), [200,409])
const versions = await (await request(`/api/workspaces/${id}/versions`)).json()
assert.ok(versions.versions.some(version => version.revision === 1))
const restore = await (await request(`/api/workspaces/${id}/restore`, 'POST', { revision: 1 })).json()
assert.equal(restore.workspace.revision, 3)
const restored = await (await request(`/api/workspaces/${id}`)).json()
assert.deepEqual(restored.workspace.snapshot, snapshot)
assert.equal(restored.workspace.comments[0].text, 'preserve this')
await request('/api/storage/set-folder', 'POST', { path: path.join(root, '..', 'other') })
await request(`/api/workspaces/${id}`, 'GET', undefined, 404)
await request('/api/storage/set-folder', 'POST', { path: root })
assert.equal((await (await request(`/api/workspaces/${id}`)).json()).workspace.revision, 3)
await request('/api/not-a-route', 'GET', undefined, 404)
await request('/api/chat', 'POST', {}, 503)
await request('/api/make-real', 'POST', {}, 400)
await request('/%E0%A4%A', 'GET', undefined, 400)
await request('/', 'POST', {}, 405)
await request('/.env', 'GET', undefined, 404)
await request('/')
console.log(`PASS: native production HTTP, storage paths, null-body handling, versioned persistence, concurrent-save conflict, restore, folder switching, static errors, missing AI credentials. Fixture ${id}`)

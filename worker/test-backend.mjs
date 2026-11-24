// Run against an isolated local Wrangler instance with WORKSPACE_PASSWORD set to the test fixture.
// node worker/test-backend.mjs http://127.0.0.1:8791
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'

const origin = process.argv[2] ?? 'http://127.0.0.1:8791'
const password = 'integration-test-only-password'
let cookie = ''
let assertions = 0
async function expectStatus(path, status, options = {}) {
	const response = await fetch(`${origin}${path}`, options)
	assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}`)
	assertions++
	return response
}
const session = await expectStatus('/api/session', 200)
assert.equal((await session.json()).authenticated, false)
await expectStatus('/api/connect/jastldraw-default?sessionId=test', 401)
await expectStatus('/api/uploads/protected', 401)
await expectStatus('/api/uploads/protected', 401, { method: 'PUT', body: 'denied' })
await expectStatus('/api/session', 400, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' })
await expectStatus('/api/session', 401, { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
await expectStatus('/api/session', 403, { method: 'POST', headers: { Origin: 'https://attacker.invalid' }, body: JSON.stringify({ password }) })
const login = await expectStatus('/api/session', 200, { method: 'POST', body: JSON.stringify({ password }) })
const setCookie = login.headers.get('Set-Cookie')
assert.match(setCookie, /HttpOnly/)
assert.match(setCookie, /SameSite=Strict/)
cookie = setCookie.split(';')[0]
const signedSession = await expectStatus('/api/session', 200, { headers: { Cookie: cookie } })
assert.equal((await signedSession.json()).authenticated, true)
const tamperedCookie = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0')
await expectStatus('/api/uploads/protected', 401, { headers: { Cookie: tamperedCookie } })
await expectStatus('/api/connect/another-room?sessionId=test', 404, { headers: { Cookie: cookie } })
await expectStatus('/api/connect/jastldraw-default?sessionId=test', 426, { headers: { Cookie: cookie } })
await expectStatus('/api/agent/chat', 503, { method: 'POST', headers: { Cookie: cookie }, body: '{}' })
const health = await expectStatus('/api/agent/health', 200, { headers: { Cookie: cookie } })
assert.equal((await health.json()).disabled, true)
const asset = `/api/uploads/audit-${Date.now()}.svg`
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
await expectStatus(asset, 200, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/svg+xml' }, body: svg })
const download = await expectStatus(asset, 200, { headers: { Cookie: cookie } })
assert.equal(await download.text(), svg)
assert.match(download.headers.get('Content-Security-Policy'), /sandbox/)
assert.equal(download.headers.get('X-Content-Type-Options'), 'nosniff')
await expectStatus(asset, 409, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'image/svg+xml' }, body: svg })
await expectStatus(`${asset}-html`, 415, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'text/html' }, body: '<script>alert(1)</script>' })
await expectStatus(asset, 401)

const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/connect/jastldraw-default?sessionId=audit-${Date.now()}`, { headers: { Cookie: cookie, Origin: origin } })
await once(ws, 'open')
ws.send(JSON.stringify({ type: 'ping' }))
const [message] = await once(ws, 'message')
assert.equal(JSON.parse(message.toString()).type, 'pong')
assertions++
ws.close()
await once(ws, 'close')
const logout = await expectStatus('/api/session', 200, { method: 'DELETE', headers: { Cookie: cookie } })
assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/)
console.log(`PASS: ${assertions} backend HTTP/WebSocket assertions; signed cookie, tamper rejection, auth gates, private R2, parked Gemini.`)

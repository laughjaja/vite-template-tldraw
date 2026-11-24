// Isolated fixture credentials only. No Cloudflare account or user secrets required.
// node worker/test-auth.mjs
import assert from 'node:assert/strict'
import { handleSession, isAuthenticated } from './auth.ts'

const fixturePassword = 'integration-test-only-password'
const env = {
	WORKSPACE_PASSWORD: fixturePassword,
	AUTH_RATE_LIMITER: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) },
}
const login = (body, extra = {}) => new Request('https://workspace.example/api/session', { method: 'POST', body, ...extra })
assert.equal((await handleSession(login('{}'), {})).status, 503)
assert.equal(await isAuthenticated(new Request('https://workspace.example/api/uploads/foo'), {}), false)
assert.equal((await handleSession(login('null'), env)).status, 400)
assert.equal((await handleSession(login('{'), env)).status, 400)
assert.equal((await handleSession(login(JSON.stringify({ password: 1 })), env)).status, 400)
assert.equal((await handleSession(login(JSON.stringify({ password: 'wrong' })), env)).status, 401)
const response = await handleSession(login(JSON.stringify({ password: fixturePassword })), env)
assert.equal(response.status, 200)
const cookieHeader = response.headers.get('Set-Cookie')
assert.match(cookieHeader, /; Secure/)
assert.match(cookieHeader, /; HttpOnly/)
const cookie = cookieHeader.split(';')[0]
const authRequest = (value) => new Request('https://workspace.example/api/uploads/foo', { headers: { Cookie: value } })
assert.equal(await isAuthenticated(authRequest(cookie), env), true)
assert.equal(await isAuthenticated(authRequest(cookie + 'tampered'), env), false)
assert.equal(await isAuthenticated(authRequest(cookie), { WORKSPACE_PASSWORD: 'rotated-password' }), false)
const [name, value] = cookie.split('=')
const parts = value.split('.')
parts[1] = String(Math.floor(Date.now() / 1000) - 1)
assert.equal(await isAuthenticated(authRequest(`${name}=${parts.join('.')}`), env), false)
assert.equal((await handleSession(login(JSON.stringify({ password: fixturePassword }), { headers: { Origin: 'https://attacker.invalid' } }), env)).status, 403)
const limited = { ...env, AUTH_RATE_LIMITER: { idFromName: (name) => name, get: () => ({ fetch: async () => new Response(null, { status: 429 }) }) } }
assert.equal((await handleSession(login(JSON.stringify({ password: fixturePassword })), limited)).status, 429)
console.log('PASS: auth fail-closed, malformed/null body, invalid password, Secure/HttpOnly cookie, signed session, tampering, password rotation, expiry, cross-origin, rate limit.')

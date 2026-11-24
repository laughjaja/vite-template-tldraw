// Local integration test only. Never point this test at a user's production board.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import WebSocket from 'ws'
import { atom } from '@tldraw/state'
import { Store } from '@tldraw/store'
import { DocumentRecordType, PageRecordType } from '@tldraw/tlschema'
import { TLSyncClient } from '@tldraw/sync-core'
import { schema } from '../worker/schema.ts'

globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 16)
globalThis.cancelAnimationFrame ??= clearTimeout
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8791'
assert.ok(new URL(origin).hostname === '127.0.0.1' || new URL(origin).hostname === 'localhost', 'Local targets only')
const password = process.env.TEST_WORKSPACE_PASSWORD || 'integration-test-only-password'
const response = await fetch(`${origin}/api/session`, {
	method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '127.0.0.29' },
	body: JSON.stringify({ password }),
})
assert.equal(response.status, 200, 'test fixture sign-in')
const cookie = response.headers.get('set-cookie').split(';')[0]
const fixturePath = '.wrangler/sync-test-fixture.json'
const clients = []

class TestSocket {
	connectionStatus = 'offline'
	messages = new Set()
	statuses = new Set()
	sendMessage = (message) => this.ws.send(JSON.stringify(message))
	onReceiveMessage = (callback) => { this.messages.add(callback); return () => this.messages.delete(callback) }
	onStatusChange = (callback) => { this.statuses.add(callback); return () => this.statuses.delete(callback) }
	close = () => { this.ws.close(); this.connectionStatus = 'offline' }
	restart = () => { throw new Error('Unexpected reconnect in integration test') }
	constructor() {
		const url = new URL('/api/connect/jastldraw-default', origin)
		url.protocol = 'ws:'
		url.searchParams.set('sessionId', crypto.randomUUID())
		this.ws = new WebSocket(url, { headers: { Cookie: cookie, Origin: origin } })
		this.ws.on('open', () => { this.connectionStatus = 'online'; this.statuses.forEach((callback) => callback({ status: 'online' })) })
		this.ws.on('message', (data) => { const message = JSON.parse(String(data)); this.messages.forEach((callback) => callback(message)) })
		this.ws.on('error', (error) => { this.connectionStatus = 'error'; this.statuses.forEach((callback) => callback({ status: 'error', reason: error.message })) })
	}
}

async function connect() {
	const store = new Store({ schema, props: {} })
	const socket = new TestSocket()
	let readyResolve, readyReject
	const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
	const client = new TLSyncClient({ store, socket, presence: atom('test-presence', null), onLoad() {}, onAfterConnect: readyResolve, onSyncError: readyReject })
	clients.push({ client, socket })
	await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))])
	return store
}
async function waitFor(predicate, label) {
	const end = Date.now() + 10000
	while (!predicate()) {
		if (Date.now() > end) throw new Error(`Timed out: ${label}`)
		await new Promise((resolve) => setTimeout(resolve, 20))
	}
}

try {
	if (process.argv.includes('--verify-restart')) {
		const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
		const store = await connect()
		for (const id of fixture.ids) assert.ok(store.get(id), `SQLite retained ${id} after worker restart`)
		assert.equal(store.get(fixture.ids[0]).props.title, 'Updated from second device')
		assert.ok(store.get('document:document').meta[fixture.commentKey], 'shared comment retained after restart')
		console.log('PASS: worker restart restored custom shapes, edits, and shared comments from SQLite')
	} else {
		const first = await connect()
		const second = await connect()
		const pageId = 'page:page'
		if (!first.get('document:document')) first.put([DocumentRecordType.create({})])
		if (!first.get(pageId)) first.put([PageRecordType.create({ id: pageId, name: 'Integration Test', index: 'a1' })])
		await waitFor(() => second.get(pageId), 'initial page sync')
		const suffix = crypto.randomUUID()
		const ids = [`shape:device-a-${suffix}`, `shape:device-b-${suffix}`]
		function makeShape(id, index, title) {
			return schema.types.shape.create({ id, type: 'document', x: 0, y: 0, rotation: 0, index, parentId: pageId, isLocked: false, opacity: 1, meta: {}, props: { w: 640, h: 520, title, html: '<p>Shared text</p>', sourceFormat: 'DOC' } })
		}
		first.put([makeShape(ids[0], 'a1', 'Device A')])
		second.put([makeShape(ids[1], 'a2', 'Device B')])
		await waitFor(() => first.get(ids[1]) && second.get(ids[0]), 'concurrent edits converge')
		second.put([{ ...second.get(ids[0]), props: { ...second.get(ids[0]).props, title: 'Updated from second device' } }])
		const commentKey = `jastldraw-comment:test-${suffix}`
		const doc = second.get('document:document')
		second.put([{ ...doc, meta: { ...doc.meta, [commentKey]: { id: `test-${suffix}`, pageId, x: 2, y: 4, text: 'Shared comment', author: 'Test', resolved: false, createdAt: Date.now(), replies: [] } } }])
		await waitFor(() => first.get(ids[0]).props.title === 'Updated from second device' && first.get('document:document').meta[commentKey], 'edits and comments sync')
		const reconnected = await connect()
		for (const id of ids) assert.ok(reconnected.get(id), 'new client sees persisted shape')
		assert.ok(reconnected.get('document:document').meta[commentKey], 'new client sees comment')
		await mkdir('.wrangler', { recursive: true })
		await writeFile(fixturePath, JSON.stringify({ ids, commentKey }))
		console.log('PASS: two clients converge concurrent custom shapes; cross-device updates and comments; fresh client reload retains document')
	}
} finally {
	for (const { client, socket } of clients) { client.close(); socket.close() }
}

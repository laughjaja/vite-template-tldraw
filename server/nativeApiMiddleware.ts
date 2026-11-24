import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import { getAgentEnvironment, hasAnyAgentProvider } from './officialAgent/environment.ts'
import { resolveGeminiApiKey } from './aiProvider.ts'
import { handleChat, handleUpload } from './chatApi.ts'
import { registerLegacyAgentRoutes } from './geminiMiddleware.ts'
import { readJsonBody, sendJson } from './httpUtils.ts'
import { handleMakeReal } from './makeRealApi.ts'
import { handleOfficialAgentStream } from './officialAgentApi.ts'
import {
	getStorageConfig,
	getWorkspace,
	getWorkspaceVersion,
	listWorkspaceVersions,
	listWorkspaces,
	restoreWorkspaceVersion,
	saveWorkspace,
	setStorageRoot,
	WorkspaceConflictError,
	type WorkspaceSaveInput,
} from './storage/workspaceStore.ts'
import { handleWorkflowAi } from './workflowApi.ts'

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function handleSystemHealth(_req: IncomingMessage, res: ServerResponse) {
	const storage = await getStorageConfig()
	const agentEnv = getAgentEnvironment()
	sendJson(res, 200, {
		ok: true,
		storage,
		ai: {
			geminiConfigured: Boolean(resolveGeminiApiKey()),
			agentProviderConfigured: hasAnyAgentProvider(agentEnv),
			providers: {
				google: Boolean(agentEnv.GOOGLE_API_KEY),
				openai: Boolean(agentEnv.OPENAI_API_KEY),
				anthropic: Boolean(agentEnv.ANTHROPIC_API_KEY),
				openrouter: Boolean(agentEnv.OPENROUTER_API_KEY),
			},
		},
	})
}

async function handleStorageConfig(res: ServerResponse) {
	sendJson(res, 200, { config: await getStorageConfig() })
}

async function handleStorageSetFolder(req: IncomingMessage, res: ServerResponse) {
	try {
		const body = await readJsonBody<{ path?: unknown }>(req)
		if (typeof body?.path !== 'string' || !body.path.trim()) {
			sendJson(res, 400, { error: 'A folder path is required.' })
			return
		}
		const config = await setStorageRoot(body.path)
		sendJson(res, 200, { config })
	} catch (error) {
		sendJson(res, 400, { error: message(error) })
	}
}


async function handleWorkspaces(req: IncomingMessage, res: ServerResponse) {
	if (req.method === 'GET') {
		sendJson(res, 200, { workspaces: await listWorkspaces() })
		return
	}
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}
	try {
		const body = await readJsonBody<Partial<WorkspaceSaveInput>>(req)
		if (!body?.snapshot) {
			sendJson(res, 400, { error: 'A workspace snapshot is required.' })
			return
		}
		const workspace = await saveWorkspace({
			id: body.id?.trim() || randomUUID(),
			name: body.name?.trim() || 'Untitled workspace',
			snapshot: body.snapshot,
			comments: body.comments,
			baseRevision: body.baseRevision,
		})
		sendJson(res, 200, { workspace })
	} catch (error) {
		if (error instanceof WorkspaceConflictError) {
			sendJson(res, 409, { error: error.message, current: error.current })
			return
		}
		sendJson(res, 400, { error: message(error) })
	}
}

async function handleWorkspace(req: IncomingMessage, res: ServerResponse, id: string) {
	if (req.method === 'GET') {
		const workspace = await getWorkspace(id)
		if (!workspace) {
			sendJson(res, 404, { error: 'Workspace not found.' })
			return
		}
		sendJson(res, 200, { workspace })
		return
	}
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}
	try {
		const body = await readJsonBody<Partial<WorkspaceSaveInput>>(req)
		if (!body?.snapshot) {
			sendJson(res, 400, { error: 'A workspace snapshot is required.' })
			return
		}
		const workspace = await saveWorkspace({
			id,
			name: body.name?.trim() || 'Untitled workspace',
			snapshot: body.snapshot,
			comments: body.comments,
			baseRevision: body.baseRevision,
		})
		sendJson(res, 200, { workspace })
	} catch (error) {
		if (error instanceof WorkspaceConflictError) {
			sendJson(res, 409, { error: error.message, current: error.current })
			return
		}
		sendJson(res, 400, { error: message(error) })
	}
}

async function handleWorkspaceVersions(res: ServerResponse, id: string) {
	sendJson(res, 200, { versions: await listWorkspaceVersions(id) })
}

async function handleWorkspaceVersion(res: ServerResponse, id: string, revision: number) {
	const workspace = await getWorkspaceVersion(id, revision)
	if (!workspace) {
		sendJson(res, 404, { error: 'Version not found.' })
		return
	}
	sendJson(res, 200, { workspace })
}

async function handleWorkspaceRestore(req: IncomingMessage, res: ServerResponse, id: string) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}
	try {
		const body = await readJsonBody<{ revision?: number }>(req)
		if (typeof body?.revision !== 'number') {
			sendJson(res, 400, { error: 'A revision is required.' })
			return
		}
		const workspace = await restoreWorkspaceVersion(id, body.revision)
		sendJson(res, 200, { workspace })
	} catch (error) {
		sendJson(res, 400, { error: message(error) })
	}
}

export function attachNativeApi(middlewares: Connect.Server) {
	registerLegacyAgentRoutes(middlewares)
	middlewares.use((req, res, next) => {
		const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
		const route = async () => {
			if (pathname === '/api/system/health') return handleSystemHealth(req, res)
			if (pathname === '/api/storage/config') {
				if (req.method !== 'GET') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}
				return handleStorageConfig(res)
			}
			if (pathname === '/api/storage/set-folder') {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}
				return handleStorageSetFolder(req, res)
			}
			if (pathname === '/api/storage/select-folder') {
				if (req.method !== 'POST') {
					sendJson(res, 405, { error: 'Method not allowed' })
					return
				}
				return sendJson(res, 410, { error: 'Enter a writable folder path in Storage settings. Native folder pickers are not used.' })
			}
			if (pathname === '/api/workspaces') return handleWorkspaces(req, res)
			if (pathname === '/stream' || pathname === '/api/agent/stream') {
				return handleOfficialAgentStream(req, res)
			}
			if (pathname === '/api/chat') return handleChat(req, res)
			if (pathname === '/api/upload') return handleUpload(req, res)
			if (pathname === '/api/make-real') return handleMakeReal(req, res)
			if (pathname === '/api/workflow/ai') return handleWorkflowAi(req, res)

			const workspaceRoute = /^\/api\/workspaces\/([^/]+)(?:\/(versions|restore))?(?:\/(\d+))?$/.exec(
				pathname
			)
			if (workspaceRoute) {
				const [, id, action, revision] = workspaceRoute
				if (action === 'versions' && revision === undefined) return handleWorkspaceVersions(res, id)
				if (action === 'versions' && revision !== undefined) {
					return handleWorkspaceVersion(res, id, Number(revision))
				}
				if (action === 'restore') return handleWorkspaceRestore(req, res, id)
				return handleWorkspace(req, res, id)
			}
			next()
		}
		void route().catch((error) => {
			if (!res.headersSent) sendJson(res, 500, { error: message(error) })
			else res.end()
		})
	})
}

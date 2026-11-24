import { useEffect, useState } from 'react'
import { EditorProvider, ErrorBoundary, useValue } from 'tldraw'
import type { TldrawAgentApp } from '../../officialAgent/agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	useAgent,
} from '../../officialAgent/agent/TldrawAgentAppProvider'
import { ChatPanel } from '../../officialAgent/components/ChatPanel'
import { AGENT_MODEL_DEFINITIONS, type AgentModelName } from '../../shared/models'

interface AgentPanelProps {
	enabled: boolean
	onEnabledChange: (enabled: boolean) => void
	agentApp?: TldrawAgentApp | null
}

function AgentToggle({ enabled, onEnabledChange }: AgentPanelProps) {
	return (
		<label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
			<input
				type="checkbox"
				checked={enabled}
				onChange={(event) => onEnabledChange(event.target.checked)}
			/>
			Enable canvas agent
		</label>
	)
}

function AgentChatFallback() {
	return <div className="agent-panel-note">Chat unavailable.</div>
}

function AgentPanelInner({ enabled, onEnabledChange }: AgentPanelProps) {
	const agent = useAgent()
	const [flow, setFlow] = useState<'single' | 'multi'>('multi')
	const [limit, setLimit] = useState(20)
	const isGenerating = useValue('isGenerating', () => agent.requests.isGenerating(), [agent])
	const modelName = useValue('modelName', () => agent.modelName.getModelName(), [agent])

	useEffect(() => {
		agent.maxFollowUpRequests = flow === 'single' ? 0 : limit
	}, [agent, flow, limit])

	useEffect(() => {
		if (!enabled) agent.cancel()
	}, [agent, enabled])

	return (
		<div className="agent-panel">
			<AgentToggle enabled={enabled} onEnabledChange={onEnabledChange} />
			{!enabled ? (
				<p className="agent-panel-note">Agent is off. Canvas edits never call the AI.</p>
			) : (
				<>
					<div className="agent-panel-settings">
						<label>
							<span>Mode</span>
							<select
								value={flow}
								onChange={(event) => setFlow(event.target.value as 'single' | 'multi')}
							>
								<option value="single">Single request</option>
								<option value="multi">Multi-step</option>
							</select>
						</label>
						{flow === 'multi' && (
							<label>
								<span>Max follow-up requests: {limit}</span>
								<input
									type="range"
									min={1}
									max={20}
									value={limit}
									onChange={(event) => setLimit(Number(event.target.value))}
								/>
							</label>
						)}
						<label>
							<span>Model</span>
							<select
								value={modelName}
								onChange={(event) =>
									agent.modelName.setModelName(event.target.value as AgentModelName)
								}
							>
								{Object.values(AGENT_MODEL_DEFINITIONS).map((model) => (
									<option key={model.name} value={model.name}>
										{model.name}
									</option>
								))}
							</select>
						</label>
					</div>
					<div className="agent-panel-actions">
						<button type="button" onClick={() => agent.reset()}>
							New chat
						</button>
						<button type="button" onClick={() => agent.cancel()} disabled={!isGenerating}>
							Stop
						</button>
					</div>
					<ErrorBoundary fallback={AgentChatFallback}>
						<div className="agent-panel-chat">
							<ChatPanel />
						</div>
					</ErrorBoundary>
				</>
			)}
		</div>
	)
}

export function AgentPanel({ agentApp, ...props }: AgentPanelProps) {
	if (!agentApp) {
		return (
			<div className="agent-panel">
				<AgentToggle {...props} />
				<p className="agent-panel-note">
					{props.enabled
						? 'Starting agent…'
						: 'Agent is off. Canvas edits never call the AI.'}
				</p>
			</div>
		)
	}

	return (
		<EditorProvider editor={agentApp.editor}>
			<TldrawAgentAppContextProvider app={agentApp}>
				<AgentPanelInner {...props} />
			</TldrawAgentAppContextProvider>
		</EditorProvider>
	)
}

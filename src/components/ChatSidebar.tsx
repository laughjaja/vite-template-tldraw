import React, { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ConnectionState } from '../agent/useGeminiAgent'
import './ChatSidebar.css'

interface ChatSidebarProps {
	isOpen: boolean
	onToggle: () => void
	messages: ChatMessage[]
	connectionState: ConnectionState
	connectionMessage: string
	model: string
	onModelChange: (model: string) => void
	availableModels: string[]
	includeScreenshot: boolean
	onToggleScreenshot: (enabled: boolean) => void
	isGenerating: boolean
	isModifyingCanvas: boolean
	activePhase: string
	globalError: string | null
	canvasStats: { shapes: number; selected: number }
	onSend: (text: string) => void
	onStop: () => void
	onClear: () => void
	onRetryHealth: () => void
}

const STARTER_PROMPTS = [
	'Build a Sprint Kanban board with Backlog, To Do, In Progress, and Done',
	'Create a Mermaid sequence diagram for a user login API flow',
	'Create a user authentication flowchart with login, validation, and error handling',
	'Read my canvas and summarize all shapes, text, and selection',
]

function renderFormattedText(text: string): React.ReactNode {
	const lines = text.split('\n')
	return lines.map((line, lineIdx) => {
		const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
		const renderedParts = parts.map((segment, segIdx) => {
			if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
				return <strong key={segIdx}>{segment.slice(2, -2)}</strong>
			}
			if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
				return (
					<code key={segIdx} className="chat-inline-code">
						{segment.slice(1, -1)}
					</code>
				)
			}
			return <React.Fragment key={segIdx}>{segment}</React.Fragment>
		})

		return (
			<React.Fragment key={lineIdx}>
				{renderedParts}
				{lineIdx < lines.length - 1 ? <br /> : null}
			</React.Fragment>
		)
	})
}

function connectionBadgeLabel(state: ConnectionState): string {
	switch (state) {
		case 'connected':
			return 'Connected'
		case 'checking':
			return 'Connecting…'
		case 'missing_key':
			return 'Key missing'
		case 'error':
			return 'Offline'
	}
}

export function ChatSidebar({
	isOpen,
	onToggle,
	messages,
	connectionState,
	connectionMessage,
	model,
	onModelChange,
	availableModels,
	includeScreenshot,
	onToggleScreenshot,
	isGenerating,
	isModifyingCanvas,
	activePhase,
	globalError,
	canvasStats,
	onSend,
	onStop,
	onClear,
	onRetryHealth,
}: ChatSidebarProps) {
	const [input, setInput] = useState('')
	const messagesEndRef = useRef<HTMLDivElement | null>(null)
	const textareaRef = useRef<HTMLTextAreaElement | null>(null)

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages, isModifyingCanvas])

	const handleSubmit = () => {
		const trimmed = input.trim()
		if (!trimmed || isGenerating) return
		setInput('')
		onSend(trimmed)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Prevent tldraw shortcuts from ever firing while typing in chat
		e.stopPropagation()
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSubmit()
		}
	}

	if (!isOpen) {
		return (
			<button
				type="button"
				className={`chat-collapsed-toggle ${isModifyingCanvas ? 'is-acting' : ''}`}
				onClick={onToggle}
				title="Open Gemini AI Assistant"
			>
				<span className={`chat-status-dot status-${connectionState}`} />
				<span>{isModifyingCanvas ? 'Modifying canvas…' : 'Gemini AI'}</span>
			</button>
		)
	}

	return (
		<aside
			className="chat-sidebar"
			aria-label="Gemini AI Canvas Assistant"
			onKeyDown={(e) => e.stopPropagation()}
		>
			<header className="chat-header">
				<div className="chat-header-top">
					<div className="chat-title-group">
						<span className="chat-sparkle" aria-hidden="true">
							✦
						</span>
						<h2 className="chat-title">Gemini Canvas AI</h2>
						<span
							className={`chat-status-pill status-${connectionState}`}
							title={connectionMessage}
						>
							<span className={`chat-status-dot status-${connectionState}`} />
							{connectionBadgeLabel(connectionState)}
						</span>
					</div>

					<div className="chat-header-actions">
						{messages.length > 0 && (
							<button
								type="button"
								className="chat-icon-btn"
								onClick={onClear}
								title="Clear conversation"
							>
								Clear
							</button>
						)}
						<button
							type="button"
							className="chat-icon-btn"
							onClick={onToggle}
							title="Collapse sidebar"
							aria-label="Collapse sidebar"
						>
							⟩
						</button>
					</div>
				</div>

				<div className="chat-toolbar">
					<label className="chat-model-label">
						<span>Model</span>
						<select
							className="chat-model-select"
							value={model}
							onChange={(e) => onModelChange(e.target.value)}
							disabled={isGenerating}
						>
							{availableModels.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					</label>

					<label className="chat-vision-toggle" title="Send a visual snapshot of the viewport to Gemini">
						<input
							type="checkbox"
							checked={includeScreenshot}
							onChange={(e) => onToggleScreenshot(e.target.checked)}
							disabled={isGenerating}
						/>
						<span>Vision</span>
					</label>
				</div>

				<div className="chat-context-bar">
					<span className="chat-context-chip">
						{canvasStats.shapes} {canvasStats.shapes === 1 ? 'shape' : 'shapes'} on page
					</span>
					<span
						className={`chat-context-chip ${canvasStats.selected > 0 ? 'has-selection' : ''}`}
					>
						{canvasStats.selected} selected
					</span>
				</div>
			</header>

			{connectionState === 'missing_key' || connectionState === 'error' ? (
				<div className="chat-banner chat-banner-warning">
					<div>
						<strong>{connectionState === 'missing_key' ? 'API key unavailable' : 'Connection issue'}:</strong>{' '}
						{connectionMessage}
					</div>
					<button type="button" className="chat-retry-btn" onClick={onRetryHealth}>
						Retry
					</button>
				</div>
			) : null}

			{isModifyingCanvas ? (
				<div className="chat-banner chat-banner-acting" role="status" aria-live="polite">
					<span className="chat-spinner" />
					<span>Modifying canvas…</span>
				</div>
			) : null}

			<div className="chat-messages">
				{messages.length === 0 ? (
					<div className="chat-empty-state">
						<p className="chat-empty-heading">Ask Gemini to read or edit your whiteboard</p>
						<p className="chat-empty-sub">
							Draw shapes manually anytime — Gemini sees your live shapes, labels, connectors,
							and selection.
						</p>
						<div className="chat-starters">
							{STARTER_PROMPTS.map((prompt) => (
								<button
									key={prompt}
									type="button"
									className="chat-starter-btn"
									onClick={() => onSend(prompt)}
									disabled={isGenerating || connectionState === 'missing_key'}
								>
									{prompt}
								</button>
							))}
						</div>
					</div>
				) : (
					messages.map((msg) => (
						<div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
							<div className="chat-msg-meta">
								<span className="chat-msg-role">
									{msg.role === 'user' ? 'You' : 'Gemini'}
								</span>
								{msg.status === 'streaming' && (
									<span className="chat-msg-badge">Streaming…</span>
								)}
								{msg.status === 'acting' && (
									<span className="chat-msg-badge acting">Updating canvas…</span>
								)}
								{msg.status === 'stopped' && (
									<span className="chat-msg-badge stopped">Stopped</span>
								)}
							</div>

							{msg.actions.length > 0 && (
								<div className="chat-actions-list">
									{msg.actions.map((act) => (
										<div
											key={act.id}
											className={`chat-action-pill ${act.ok ? 'ok' : 'failed'}`}
											title={act.error ?? act.summary}
										>
											<span className="chat-action-icon">{act.ok ? '✓' : '!'}</span>
											<span className="chat-action-text">{act.summary}</span>
										</div>
									))}
								</div>
							)}

							{msg.text ? (
								<div className="chat-msg-bubble">
									{renderFormattedText(msg.text)}
									{msg.status === 'streaming' ? (
										<span className="chat-cursor" aria-hidden="true" />
									) : null}
								</div>
							) : msg.status === 'streaming' || msg.status === 'acting' ? (
								<div className="chat-msg-bubble chat-msg-thinking">
									<span className="chat-spinner small" />
									<span>{activePhase || 'Thinking…'}</span>
								</div>
							) : null}

							{msg.error && (
								<div className="chat-msg-error" role="alert">
									{msg.error}
								</div>
							)}
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			{globalError && !isGenerating ? (
				<div className="chat-footer-error" role="alert">
					{globalError}
				</div>
			) : null}

			<form
				className="chat-composer"
				onSubmit={(e) => {
					e.preventDefault()
					handleSubmit()
				}}
			>
				{isGenerating && activePhase && (
					<div className="chat-phase-row">
						<span className="chat-spinner small" />
						<span>{activePhase}</span>
					</div>
				)}
				<div className="chat-input-row">
					<textarea
						ref={textareaRef}
						className="chat-textarea"
						rows={2}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask Gemini to create a flowchart, label shapes, or explain your selection…"
						disabled={isGenerating}
					/>
					{isGenerating ? (
						<button
							type="button"
							className="chat-stop-btn"
							onClick={onStop}
							title="Stop generation"
						>
							Stop
						</button>
					) : (
						<button
							type="submit"
							className="chat-send-btn"
							disabled={!input.trim() || connectionState === 'missing_key'}
						>
							Send
						</button>
					)}
				</div>
				<div className="chat-composer-hint">
					Enter to send · Shift+Enter for new line · Ctrl+Z undoes AI edits
				</div>
			</form>
		</aside>
	)
}

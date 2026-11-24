'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, FileUIPart, TextUIPart, UIMessage } from 'ai'
import { useCallback, useEffect } from 'react'
import { Editor } from 'tldraw'
import { useChatMessageStorage } from '../hooks/useChatMessageStorage'
import { TldrawProviderMetadata, WhiteboardImage } from '../types'
import { uploadMessageContents } from '../utils/uploadMessageContents'
import { useChatInputState } from '../hooks/useChatInputState'
import { useScrollToBottom } from '../hooks/useScrollToBottom'
import { ChatInput } from './ChatInput'
import { ImageClickTarget } from './ChatMessage'
import { MessageList } from './MessageList'
import { ClearChatIcon } from './ClearChatIcon'

interface ChatProps {
	editor?: Editor
}

export function Chat({ editor }: ChatProps) {
	const [initialMessages, saveMessages] = useChatMessageStorage()
	if (!initialMessages) return null
	return <ChatInner editor={editor} initialMessages={initialMessages} saveMessages={saveMessages} />
}

function ChatInner({
	initialMessages,
	saveMessages,
	editor,
}: {
	initialMessages: UIMessage[]
	saveMessages: (messages: UIMessage[]) => void
	editor?: Editor
}) {
	const [chatInputState, chatInputDispatch] = useChatInputState()
	const chat = useChat({
		transport: new DefaultChatTransport({
			api: '/api/chat',
			prepareSendMessagesRequest: async (options) => {
				const { messagesToSend, messagesToSave } = await uploadMessageContents(options.messages)
				chat.setMessages(messagesToSave)
				return {
					body: {
						...options.body,
						id: options.id,
						messages: messagesToSend,
						trigger: options.trigger,
						messageId: options.messageId,
					},
				}
			},
		}),
		messages: initialMessages,
	})

	const { sendMessage, status, error, clearError, setMessages } = chat

	useEffect(() => {
		if (chat.status === 'ready') saveMessages(chat.messages)
	}, [chat.status, chat.messages, saveMessages])


	const handleSendMessage = useCallback(
		(text: string, images: WhiteboardImage[]) => {
			chatInputDispatch({ type: 'clear' })
			const parts: (TextUIPart | FileUIPart)[] = images.map((image): FileUIPart => {
				const metadata: TldrawProviderMetadata = {
					snapshot: image.snapshot,
					imageName: image.name,
					url: image.url,
					type: image.type,
					width: image.width,
					height: image.height,
				}
				return {
					type: 'file',
					url: image.url,
					filename: image.name,
					mediaType: image.type,
					providerMetadata: { tldraw: metadata } as any,
				}
			})

			if (text.trim()) parts.push({ type: 'text', text })
			sendMessage({ parts })
		},
		[sendMessage, chatInputDispatch]
	)

	const scrollToBottom = useScrollToBottom()
	useEffect(() => {
		scrollToBottom()
	}, [chat.messages, scrollToBottom])

	const handleImageClick = useCallback(
		(opts: ImageClickTarget) => {
			if ('uploadedFile' in opts) {
				chatInputDispatch({
					type: 'openWhiteboard',
					uploadedFile: opts.uploadedFile,
					imageName: opts.uploadedFile.name,
				})
			} else {
				chatInputDispatch({
					type: 'openWhiteboard',
					snapshot: opts.snapshot,
					imageName: opts.imageName,
				})
			}
		},
		[chatInputDispatch]
	)

	const handleClearChat = useCallback(() => {
		setMessages([])
		saveMessages([])
	}, [setMessages, saveMessages])

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault()
		if (
			event.dataTransfer.types.includes('Files') &&
			!chatInputState.openWhiteboard &&
			!chatInputState.isDragging
		) {
			chatInputDispatch({ type: 'dragEnter' })
		}
	}

	const handleDragLeave = (event: React.DragEvent) => {
		event.preventDefault()
		if (!event.currentTarget.contains(event.relatedTarget as Node)) {
			chatInputDispatch({ type: 'dragLeave' })
		}
	}

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault()
		const file = event.dataTransfer.files[0]
		if (file && file.type.startsWith('image/') && !chatInputState.openWhiteboard) {
			chatInputDispatch({ type: 'drop', file })
		} else {
			chatInputDispatch({ type: 'dragLeave' })
		}
	}

	if (chat.messages.length === 0) {
		return (
			<div
				className="empty-chat-container"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="empty-chat-content">
					<h1 className="empty-chat-title">How can I help?</h1>
					<div className="centered-input">
						<ChatInput
							editor={editor}
							onSendMessage={handleSendMessage}
							waitingForResponse={status === 'submitted' || status === 'streaming'}
							scrollToBottom={scrollToBottom}
							state={chatInputState}
							dispatch={chatInputDispatch}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div
			className="chat-container"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<div className="chat-header">
				<button className="icon-button" onClick={handleClearChat} title="Clear chat">
					<ClearChatIcon />
				</button>
			</div>
			{error && <div role="alert" style={{ color: '#b91c1c', padding: 10 }}>{error.message} <button type="button" onClick={clearError}>Dismiss</button></div>}
			{(status === 'submitted' || status === 'streaming') && <button type="button" onClick={() => void chat.stop()}>Stop response</button>}
			<MessageList messages={chat.messages} onImageClick={handleImageClick} />
			<div className="chat-footer">
				<ChatInput
					editor={editor}
					onSendMessage={handleSendMessage}
					waitingForResponse={status === 'submitted' || status === 'streaming'}
					scrollToBottom={scrollToBottom}
					state={chatInputState}
					dispatch={chatInputDispatch}
				/>
			</div>
		</div>
	)
}

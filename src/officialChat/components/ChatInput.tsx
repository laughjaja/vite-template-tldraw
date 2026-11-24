import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { DefaultSpinner, Editor } from 'tldraw'
import { useChatInputState } from '../hooks/useChatInputState'
import { WhiteboardImage } from '../types'
import { ChatInputImage } from './ChatInputImage'
import { ImageIcon } from './icons/ImageIcon'
import { SendIcon } from './icons/SendIcon'
import { UploadIcon } from './icons/UploadIcon'
import { WhiteboardIcon } from './icons/WhiteboardIcon'
import { WhiteboardModal } from './WhiteboardModal'

interface ChatInputProps {
	onSendMessage: (message: string, images: WhiteboardImage[]) => void
	waitingForResponse: boolean
	scrollToBottom: (behavior?: ScrollBehavior) => void
	state: ReturnType<typeof useChatInputState>[0]
	dispatch: ReturnType<typeof useChatInputState>[1]
	editor?: Editor
}

export function ChatInput({
	onSendMessage,
	waitingForResponse,
	scrollToBottom,
	state,
	dispatch,
	editor,
}: ChatInputProps) {
	const { input, images, openWhiteboard, isDragging } = state
	const disabled = waitingForResponse || isDragging
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	useEffect(() => {
		if (!disabled) textareaRef.current?.focus()
	}, [disabled])

	useLayoutEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto'
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
		}
	}, [input])

	useLayoutEffect(() => {
		scrollToBottom('instant')
	}, [images, scrollToBottom])

	const canSend = !disabled && (images.length > 0 || Boolean(input.trim()))

	const send = () => {
		if (canSend) onSendMessage(input, images)
	}

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault()
		send()
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || event.shiftKey) return
		event.preventDefault()
		send()
	}

	const handleImageUpload = useCallback(() => {
		const fileInput = document.createElement('input')
		fileInput.type = 'file'
		fileInput.accept = 'image/*'
		fileInput.onchange = (event) => {
			const file = (event.target as HTMLInputElement).files?.[0]
			if (!file || !file.type.startsWith('image/')) return
			dispatch({ type: 'openWhiteboard', uploadedFile: file, imageName: file.name })
		}
		fileInput.click()
	}, [dispatch])

	const handleCancelWhiteboard = useCallback(() => {
		dispatch({ type: 'closeWhiteboard' })
	}, [dispatch])

	const handleAcceptWhiteboard = useCallback(
		(image: WhiteboardImage) => {
			dispatch({ type: 'closeWhiteboard' })
			dispatch({ type: 'setImage', image })
			textareaRef.current?.focus()
		},
		[dispatch]
	)

	const handleCanvasCapture = useCallback(async () => {
		if (!editor) return
		const shapes = editor.getSelectedShapes()
		if (shapes.length === 0) return
		const bounds = editor.getSelectionPageBounds()
		const { url, width, height } = await editor.toImageDataUrl(shapes, { format: 'png' })
		dispatch({
			type: 'setImage',
			image: {
				id: crypto.randomUUID(),
				name: 'canvas selection.png',
				url,
				snapshot: editor.getSnapshot(),
				type: 'image/png',
				width: width || Math.round(bounds?.width ?? 800),
				height: height || Math.round(bounds?.height ?? 600),
			},
		})
		textareaRef.current?.focus()
	}, [dispatch, editor])

	return (
		<form onSubmit={handleSubmit} className="chat-input-form">
			{isDragging && (
				<div className="drag-drop-indicator">
					<svg className="outline">
						<rect />
					</svg>
					<UploadIcon />
				</div>
			)}

			{images.length > 0 && (
				<div className="input-images">
					{images.map((image) => (
						<ChatInputImage
							key={image.id}
							image={image}
							onRemove={() => dispatch({ type: 'removeImage', imageId: image.id })}
							onEdit={() => {
								dispatch({
									type: 'openWhiteboard',
									id: image.id,
									snapshot: image.snapshot,
									imageName: image.name,
								})
							}}
						/>
					))}
				</div>
			)}

			<div className="input-container">
				<textarea
					ref={textareaRef}
					value={input}
					onChange={(event) => dispatch({ type: 'setInput', input: event.target.value })}
					onKeyDown={handleKeyDown}
					placeholder={disabled ? '' : 'Type your message…'}
					className="chat-input"
					disabled={disabled}
					autoFocus={true}
					rows={1}
				/>
				{waitingForResponse && (
					<div className="input-spinner">
						<DefaultSpinner />
					</div>
				)}
			</div>

			<div className="chat-input-bottom">
				<button
					type="button"
					aria-label="Upload an image"
					title="Upload an image"
					className="icon-button"
					disabled={disabled}
					onClick={handleImageUpload}
				>
					<ImageIcon />
				</button>
				<button
					type="button"
					aria-label="Attach canvas selection"
					title="Attach canvas selection"
					className="icon-button"
					disabled={disabled || !editor}
					onClick={() => void handleCanvasCapture()}
				>
					<WhiteboardIcon />
				</button>
				<button
					type="submit"
					disabled={!canSend || disabled}
					className="icon-button"
					aria-label="Send message"
					title="Send message"
				>
					<SendIcon />
				</button>
			</div>

			{openWhiteboard && (
				<WhiteboardModal
					imageId={openWhiteboard.id}
					initialSnapshot={openWhiteboard.snapshot}
					uploadedFile={openWhiteboard.uploadedFile}
					imageName={openWhiteboard.imageName}
					onCancel={handleCancelWhiteboard}
					onAccept={handleAcceptWhiteboard}
				/>
			)}
		</form>
	)
}

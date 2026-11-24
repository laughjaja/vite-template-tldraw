import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/** A persisted per-IP limit protects the public password endpoint. */
export class AuthRateLimiter extends DurableObject<Env> {
	override async fetch(): Promise<Response> {
		return this.ctx.blockConcurrencyWhile(async () => {
			const now = Date.now()
			const previous = await this.ctx.storage.get<{ start: number; count: number }>('attempts')
			const window = previous && now - previous.start < 60_000 ? previous : { start: now, count: 0 }
			if (window.count >= 10) return new Response(null, { status: 429 })
			window.count++
			await this.ctx.storage.put('attempts', window)
			await this.ctx.storage.setAlarm(window.start + 60_000)
			return new Response(null, { status: 204 })
		})
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll()
	}
}

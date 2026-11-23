import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { geminiAgentPlugin } from './server/geminiMiddleware.ts'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), geminiAgentPlugin()],
})

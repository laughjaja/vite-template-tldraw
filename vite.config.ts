import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { nativeApiPlugin } from './server/nativeApiPlugin.ts'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')
	return {
		plugins: [react(), nativeApiPlugin(env)],
		server: {
			allowedHosts: ['jcs-macbook-air.tail8a223f.ts.net'],
		},
	}
})

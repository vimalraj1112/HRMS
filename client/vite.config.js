import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';
const projectRoot = import.meta.dirname ?? path.resolve(process.cwd());
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(projectRoot, './src'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': {
                target: API_TARGET,
                changeOrigin: true,
            },
        },
    },
    preview: {
        port: 4173,
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        chunkSizeWarningLimit: 900,
    },
});

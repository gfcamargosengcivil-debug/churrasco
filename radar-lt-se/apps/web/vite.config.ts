import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const estatico = process.env.VITE_ESTATICO === '1';

export default defineConfig({
  plugins: [react()],
  // Publicação estática (GitHub Pages em /<repo>/): caminhos relativos.
  base: estatico ? './' : '/',
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3333', changeOrigin: true } },
  },
  build: {
    outDir: estatico ? 'dist-estatico' : 'dist',
    sourcemap: !estatico,
    chunkSizeWarningLimit: 1500,
  },
});

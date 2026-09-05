import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri expects a fixed dev port and a plain static build in ./dist
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],

  // Keep Rust compiler output readable in `tauri dev`
  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // The Rust side has its own watcher
      ignored: ['**/src-tauri/**'],
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Tauri uses a modern webview on every supported platform
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});

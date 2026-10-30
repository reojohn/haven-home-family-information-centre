import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local development only: the browser stays on 127.0.0.1:5173,
// while API requests go through Vite to FastAPI on 127.0.0.1:8000.
// Using the same hostname for both ports preserves cookie-based login.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});

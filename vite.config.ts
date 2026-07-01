import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// index.html lives at the project root and points at src/web/main.tsx.
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.ged'],
  // Pinned so this project can run alongside other local dev servers without Vite
  // silently auto-bumping ports between sessions. 5175 because the neighboring
  // project's dev process holds 5173 AND 5174 (plus 3000/4040/5000/7000).
  server: { port: 5175, strictPort: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// index.html lives at the project root and points at src/web/main.tsx.
export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.ged'],
});

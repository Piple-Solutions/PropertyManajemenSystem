import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // The public site's shared UI (Reveal, PageHero, content, ...) is imported
        // by five lazy pages. Without this Rollup splits it into ~10 tiny chunks,
        // which costs a request each on slow mobile connections. PublicContext
        // stays in the entry chunk (the layout needs it); the header/footer
        // chunk and the lightbox stay separate so they are only fetched when used.
        manualChunks(id) {
          const file = id.split(path.sep).join('/');
          if (file.includes('/src/components/public/')) {
            if (/\/(PublicContext|PublicChrome|Lightbox|AvailabilityForm)\./.test(file)) return undefined;
            return 'public-kit';
          }
          if (file.includes('/src/content/publicContent')) return 'public-kit';
          return undefined;
        },
      },
    },
  },
});

const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'vite.config.ts');
let s = fs.readFileSync(p, 'utf8');
const old = "  build: {\n    outDir: 'dist',\n    sourcemap: true,\n  },";
if (!s.includes(old)) throw new Error('build block not found');
const neu = `  build: {
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
  },`;
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log('ok');

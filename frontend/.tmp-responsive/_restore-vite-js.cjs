const fs = require('fs');
const path = require('path');
const content = [
  "import { defineConfig } from 'vite';",
  "import react from '@vitejs/plugin-react';",
  "import tailwindcss from '@tailwindcss/vite';",
  "import path from 'path';",
  "export default defineConfig({",
  "    plugins: [react(), tailwindcss()],",
  "    resolve: {",
  "        alias: {",
  "            '@': path.resolve(__dirname, './src'),",
  "        },",
  "    },",
  "    server: {",
  "        port: 5173,",
  "        open: false,",
  "    },",
  "    build: {",
  "        outDir: 'dist',",
  "        sourcemap: true,",
  "    },",
  "});",
  "",
].join('\n');
const target = path.resolve(__dirname, '..', 'vite.config.js');
console.log('bytes', Buffer.byteLength(content), '(original was 454 bytes; CRLF variant would be', Buffer.byteLength(content.replace(/\n/g, '\r\n')) + ')');
fs.writeFileSync(target, content);

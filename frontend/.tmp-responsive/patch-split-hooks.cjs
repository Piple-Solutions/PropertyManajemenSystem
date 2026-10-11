const fs = require('fs');
let p = 'src/components/public/PublicContext.tsx';
let s = fs.readFileSync(p, 'utf8');
const i = s.indexOf('/**\n * Pages whose first block is dark');
if (i < 0) throw new Error('marker');
const hooks = s.slice(i);
s = s.slice(0, i).replace(/\n+$/, '\n').replace("import { createContext, useContext, useEffect, useLayoutEffect } from 'react';", "import { createContext, useContext } from 'react';");
fs.writeFileSync(p, s);
fs.writeFileSync(
  'src/components/public/usePublicPage.ts',
  "import { useEffect, useLayoutEffect } from 'react';\nimport { usePublic, type HeaderTone } from './PublicContext';\n\n" + hooks
);
p = 'src/pages/HomePage.tsx';
s = fs.readFileSync(p, 'utf8');
s = s.replace("import { usePageTitle, usePublicTone } from '@/components/public/PublicContext';", "import { usePageTitle, usePublicTone } from '@/components/public/usePublicPage';");
fs.writeFileSync(p, s);
console.log('ok');

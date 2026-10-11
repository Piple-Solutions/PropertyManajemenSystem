import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off',
    },
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // Playwright config runs in Node (test runner), not the browser, so it
    // needs Node globals — the block above only provides browser globals.
    // FE-010: the same applies to the Node scripts at the project root and to
    // the scratch Node/Playwright files in `.tmp-responsive`
    // (`console`, `__dirname`, `process`, `Buffer` were reported as `no-undef`).
    files: [
      'playwright.config.ts',
      'e2e/**/*.ts',
      '*.{js,mjs,cjs}',
      '.tmp-responsive/**/*.{ts,js,mjs,cjs}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Plain script files (verify-*.mjs drive a browser page and a Node
    // process): both global sets are legitimately available there.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];

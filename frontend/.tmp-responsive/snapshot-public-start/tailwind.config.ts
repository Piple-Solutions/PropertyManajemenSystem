import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#EEEDE9',
        surface: '#FFFFFF',
        'surface-muted': '#F2F0EB',
        line: '#C7BBAB',
        ink: '#232D36',
        'ink-hover': '#161D24',
        slate: '#6B7881',
        bronze: {
          DEFAULT: '#97764D',
          dark: '#7D6240',
        },
        status: {
          successBg: '#E3EDE4',
          successText: '#2F5D37',
          warningBg: '#F0E7D3',
          warningText: '#7A5A1E',
          dangerBg: '#F3DEDE',
          dangerText: '#962222',
          infoBg: '#DDE5EC',
          infoText: '#2F4A5E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.25', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        h3: ['18px', { lineHeight: '1.35', fontWeight: '600' }],
        bodyLg: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        bodyMd: ['14px', { lineHeight: '1.5', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        button: ['14px', { lineHeight: '1.4', fontWeight: '600' }],
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        none: 'none',
        pop: '0 1px 2px rgba(35,45,54,0.12)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
    },
  },
  plugins: [],
};

export default config;

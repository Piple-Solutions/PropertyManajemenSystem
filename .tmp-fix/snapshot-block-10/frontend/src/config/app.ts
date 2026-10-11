export const appConfig = {
  name: 'Homestay Joglo Seruni Syariah',
  version: '1.0.0',
  description: 'Property Management System - Internal & Public Website',

  /* Design Tokens */
  design: {
    colors: {
      brand: {
        50: '#F5EDE3',
        100: '#E8D9C5',
        200: '#D4B896',
        300: '#B88962',
        400: '#8B5E3C',
        500: '#6F4528',
        600: '#5C3820',
        700: '#4A2C1A',
        800: '#3A2014',
        900: '#2D1810',
      },
      cream: {
        50: '#F5F0E8',
        100: '#E9DFD1',
        200: '#D8CBBE',
        300: '#C5BBB1',
      },
      surface: {
        default: '#FFFCF8',
        secondary: '#EFE7DC',
        input: '#FAF7F2',
      },
      taupe: {
        light: '#DED3C6',
        default: '#D8CBBE',
        dark: '#E5DCD1',
      },
      success: '#4F8A5B',
      warning: '#C58A3A',
      error: '#C85C5C',
      info: '#5C7FA3',
      primaryText: '#2D241F',
      secondaryText: '#756A61',
      mutedText: '#A0958B',
      textOnPrimary: '#FFFFFF',
    },
    fontFamily: {
      sans: ['Inter', 'Plus Jakarta Sans', 'DM Sans', 'Manrope', 'system-ui'],
      display: ['Playfair Display', 'serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
    fontSize: {
      display: '28px',
      h1: '24px',
      h2: '20px',
      h3: '18px',
      bodyLg: '16px',
      body: '14px',
      bodyMd: '14px',
      caption: '12px',
      button: '14px',
    },
    borderRadius: {
      xs: '2px',
      sm: '4px',
      DEFAULT: '8px',
      md: '12px',
      lg: '16px',
      xl: '18px',
      '2xl': '24px',
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
    shadows: {
      soft: '0 2px 8px rgba(45, 36, 31, 0.06)',
      card: '0 4px 12px rgba(45, 36, 31, 0.08)',
      subtle: '0 1px 3px rgba(45, 36, 31, 0.06)',
    },
  },

  /* Layout */
  layout: {
    mobilePadding: '20px',
    tabletPadding: '24px',
    desktopPadding: '32px',
    cardRadius: '16px',
    largeCardRadius: '18px',
    cardBorder: '1px solid #E5DCD1',
    buttonHeight: '48px',
    buttonHeightLg: '52px',
    inputHeight: '52px',
    inputHeightLg: '56px',
    inputPadding: '16px',
    selectedCircleSize: '36px',
    selectedCircleSizeLg: '40px',
  },

  /* Status Colors */
  status: {
    pending: { background: '#F2E7D7', text: '#9A6A32' },
    completed: { background: '#E3F0E5', text: '#4F8A5B' },
    cancelled: { background: '#F6E1E1', text: '#C85C5C' },
    reserved: { background: '#F2E7D7', text: '#9A6A32' },
    checkedIn: { background: '#E3F0E5', text: '#4F8A5B' },
    checkedOut: { background: '#E5DCD1', text: '#756A61' },
  },

  /* Responsive Breakpoints */
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

export type AppConfig = typeof appConfig;

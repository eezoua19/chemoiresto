/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff3ef',
          100: '#ffe3d9',
          200: '#ffc4b2',
          300: '#ff9b7d',
          400: '#fa6f4a',
          500: '#e4572e',
          600: '#c4401c',
          700: '#a03318',
          800: '#7d2a16',
          900: '#5f2213',
        },
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dfe3ea',
          300: '#c3cad6',
          400: '#94a0b4',
          500: '#6b788f',
          600: '#4e5a70',
          700: '#3b4557',
          800: '#262d3b',
          900: '#151a24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.16)',
        float: '0 12px 32px -8px rgba(16, 24, 40, 0.22)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sheet-in': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(228, 87, 46, 0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(228, 87, 46, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(228, 87, 46, 0)' },
        },
        // Sorties. Une interface ou tout entre en scene et rien n'en sort
        // donne l'impression d'un site web, pas d'une application.
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'sheet-out': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(8px)', opacity: '0' },
        },
        // Le verdict d'un scan : il doit arriver, pas apparaitre.
        'verdict-in': {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Surlignage bref d'une ligne qui vient d'arriver. On finit sur le
        // blanc exact d'une carte, pas sur "transparent" : sinon le fond de
        // page apparait une fraction de seconde a la fin.
        surlignage: {
          '0%': { backgroundColor: '#fef3c7' },
          '100%': { backgroundColor: '#ffffff' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'sheet-in': 'sheet-in 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-ring': 'pulse-ring 1.8s infinite',
        // "forwards" : sans lui l'element reapparait le temps d'une image
        // juste avant d'etre retire du document.
        'fade-out': 'fade-out 0.18s ease-in forwards',
        'sheet-out': 'sheet-out 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards',
        'slide-down': 'slide-down 0.18s ease-in forwards',
        'verdict-in': 'verdict-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        surlignage: 'surlignage 1.8s ease-out',
      },
    },
  },
  plugins: [],
};

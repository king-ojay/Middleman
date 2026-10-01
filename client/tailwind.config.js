/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#201A15',
        paper: '#F6F1E7',
        steel: { DEFAULT: '#3B5B6B', dark: '#28404C', light: '#6C8A97' },
        brick: { DEFAULT: '#8C4A3B', light: '#B87A62' },
        sisal: { DEFAULT: '#C99A44', light: '#E4C888' },
        leaf: { DEFAULT: '#4B6B45', light: '#7A9A6E' }
      },
      fontFamily: {
        display: ['"Zilla Slab"', 'serif'],
        body: ['"Work Sans"', 'sans-serif']
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px'
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
// Design tokens: the single source of truth for colour, type, radius and
// shadow (Figma "Mobile v2"). Components use these names only.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#033B30',      // headings, dark surfaces, selected states
        signal: '#20BA58',      // primary actions, progress, network trust
        mint: '#DAFFE8',        // soft fills, area trust
        ink: '#1F1F1F',         // body text
        canvas: '#F5F5F5',      // page background
        muted: '#6B6B6B',       // secondary text
        faint: '#A8A8A8',       // placeholders, inactive icons
        line: '#E3E3E3',        // borders
        soft: '#EDEDED',        // neutral fills, off switch
        'on-signal': '#033B30', // text/icons on signal green (white on signal fails contrast)
        danger: '#B42318'       // form and request errors (not in the Figma token set)
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      fontSize: {
        display: ['32px', { lineHeight: '1.15', fontWeight: '600' }],
        title: ['28px', { lineHeight: '1.15', fontWeight: '600' }],
        section: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        card: ['17px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.5' }],
        label: ['14px', { lineHeight: '1.4', fontWeight: '500' }],
        small: ['13px', { lineHeight: '1.4' }],
        micro: ['12px', { lineHeight: '1.3', fontWeight: '500' }]
      },
      borderRadius: {
        card: '20px',
        hero: '28px',
        field: '16px'
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.07)',
        tabbar: '0 -4px 16px rgba(0,0,0,0.06)'
      },
      spacing: {
        screen: '24px', // page side padding
        tabbar: '84px'  // fixed tab bar height; pages pad 100px below content
      }
    }
  },
  plugins: []
};

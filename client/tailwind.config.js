/** @type {import('tailwindcss').Config} */
// Design tokens: the single source of truth for colour, type, radius and
// shadow (Figma "Mobile v2"). Components use these names only.
const token = name => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Values live in styles/index.css as RGB channels so they switch with
      // the light/dark theme and still take opacity modifiers (bg-ink/40).
      colors: {
        forest: token('forest'),         // brand dark green, same in both themes
        signal: token('signal'),         // primary actions, progress, network trust
        'on-signal': token('on-signal'), // text/icons on signal green (white on signal fails contrast)
        mint: token('mint'),             // soft fills, area trust
        canvas: token('canvas'),         // page background
        surface: token('surface'),       // cards, inputs, sheets, nav bars
        ink: token('ink'),               // body text
        heading: token('heading'),       // emphasis text and selected states (forest in light)
        muted: token('muted'),           // secondary text
        faint: token('faint'),           // placeholders, inactive icons
        line: token('line'),             // borders
        soft: token('soft'),             // neutral fills, off switch
        brand: token('brand'),           // dark feature panels (Landing, Login)
        'on-brand-soft': token('on-brand-soft'), // mint text/art on a brand panel
        danger: token('danger'),         // form and request errors (not in the Figma token set)
        accent: token('signal'),
        'on-accent': token('on-signal'),
        'accent-soft': token('mint')
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

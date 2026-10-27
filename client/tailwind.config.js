/** @type {import('tailwindcss').Config} */
// Design tokens: the single source of truth for colour, type, radius and
// shadow (Figma "Mobile v2"). Components use these names only.
const v = name => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Each colour is a CSS variable (src/styles/index.css) holding RGB
      // channels, so dark mode swaps values without touching components and
      // opacity modifiers like bg-black/50 keep working.
      colors: {
        brand: v('brand'),             // dark surfaces: hero cards, active chips, network avatars
        heading: v('heading'),         // headings and emphasised text
        accent: v('accent'),           // primary actions, selection, ratings (sun amber)
        'accent-soft': v('accent-soft'), // soft fills behind selected things
        'on-accent': v('on-accent'),   // text/icons on accent
        signal: v('signal'),           // trust and completion only: network trust, verified, job progress
        mint: v('mint'),               // soft green fills: area trust, success notes
        'on-signal': v('on-signal'),   // text/icons on signal green (white on signal fails contrast)
        'on-brand-soft': v('on-brand-soft'), // light text and marks drawn on brand surfaces
        surface: v('surface'),         // cards, sheets, inputs, tab bar
        ink: v('ink'),                 // body text
        canvas: v('canvas'),           // page background
        muted: v('muted'),             // secondary text
        faint: v('faint'),             // placeholders, inactive icons
        line: v('line'),               // borders
        soft: v('soft'),               // neutral fills, off switch
        danger: v('danger')            // form and request errors
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
        card: 'var(--shadow-card)',
        tabbar: 'var(--shadow-tabbar)'
      },
      spacing: {
        screen: '24px', // page side padding
        tabbar: '84px'  // fixed tab bar height; pages pad 100px below content
      }
    }
  },
  plugins: []
};

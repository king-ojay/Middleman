/** @type {import('tailwindcss').Config} */
// Design tokens: the single source of truth for colour, type, radius and
// shadow. Components use these names only; pages never use raw colours.
const v = name => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // hover: styles only where a real pointer can hover (mouse, trackpad), so a
  // tap on a phone never leaves a button looking stuck in its hover state.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // Each colour is a CSS variable (src/styles/index.css) holding RGB
      // channels, so dark mode swaps values without touching components and
      // opacity modifiers like bg-black/50 keep working.
      colors: {
        canvas: v('canvas'),           // page background (soft grey)
        surface: v('surface'),         // cards, sheets, inputs, floating nav buttons
        ink: v('ink'),                 // text, primary buttons, selected pills, active nav
        'on-ink': v('on-ink'),         // text and icons on ink
        muted: v('muted'),             // secondary text
        faint: v('faint'),             // placeholders
        line: v('line'),               // secondary button and pill borders, dividers
        field: v('field'),             // input borders (3:1 against the input)
        soft: v('soft'),               // neutral tint: grey tiles, insets, quiet badges
        shade: v('shade'),             // skeleton blocks on the grey page
        trust: v('trust'),             // the one accent: trust and released money
        'on-trust': v('on-trust'),
        warn: v('warn'),               // amber: more than your price, something to do
        'on-warn': v('on-warn'),
        signal: v('signal'),           // green marks: done steps, check marks
        step: v('step'),               // grey marks: a refunded job's steps
        danger: v('danger'),           // form and request errors
        'danger-soft': v('danger-soft'), // behind "Failed"
        brand: v('brand'),             // the dark panel on landing and sign-in
        'on-brand': v('on-brand'),     // text on that panel
        'on-brand-soft': v('on-brand-soft') // light text and marks on that panel
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      // Manrope is shipped in 500-800 only, so "normal" text is 500.
      fontWeight: {
        normal: '500',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800'
      },
      fontSize: {
        display: ['32px', { lineHeight: '1.15', fontWeight: '800', letterSpacing: '-0.02em' }],
        title: ['26px', { lineHeight: '1.2', fontWeight: '800', letterSpacing: '-0.01em' }],
        section: ['18px', { lineHeight: '1.3', fontWeight: '700' }],
        card: ['17px', { lineHeight: '1.3', fontWeight: '700' }],
        body: ['16px', { lineHeight: '1.5' }],
        label: ['14px', { lineHeight: '1.4', fontWeight: '600' }],
        small: ['13px', { lineHeight: '1.4' }],
        micro: ['12px', { lineHeight: '1.3', fontWeight: '600' }],
        // Money: large and bold.
        amount: ['28px', { lineHeight: '1.1', fontWeight: '800', letterSpacing: '-0.02em' }],
        'amount-xl': ['44px', { lineHeight: '1.05', fontWeight: '800', letterSpacing: '-0.03em' }]
      },
      borderRadius: {
        card: '22px',
        hero: '26px',
        field: '16px',
        tile: '16px'
      },
      boxShadow: {
        float: 'var(--shadow-float)' // floating nav buttons and sheets only; cards are flat
      },
      spacing: {
        screen: '24px', // page side padding
        tabbar: '68px'  // floating nav: 52px buttons, 16px above the bottom edge
      },
      maxWidth: {
        column: '720px' // the centred desktop column for signed-in pages
      }
    }
  },
  plugins: []
};

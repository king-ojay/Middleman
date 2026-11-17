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
        ink: v('ink'),                 // text only
        'on-ink': v('on-ink'),         // text and icons on ink
        primary: v('primary'),         // ink: primary buttons, selected pills, active nav, focus ring, links
        'primary-hover': v('primary-hover'), // hover and pressed on primary
        'on-primary': v('on-primary'), // text and icons on primary
        avatar: v('avatar'),           // neutral avatar circles (ink initials)
        muted: v('muted'),             // secondary text
        faint: v('faint'),             // placeholders
        line: v('line'),               // secondary button and pill borders, dividers
        field: v('field'),             // input borders (3:1 against the input)
        soft: v('soft'),               // neutral tint: grey tiles, insets, quiet badges
        shade: v('shade'),             // skeleton blocks on the grey page
        trust: v('trust'),             // green, for meaning only: held, released, success
        'on-trust': v('on-trust'),
        warn: v('warn'),               // amber: more than your price, something to do
        'on-warn': v('on-warn'),
        signal: v('signal'),           // green marks: done steps, check marks
        step: v('step'),               // grey marks: a refunded job's steps
        danger: v('danger'),           // form and request errors
        'danger-soft': v('danger-soft'), // behind "Failed"
        brand: v('brand'),             // the ink panel on landing and sign-in
        'on-brand': v('on-brand'),     // text on that panel
        'on-brand-soft': v('on-brand-soft'), // light text and marks on that panel
        scrim: v('scrim')              // dimmed page behind a sheet
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      // Manrope is shipped in 500-700 only, so "normal" text is 500. Nothing
      // is heavier than 700: page titles and big money 700, card titles,
      // names and buttons 600, body and small labels 500.
      fontWeight: {
        normal: '500',
        medium: '500',
        semibold: '600',
        bold: '700'
      },
      fontSize: {
        // Page titles: 24px on phones, 28px from 1024px (src/styles/index.css).
        display: ['var(--title-size)', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }],
        title: ['var(--title-size)', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }],
        section: ['18px', { lineHeight: '1.35', fontWeight: '600' }],
        card: ['16px', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.55' }],
        label: ['14px', { lineHeight: '1.45', fontWeight: '500' }],
        small: ['13px', { lineHeight: '1.45' }],
        micro: ['12px', { lineHeight: '1.35', fontWeight: '500' }],
        // Money: bold, 32px at most.
        amount: ['22px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' }],
        'amount-xl': ['32px', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }]
      },
      // Cards 14px; buttons, chips and badges stay fully round.
      borderRadius: {
        card: '14px',
        hero: '18px',
        field: '12px',
        tile: '12px'
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

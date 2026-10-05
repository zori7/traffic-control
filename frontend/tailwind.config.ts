import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Design tokens are driven by CSS variables (see src/index.css) so the light
 * and dark themes swap values without introducing "dark:" prefixes in markup.
 * Semantic names only: canvas, surface, ink, body, muted, hairline, primary.
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        canvas: { DEFAULT: 'var(--canvas)', soft: 'var(--canvas-soft)' },
        surface: { DEFAULT: 'var(--surface)', strong: 'var(--surface-strong)' },
        ink: { DEFAULT: 'var(--ink)' },
        body: { DEFAULT: 'var(--body)', strong: 'var(--body-strong)' },
        muted: { DEFAULT: 'var(--muted)', soft: 'var(--muted-soft)' },
        hairline: {
          DEFAULT: 'var(--hairline)',
          soft: 'var(--hairline-soft)',
          strong: 'var(--hairline-strong)',
        },
        primary: { DEFAULT: 'var(--primary)', active: 'var(--primary-active)' },
        'on-primary': 'var(--on-primary)',
        success: '#16a34a',
        error: '#dc2626',
        ring: 'var(--ring)',
        gradient: {
          mint: '#a7e5d3',
          peach: '#f4c5a8',
          lavender: '#c8b8e0',
          sky: '#a8c8e8',
          rose: '#e8b8c4',
        },
      },
      fontFamily: {
        display: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      boxShadow: {
        soft: '0 4px 16px rgba(0, 0, 0, 0.04)',
        lift: '0 12px 32px rgba(0, 0, 0, 0.08)',
      },
      letterSpacing: {
        editorial: '0.16px',
      },
      keyframes: {
        'orb-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(0, -24px, 0) scale(1.06)' },
        },
        'orb-drift-alt': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.04)' },
          '50%': { transform: 'translate3d(18px, 18px, 0) scale(0.96)' },
        },
        'caret-blink': {
          '0%, 70%, 100%': { opacity: '1' },
          '20%, 50%': { opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'orb-drift': 'orb-drift 14s ease-in-out infinite',
        'orb-drift-alt': 'orb-drift-alt 18s ease-in-out infinite',
        'caret-blink': 'caret-blink 1.1s steps(1, end) infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
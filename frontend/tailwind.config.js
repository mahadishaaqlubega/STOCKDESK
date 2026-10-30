export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Roomier spacing only when the window is tall enough (zoomed-in or
      // short laptop screens keep the compact sizes).
      screens: {
        tall: { raw: '(min-height: 820px)' },
      },
      // Full window height that stays full under the app's display zoom
      // (index.css sets --app-zoom; plain 100dvh would come out 90% tall).
      height: { app: 'calc(100dvh / var(--app-zoom, 1))' },
      minHeight: { app: 'calc(100dvh / var(--app-zoom, 1))' },
      colors: {
        // Forest green, shared with the marketing site.
        brand: {
          50: '#eef5f0',
          100: '#e7efe9',
          200: '#c9dccf',
          300: '#a3c4ad',
          400: '#6f9e80',
          500: '#3f7a56',
          600: '#1f6b3e',
          700: '#14532d',
          800: '#0f4424',
          900: '#0b1510'
        },
        brass: '#8c6a2e'
      }
    }
  },
  plugins: [],
};

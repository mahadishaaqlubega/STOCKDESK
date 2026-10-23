export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Roomier spacing only when the window is tall enough (zoomed-in or
      // short laptop screens keep the compact sizes).
      screens: {
        tall: { raw: '(min-height: 820px)' },
      },
      colors: {
        brand: {
          50: '#eef9fc',
          100: '#dff4f9',
          200: '#bfe7f1',
          300: '#92d6e5',
          400: '#5bc0d6',
          500: '#2fa8c6',
          600: '#258ea8',
          700: '#21778d',
          800: '#1f6476',
          900: '#1f5260'
        }
      }
    }
  },
  plugins: [],
};

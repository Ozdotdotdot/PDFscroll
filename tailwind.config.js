/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', 'Charter', 'Bitstream Charter', 'serif'],
        sans: ['system-ui', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
}

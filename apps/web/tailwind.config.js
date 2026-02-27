import preset from '@latitude-data/web-ui/tailwind.config.js'

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    '../../packages/web-ui/src/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  plugins: [require('@tailwindcss/container-queries')],
}

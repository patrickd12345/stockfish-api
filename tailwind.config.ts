import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terracotta: {
            DEFAULT: '#d9a574',
            light: '#eacba6',
            dark: '#b37e4f',
        },
        ochre: {
            DEFAULT: '#ccb085',
            light: '#ded0b6',
            dark: '#9e845c',
        },
        sage: {
            50: '#fafaf9',
            100: '#f5f5f4',
            200: '#e7e5e4',
            300: '#d6d3d1',
            400: '#a8a29e',
            500: '#78716c',
            600: '#57534e',
            700: '#44403c',
            800: '#292524',
            900: '#1c1917',
            950: '#0c0a09',
        }
      },
    },
  },
  plugins: [],
}
export default config

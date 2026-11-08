import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#131838', // page
        dusk: '#1B2150', // panels
        haze: '#262D66', // raised / borders
        mist: '#9DA6D9', // secondary text
        cloud: '#EEF1FF', // primary text
        lilac: '#B7A8FF', // accent
        buy: '#5BE0B3',
        sell: '#FF7D9C',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
} satisfies Config;

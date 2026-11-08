import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F7F3', // page and input wells
        card: '#FFFFFF', // panels
        line: '#E1E6E0', // rules, borders, quiet fills
        muted: '#5C6B63', // secondary text
        ink: '#0E2A1F', // primary text
        laurel: '#123F2F', // brand green
        bronze: '#A9824A', // small ornament only
        buy: '#1C7A50',
        sell: '#B0432E',
      },
      fontFamily: {
        display: ['Marcellus', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
} satisfies Config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        jw: {
          purple: '#5C3D6E',
          'purple-dark': '#4A315C',
          'purple-light': '#EDE7F0',
          bg: '#F2F2F2',
          surface: '#FFFFFF',
          border: '#E0E0E0',
          text: '#333333',
          muted: '#666666',
          'muted-light': '#999999',
        },
      },
    },
  },
  plugins: [],
};

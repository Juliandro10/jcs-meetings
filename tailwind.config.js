/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        jw: {
          purple: '#5C3D6E',
          'purple-dark': '#4A315C',
          'purple-darker': '#3D2849',
          'purple-card': '#523563',
          'purple-light': '#EDE7F0',
          sidebar: '#2E2933',
          'sidebar-active': '#453A52',
          'bible-tile-a': '#464658',
          'bible-tile-b': '#626276',
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

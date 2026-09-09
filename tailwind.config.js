/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The web app's own palette (client/src/lib design tokens) — same
      // brand, same feel, so the mobile app never reads as a different
      // product wearing the same name.
      colors: {
        brand: {
          DEFAULT: '#5B2BC9',
          dark: '#4A1FA0',
          light: '#F7F3FF',
          tint: '#EDE5FF',
        },
        ink: '#14081F',
        muted: '#756E80',
        faint: '#A09AAA',
        line: '#E5E7EB',
        paper: '#FBF8F2',
        good: '#16A34A',
        warn: '#F59E0B',
        bad: '#DC2626',
      },
      fontFamily: {
        // Loaded via expo-font in app/_layout.tsx — same two-face system
        // the web app uses throughout (Bricolage Grotesque for headings,
        // Plus Jakarta Sans for everything else).
        display: ['BricolageGrotesque_700Bold'],
        body: ['PlusJakartaSans_400Regular'],
        'body-medium': ['PlusJakartaSans_500Medium'],
        'body-bold': ['PlusJakartaSans_700Bold'],
      },
    },
  },
  plugins: [],
}

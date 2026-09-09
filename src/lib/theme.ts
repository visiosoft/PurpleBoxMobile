/**
 * The web app's own palette and type system, as plain values — for the
 * handful of places (icon colors, chart-style elements, native components
 * that don't take Tailwind classes) that need a real value rather than a
 * className. The source of truth for the classes themselves is
 * tailwind.config.js; kept in sync by hand since Tailwind's own config
 * cannot be imported into non-className contexts cleanly.
 */
export const COLORS = {
  brand: '#5B2BC9',
  brandDark: '#4A1FA0',
  brandLight: '#F7F3FF',
  brandTint: '#EDE5FF',
  ink: '#14081F',
  muted: '#756E80',
  faint: '#A09AAA',
  line: '#E5E7EB',
  paper: '#FBF8F2',
  white: '#FFFFFF',
  good: '#16A34A',
  goodBg: '#DCFCE7',
  warn: '#F59E0B',
  warnBg: '#FEF3C7',
  bad: '#DC2626',
  badBg: '#FEE2E2',
} as const

export const FONTS = {
  display: 'BricolageGrotesque_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const

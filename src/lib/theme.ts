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
  brandSoft: '#7C4DE0',
  brandLight: '#F7F3FF',
  brandTint: '#EDE5FF',
  ink: '#14081F',
  muted: '#756E80',
  faint: '#A09AAA',
  line: '#E5E7EB',
  paper: '#FBF8F2',
  surface: '#FFFFFF',
  white: '#FFFFFF',
  good: '#16A34A',
  goodBg: '#DCFCE7',
  warn: '#F59E0B',
  warnBg: '#FEF3C7',
  bad: '#DC2626',
  badBg: '#FEE2E2',
} as const

/** The header's hero gradient — a richer, deeper purple than any flat
 *  brand swatch, so the app's own chrome carries the same weight as the
 *  content it frames. Diagonal (top-left to bottom-right) reads as light
 *  catching a surface, not a flat fill. */
export const HERO_GRADIENT = ['#7C4DE0', '#4A1FA0'] as const

export const FONTS = {
  display: 'BricolageGrotesque_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const

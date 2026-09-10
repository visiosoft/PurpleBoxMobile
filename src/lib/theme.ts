/**
 * Design tokens from the "PurpleBox CRM" mobile design handoff
 * (design_handoff_purplebox_crm — PurpleBox CRM.dc.html + README.md).
 * High-fidelity spec: every hex, radius and duration here is the intended
 * production value, not a placeholder. Kept as plain values (not Tailwind
 * classes) since React Native has no CSS — every consumer that used to
 * reach for a className string style={{...}} value now reaches for these.
 */
export const COLORS = {
  // Brand
  purple900: '#1A0B33',
  purple800: '#2D1259',
  purple700: '#4A1FA0',
  purple600: '#5B2BC9',
  purple500: '#7C4DFF',
  purple400: '#A78BFA',
  purple200: '#DDD0FF',
  purple100: '#EDE5FF',
  purple50: '#F7F3FF',

  ink: '#14081F',
  ink2: '#4A4357',
  ink3: '#756E80',
  ink4: '#9A93A5',
  chevron: '#C4BED0',
  white: '#FFFFFF',
  paper: '#FBFAFE',
  surfaceAlt: '#F7F5FB',
  control: '#F3F1F7',
  line: 'rgba(20,8,31,0.10)',
  lineSoft: 'rgba(20,8,31,0.06)',

  // WhatsApp / semantic
  whatsapp: '#25D366',
  success: '#0F7A4A',
  successTint: '#DEF7E6',
  successTintSoft: '#E8FBF0',
  bubbleOut: '#DCF8C6',
  chatWallpaper: '#F3EFE9',
  readTick: '#34B7F1',
  onlineDot: '#4ADE80',
  danger: '#B42318',
  dangerTint: '#FEE4E2',
  dangerTintSoft: '#FEF3F2',
  lostRadio: '#E4665B',
  noteInk: '#5A4A22',
  noteLabel: '#A97C1A',
  noteSurface: '#FFFBEF',
  noteBorder: '#F2E4C2',
  warnInk: '#B45309',
  warnTint: '#FFEEDD',
  warnTintSoft: '#FFF3E8',
  cyan: '#22D3EE',

  // Back-compat aliases used by screens not yet migrated to the handoff palette
  brand: '#5B2BC9',
  brandDark: '#4A1FA0',
  brandTint: '#EDE5FF',
  muted: '#756E80',
  faint: '#A09AAA',
  good: '#0F7A4A',
  goodBg: '#DEF7E6',
  warn: '#B45309',
  warnBg: '#FFEEDD',
  bad: '#B42318',
  badBg: '#FEE4E2',
} as const

/** `linear-gradient(135deg,#3B5BFF,#5B2BC9 55%,#7C4DFF)` — headers, primary
 *  buttons, the active nav pill, progress bars, the chat FAB. RN's
 *  LinearGradient wants stop offsets, not CSS's `at 55%` syntax. */
export const GRADIENT_PRIMARY = ['#3B5BFF', '#5B2BC9', '#7C4DFF'] as const
export const GRADIENT_PRIMARY_LOCATIONS = [0, 0.55, 1] as const

/** Admin-only — distinguishes the admin workspace from the rep one. */
export const GRADIENT_ADMIN = ['#22D3EE', '#3B5BFF', '#5B2BC9'] as const
export const GRADIENT_ADMIN_LOCATIONS = [0, 0.45, 1] as const

export const FONTS = {
  display: 'BricolageGrotesque_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const

/** Cycled by list index, `[bg, text]`. */
export const AVATAR_PALETTE: [string, string][] = [
  ['#EDE5FF', '#5B2BC9'], ['#E8EEFF', '#2947C9'], ['#DEF7E6', '#0F7A4A'],
  ['#FFEEDD', '#B45309'], ['#E0F7FA', '#0E7490'], ['#FFE4EF', '#B01B5C'],
]
export function avatarStyle(index: number) {
  const [bg, text] = AVATAR_PALETTE[index % AVATAR_PALETTE.length]
  return { bg, text }
}

export const RADII = {
  pill: 999, chip: 8, control: 12, input: 15, card: 20, hero: 28, sheet: 26,
} as const

/** React Native shadow props (iOS: shadowColor/Opacity/Radius/Offset;
 *  Android: elevation) — the handoff's CSS box-shadow values translated
 *  to the two props RN actually reads. */
export const SHADOWS = {
  card: { shadowColor: '#14081F', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  raised: { shadowColor: '#14081F', shadowOpacity: 0.09, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  floating: { shadowColor: '#14081F', shadowOpacity: 0.13, shadowRadius: 40, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  sheet: { shadowColor: '#14081F', shadowOpacity: 0.22, shadowRadius: 40, shadowOffset: { width: 0, height: -14 }, elevation: 16 },
  whatsappGlow: { shadowColor: '#25D366', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  purpleGlow: { shadowColor: '#5B2BC9', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
} as const

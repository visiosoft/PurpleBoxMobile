/**
 * Design tokens. Layout, radii and spacing from the "PurpleBox CRM" mobile
 * design handoff; colours and fonts are the 2Capacity look (2capacity.com,
 * the web app's theme-2capacity.css) since the app took on that brand.
 *
 * From the original handoff notes —
 * (design_handoff_purplebox_crm — PurpleBox CRM.dc.html + README.md).
 * High-fidelity spec: every hex, radius and duration here is the intended
 * production value, not a placeholder. Kept as plain values (not Tailwind
 * classes) since React Native has no CSS — every consumer that used to
 * reach for a className string style={{...}} value now reaches for these.
 */
export const COLORS = {
  // Brand — the 2Capacity look (2capacity.com, the web app's theme-2capacity.css):
  // ink-black actions on white and stone, with the green-to-blue gradient.
  // The purple* names are kept so every screen follows; their values are the
  // 2Capacity ink and stone scale.
  green: '#34A853',
  greenTint: '#E6F4EA',
  blue: '#4285F4',
  purple900: '#1F1F1F',
  purple800: '#1F1F1F',
  purple700: '#1F1F1F',
  purple600: '#1F1F1F',
  purple500: '#3C4043',
  purple400: '#80868B',
  purple200: '#DADCE0',
  purple100: '#E8EAED',
  purple50: '#F1F3F4',

  ink: '#1F1F1F',
  ink2: '#4A4D51',
  ink3: '#5F6368',
  ink4: '#80868B',
  chevron: '#BDC1C6',
  white: '#FFFFFF',
  paper: '#FFFFFF',
  surfaceAlt: '#F8F9FA',
  control: '#F1F3F4',
  line: '#E3E3E3',
  lineSoft: '#EEEEEE',

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
  cyan: '#4FC3F7',

  // Back-compat aliases used by screens not yet migrated to the handoff palette
  brand: '#1F1F1F',
  brandDark: '#1F1F1F',
  brandTint: '#E8EAED',
  muted: '#5F6368',
  faint: '#9AA0A6',
  good: '#0F7A4A',
  goodBg: '#DEF7E6',
  warn: '#B45309',
  warnBg: '#FFEEDD',
  bad: '#B42318',
  badBg: '#FEE4E2',
} as const

/** 2Capacity's `linear-gradient(90deg, #34A853, #4FC3F7 55%, #4285F4)` — headers, primary
 *  buttons, the active nav pill, progress bars, the chat FAB. RN's
 *  LinearGradient wants stop offsets, not CSS's `at 55%` syntax. */
export const GRADIENT_PRIMARY = ['#34A853', '#4FC3F7', '#4285F4'] as const
export const GRADIENT_PRIMARY_LOCATIONS = [0, 0.55, 1] as const

/** Admin-only — distinguishes the admin workspace from the rep one. */
export const GRADIENT_ADMIN = ['#34A853', '#4FC3F7', '#4285F4'] as const
export const GRADIENT_ADMIN_LOCATIONS = [0, 0.55, 1] as const

export const FONTS = {
  display: 'Outfit_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
} as const

/** Cycled by list index, `[bg, text]`. */
export const AVATAR_PALETTE: [string, string][] = [
  ['#E6F4EA', '#1E7E34'], ['#E8EEFF', '#2947C9'], ['#DEF7E6', '#0F7A4A'],
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
  card: { shadowColor: '#1F1F1F', shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  raised: { shadowColor: '#1F1F1F', shadowOpacity: 0.09, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  floating: { shadowColor: '#1F1F1F', shadowOpacity: 0.13, shadowRadius: 40, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  sheet: { shadowColor: '#1F1F1F', shadowOpacity: 0.22, shadowRadius: 40, shadowOffset: { width: 0, height: -14 }, elevation: 16 },
  whatsappGlow: { shadowColor: '#25D366', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  purpleGlow: { shadowColor: '#1F1F1F', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
} as const

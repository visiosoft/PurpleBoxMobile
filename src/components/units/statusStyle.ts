import { COLORS } from '../../lib/theme'
import type { UnitStatus } from '../../lib/units'

export const STATUS_STYLE: Record<UnitStatus, { bg: string; fg: string }> = {
  available: { bg: COLORS.goodBg, fg: COLORS.good },
  occupied: { bg: COLORS.badBg, fg: COLORS.bad },
  reserved: { bg: COLORS.warnBg, fg: COLORS.warn },
  maintenance: { bg: '#F3F4F6', fg: COLORS.muted },
}

export function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

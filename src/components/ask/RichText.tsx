import { View, Text } from 'react-native'
import { COLORS, FONTS } from '../../lib/theme'

/** **bold** as bold and `code` as code — the assistant writes them, and the raw marks read as noise. */
function inline(text: string, size: number) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <Text key={i} style={{ fontFamily: FONTS.bodyBold }}>{part.slice(2, -2)}</Text>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <Text key={i} style={{ fontSize: size - 1.5, backgroundColor: COLORS.purple50, color: COLORS.purple700 }}>{part.slice(1, -1)}</Text>
    }
    return part
  })
}

type Block = { kind: 'p' | 'ul' | 'ol' | 'h'; lines: string[] }

/**
 * An answer laid out for reading — the web's RichText: blank lines start a
 * new paragraph, lines starting with "•", "-" or "1." become a list, "#"
 * lines are headings, **bold** is bold. Plain text from the model; this is
 * only how it is shown.
 */
export default function RichText({ text, color = COLORS.ink, size = 15 }: { text: string; color?: string; size?: number }) {
  const blocks: Block[] = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) { blocks.push({ kind: 'p', lines: [] }); continue }
    const head = /^#{1,4}\s+(.*)$/.exec(line)
    if (head) { blocks.push({ kind: 'h', lines: [head[1]] }); continue }
    const bullet = /^[•\-*]\s+(.*)$/.exec(line)
    const num = /^\d+[.)]\s+(.*)$/.exec(line)
    const kind = bullet ? 'ul' : num ? 'ol' : 'p'
    const content = bullet ? bullet[1] : num ? num[1] : line
    const last = blocks[blocks.length - 1]
    if (last && last.kind === kind && (kind !== 'p' || last.lines.length)) last.lines.push(content)
    else blocks.push({ kind, lines: [content] })
  }
  const shown = blocks.filter((b) => b.lines.length)
  const lh = Math.round(size * 1.5)
  const body = { fontFamily: FONTS.body, fontSize: size, lineHeight: lh, color }
  return (
    <View style={{ gap: 10 }}>
      {shown.map((b, i) => {
        if (b.kind === 'h') {
          return <Text key={i} style={{ fontFamily: FONTS.display, fontSize: size + 2, lineHeight: lh + 2, color: COLORS.ink, marginTop: i ? 6 : 0 }}>{inline(b.lines[0], size)}</Text>
        }
        if (b.kind === 'p') return <Text key={i} selectable style={body}>{inline(b.lines.join('\n'), size)}</Text>
        return (
          <View key={i} style={{ gap: 4 }}>
            {b.lines.map((l, j) => (
              <View key={j} style={{ flexDirection: 'row' }}>
                <Text style={[body, { width: b.kind === 'ul' ? 16 : 24 }]}>{b.kind === 'ul' ? '•' : `${j + 1}.`}</Text>
                <Text selectable style={[body, { flex: 1 }]}>{inline(l, size)}</Text>
              </View>
            ))}
          </View>
        )
      })}
    </View>
  )
}

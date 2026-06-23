import type { ActionType } from '@/types/action'

const CH: Record<string, number> = {
  '零':0,'○':0,'〇':0,'一':1,'二':2,'兩':2,'三':3,'四':4,
  '五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,
}

export function parseChineseTime(text: string): string | null {
  // HH:MM / HH：MM
  const iso = text.match(/(\d{1,2})[：:：](\d{2})/)
  if (iso) return `${iso[1].padStart(2,'0')}:${iso[2]}`

  const re = /(上午|早上|下午|晚上|傍晚|夜晚|午前|午後)?(十二|十一|十|\d{1,2}|[零一二兩三四五六七八九])點(?:([半]|\d{1,2}|[零一二兩三四五六七八九十])分)?/
  const m = text.match(re)
  if (!m) return null

  const period = m[1]
  let hour = CH[m[2]] ?? parseInt(m[2])
  let minute = 0

  if (m[3] === '半') minute = 30
  else if (m[3]) minute = CH[m[3]] ?? parseInt(m[3])

  const isPM = ['下午','晚上','傍晚','夜晚','午後'].includes(period ?? '')
  const isAM = ['上午','早上','午前'].includes(period ?? '')

  if (isPM && hour < 12) hour += 12
  else if (!isAM && !period && hour >= 1 && hour <= 7) hour += 12  // heuristic

  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}

function parseDelay(text: string): number | null {
  if (/半小時|30分/.test(text)) return 30
  if (/一小時|1小時|60分/.test(text)) return 60
  const min = text.match(/(\d+)\s*分/)
  if (min) return parseInt(min[1])
  const hr = text.match(/(\d+)\s*小時/)
  if (hr) return parseInt(hr[1]) * 60
  return null
}

export type RuleResult = {
  action: ActionType
  eventTitle?: string    // raw title extracted from text (for matching)
  time?: string
  title?: string         // new title for create
  delayMinutes?: number
  dayHint?: 'today' | 'tomorrow' // day hint for create
  confidence: number
}

export function parseRule(text: string): RuleResult | null {
  let m: RegExpMatchArray | null

  // Update: X改Y (Y must be parseable time)
  m = text.match(/^(.+?)改(.+)$/)
  if (m) {
    const time = parseChineseTime(m[2].trim())
    if (time) return { action: 'update', eventTitle: m[1].trim(), time, confidence: 0.9 }
  }

  // Update: X延後Y / X推遲Y
  m = text.match(/^(.+?)(延後|推遲|延迟)(.+)$/)
  if (m) {
    const delay = parseDelay(m[3].trim())
    if (delay) return { action: 'update', eventTitle: m[1].trim(), delayMinutes: delay, confidence: 0.9 }
  }

  // Delete: 取消/刪掉/刪除/削除 X
  m = text.match(/^(取消|刪掉|刪除|削除|キャンセル)(.+)$/)
  if (m) return { action: 'delete', eventTitle: m[2].trim(), confidence: 0.9 }

  // Delete: 不用X了
  m = text.match(/^不用(.+?)了?$/)
  if (m) return { action: 'delete', eventTitle: m[1].trim(), confidence: 0.85 }

  // Create: 新增 [time] title
  m = text.match(/^新增(.+)$/)
  if (m) {
    const rest = m[1].trim()
    const time = parseChineseTime(rest)
    const title = rest
      .replace(/(今天|明天|今日|明日)/, '')
      .replace(/(上午|早上|下午|晚上|傍晚|夜晚|午前|午後)?(十二|十一|十|\d{1,2}|[零一二兩三四五六七八九])點(?:[半\d零一二兩三四五六七八九十]+分)?/g, '')
      .trim()
    const dayHint = /(今天|今日)/.test(rest) ? 'today' : /（明天|明日）/.test(rest) ? 'tomorrow' : undefined
    return { action: 'create', title: title || rest, time: time ?? undefined, dayHint, confidence: time ? 0.9 : 0.7 }
  }

  // Create: [day?] [time] 加 title (e.g. 下午三點加咖啡 / 明天下午三點加咖啡)
  m = text.match(/^(今天|明天|今日|明日)?(.+?)加(.+)$/)
  if (m) {
    const timePart = m[2].trim()
    const title = m[3].trim()
    const time = parseChineseTime(timePart)
    if (time) {
      const dayHint = m[1] === '今天' || m[1] === '今日' ? 'today' : m[1] ? 'tomorrow' : undefined
      return { action: 'create', title, time, dayHint, confidence: 0.85 }
    }
  }

  return null
}

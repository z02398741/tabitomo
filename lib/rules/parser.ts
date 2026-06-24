import type { ActionType, TripField } from '@/types/action'

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

export type DayHint = 'today' | 'tomorrow' | 'dayAfterTomorrow'

export type RuleResult = {
  action: ActionType
  eventTitle?: string
  time?: string
  title?: string
  delayMinutes?: number
  dayHint?: DayHint
  tripField?: TripField
  tripValue?: string
  confidence: number
}

const DAY_PREFIX_RE = /^(今天|明天|後天|今日|明日)/

function parseDayHint(text: string): DayHint | undefined {
  if (/(今天|今日)/.test(text)) return 'today'
  if (/(明天|明日)/.test(text)) return 'tomorrow'
  if (/後天/.test(text)) return 'dayAfterTomorrow'
  return undefined
}

export function parseRule(text: string): RuleResult | null {
  let m: RegExpMatchArray | null

  // --- UPDATE ---

  // X改Y  (e.g. 夕食改18:30 / 夕食改下午六點)
  m = text.match(/^(.+?)改(?:成|到)?(.+)$/)
  if (m) {
    const time = parseChineseTime(m[2].trim())
    if (time) return { action: 'update', eventTitle: m[1].trim(), time, confidence: 0.9 }
  }

  // 把X改到Y / 把X改成Y / 把X移到Y
  m = text.match(/^把(.+?)(?:改(?:到|成)|移(?:到))(.+)$/)
  if (m) {
    const time = parseChineseTime(m[2].trim())
    if (time) return { action: 'update', eventTitle: m[1].trim(), time, confidence: 0.9 }
  }

  // X延後Y / X推遲Y / X延迟Y
  m = text.match(/^(.+?)(延後|推遲|延迟)(.+)$/)
  if (m) {
    const delay = parseDelay(m[3].trim())
    if (delay) return { action: 'update', eventTitle: m[1].trim(), delayMinutes: delay, confidence: 0.9 }
  }

  // X提前Y (advance = negative delay)
  m = text.match(/^(.+?)提前(.+)$/)
  if (m) {
    const delay = parseDelay(m[2].trim())
    if (delay) return { action: 'update', eventTitle: m[1].trim(), delayMinutes: -delay, confidence: 0.9 }
  }

  // --- DELETE ---

  // 取消/刪掉/刪除/削除/キャンセル X
  m = text.match(/^(取消|刪掉|刪除|削除|キャンセル)(.+)$/)
  if (m) return { action: 'delete', eventTitle: m[2].trim(), confidence: 0.9 }

  // 把X刪掉/刪除/取消
  m = text.match(/^把(.+?)(刪掉|刪除|取消)$/)
  if (m) return { action: 'delete', eventTitle: m[1].trim(), confidence: 0.9 }

  // 不用X了
  m = text.match(/^不用(.+?)了?$/)
  if (m) return { action: 'delete', eventTitle: m[1].trim(), confidence: 0.85 }

  // --- CREATE ---

  // 新增 [day?] [time?] title
  m = text.match(/^新增(.+)$/)
  if (m) {
    const rest = m[1].trim()
    const time = parseChineseTime(rest)
    const dayHint = parseDayHint(rest)
    const title = rest
      .replace(DAY_PREFIX_RE, '')
      .replace(/(上午|早上|下午|晚上|傍晚|夜晚|午前|午後)?(十二|十一|十|\d{1,2}|[零一二兩三四五六七八九])點(?:[半\d零一二兩三四五六七八九十]+分)?/g, '')
      .replace(/(\d{1,2})[：:：](\d{2})/, '')
      .trim()
    return { action: 'create', title: title || rest, time: time ?? undefined, dayHint, confidence: time ? 0.9 : 0.7 }
  }

  // [day?] [time] 加/加入 title  (e.g. 下午三點加咖啡 / 明天下午三點加入海灘)
  m = text.match(/^(今天|明天|後天|今日|明日)?(.+?)加入?(.+)$/)
  if (m) {
    const timePart = m[2].trim()
    const title = m[3].trim()
    const time = parseChineseTime(timePart)
    if (time) {
      const dayHint = parseDayHint(m[1] ?? '')
      return { action: 'create', title, time, dayHint, confidence: 0.85 }
    }
  }

  // --- TRIP-LEVEL UPDATE ---

  // 人數 / 人数: 人數5 / 人數改5人
  m = text.match(/^(?:人數|人数|メンバー数?|参加者?数?|参加人数?)(?:改|変|を|に|設定)?(\d+)人?$/)
  if (m) return { action: 'trip_update', tripField: 'members', tripValue: m[1], confidence: 0.9 }

  // 預算 / 予算: 預算改5萬 / 予算を1万円に
  m = text.match(/^(?:預算|予算|budget)(?:改|変|を|は|に)?(.+)$/)
  if (m && m[1].trim()) return { action: 'trip_update', tripField: 'budget', tripValue: m[1].trim(), confidence: 0.9 }

  // 交通手段 / 交通方式: 交通手段飛機 / 交通改バス (requires 手段/方式 or modifier to avoid conflict with query)
  m = text.match(/^(?:交通手段|交通方式)(?:改|変|を|は|に)?(.+)$/)
  if (m && m[1].trim()) return { action: 'trip_update', tripField: 'transport', tripValue: m[1].trim(), confidence: 0.9 }
  m = text.match(/^交通(?:改|変更?|を)(.+)$/)
  if (m && m[1].trim()) return { action: 'trip_update', tripField: 'transport', tripValue: m[1].trim(), confidence: 0.9 }

  return null
}

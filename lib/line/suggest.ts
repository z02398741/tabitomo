/**
 * LINE bot の AI行程提案 会話フロー
 * pending_actions テーブルを流用して session state を管理する
 */
import { createClient } from '@supabase/supabase-js'
import { replyMessage, pushMessage, textMsg } from '@/lib/line/reply'
import { runTravelAgent } from '@/lib/agents/travel/agent'
import { savePreference } from '@/lib/agents/travel/memory/preferences'
import { getLocale, t, type Locale } from '@/lib/line/i18n'
import type { BudgetLevel, RankedCandidate } from '@/lib/agents/travel/types'

const TRIP_URL = 'https://tabitomo-gilt.vercel.app/trips'

// Record a preference signal when a LINE-suggested trip is saved.
async function recordSuggestPreference(session: SuggestSession, userId: string) {
  if (!userId || !session.destination) return
  const validBudgets: BudgetLevel[] = ['budget', 'moderate', 'luxury']
  const budget: BudgetLevel = validBudgets.includes(session.budget as BudgetLevel)
    ? (session.budget as BudgetLevel)
    : 'moderate'
  await savePreference({ userId, destination: session.destination, tags: [], budget }).catch(() => {})
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Session type ───────────────────────────────────────────────
export type SuggestStep =
  | 'destination' | 'days' | 'startDate' | 'members' | 'budget' | 'note' | 'generating' | 'preview'

export interface SuggestSession {
  __type: 'suggest'
  step: SuggestStep
  destination?: string
  days?: number
  startDate?: string    // YYYY-MM-DD
  members?: number | null
  budget?: string       // 'budget' | 'moderate' | 'luxury'
  freeNote?: string
  origin?: string       // 出発地（自然文から抽出）
  transport?: string    // 移動手段
  generatedTrip?: any   // filled after Gemini generation
  // dummy fields required by pending_actions schema
  action: 'suggest'
  confidence: number
  raw: string
}

// ── Session storage (suggest_sessions table) ───────────────────
export async function getSuggestSession(groupId: string, userId: string): Promise<SuggestSession | null> {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('suggest_sessions')
    .select('session_json, expires_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('[suggest] getSuggestSession error:', error.message); return null }
  if (!data) return null
  if (new Date(data.expires_at) < new Date()) {
    await clearSuggestSession(groupId, userId)
    return null
  }
  const j = data.session_json as any
  return j?.__type === 'suggest' ? (j as SuggestSession) : null
}

async function saveSuggestSession(groupId: string, userId: string, session: SuggestSession) {
  const supabase = getAdmin()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('suggest_sessions')
    .upsert({ group_id: groupId, user_id: userId, session_json: session, expires_at: expiresAt })
  if (error) console.error('[suggest] saveSuggestSession error:', error.message)
}

export async function clearSuggestSession(groupId: string, userId: string) {
  const supabase = getAdmin()
  await supabase.from('suggest_sessions').delete().eq('group_id', groupId).eq('user_id', userId)
}

// ── Travel Agent generation ────────────────────────────────────
export async function generateTrip(session: SuggestSession): Promise<{ trip: any; spots: RankedCandidate[]; restaurants: RankedCandidate[] }> {
  const validBudgets: BudgetLevel[] = ['budget', 'moderate', 'luxury']
  const budget: BudgetLevel = validBudgets.includes(session.budget as BudgetLevel)
    ? (session.budget as BudgetLevel)
    : 'moderate'

  const rec = await runTravelAgent({
    destination: session.destination!,
    durationDays: session.days ?? 3,
    startDate: session.startDate,
    members: session.members ?? 2,
    budget,
    note: session.freeNote?.trim() || undefined,
    origin: session.origin,
    transport: session.transport,
  })
  return { trip: rec.itinerary, spots: rec.spots, restaurants: rec.restaurants }
}

// ── Preview formatting ─────────────────────────────────────────
const EVENT_ICON: Record<string, string> = {
  transport: '🚢', gather: '📍', meal: '🍽', activity: '🤿', stay: '🏨', free: '🌊',
}

export function formatPreviewMessages(trip: any, locale: Locale): object[] {
  const days: any[] = trip.days ?? []
  const totalEvents = days.reduce((a: number, d: any) => a + (d.events?.length || 0), 0)

  const header = [
    t(locale, 'previewHeader'),
    ``,
    `【${trip.title}】`,
    [
      trip.members ? `👥 ${trip.members}` : null,
      trip.budget ? `💰 ${trip.budget}` : null,
      trip.transport ? `🚌 ${trip.transport}` : null,
      trip.destination ? `📍 ${trip.destination}` : null,
    ].filter(Boolean).join('  '),
    t(locale, 'previewMeta', { days: String(days.length), n: String(totalEvents) }),
  ].filter(s => s !== null).join('\n')

  // Build day blocks, split into messages if too long (LINE limit: 5000 chars)
  const dayBlocks: string[] = []
  for (const day of days) {
    const lines: string[] = [``, `▶ ${day.label}${day.date ? ` (${day.date.slice(5).replace('-', '/')})` : ''}`]
    for (const ev of (day.events ?? [])) {
      const icon = EVENT_ICON[ev.type] ?? '•'
      const cost = ev.cost != null ? ` ¥${ev.cost.toLocaleString()}` : ''
      lines.push(`${icon} ${ev.time} ${ev.title}${cost}`)
    }
    dayBlocks.push(lines.join('\n'))
  }

  // Pack into messages ≤4800 chars each
  const messages: object[] = []
  let current = header
  for (const block of dayBlocks) {
    if ((current + block).length > 4800) {
      messages.push(textMsg(current))
      current = block
    } else {
      current += block
    }
  }
  messages.push(textMsg(current))
  messages.push(makeConfirmFlex(locale))
  return messages
}

// ── DB save ───────────────────────────────────────────────────
export async function saveTrip(trip: any, userId: string): Promise<string> {
  const supabase = getAdmin()
  const { data: newTrip, error } = await supabase
    .from('trips')
    .insert({
      title: trip.title || '旅行行程',
      members: trip.members ?? null,
      budget: trip.budget ?? null,
      transport: trip.transport ?? null,
      destination: trip.destination ?? null,
      created_by: userId,
    })
    .select().single()
  if (error || !newTrip) throw new Error(error?.message || 'trip insert failed')
  await supabase.from('trip_members').insert({ trip_id: newTrip.id, user_id: userId, role: 'owner' })
  const days = [...(trip.days ?? [])]
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const { data: newDay } = await supabase
      .from('trip_days')
      .insert({ trip_id: newTrip.id, label: day.label, date: day.date || null, position: i })
      .select().single()
    if (newDay && day.events?.length) {
      await supabase.from('events').insert(
        day.events.map((ev: any) => ({
          day_id: newDay.id, time: ev.time, title: ev.title,
          type: ev.type, note: ev.note || '', location: ev.location ?? null,
          cost: ev.cost ?? null, alert_min: ev.alert_min ?? 0,
        }))
      )
    }
  }
  return newTrip.id
}

// ── Step Flex Message builders ─────────────────────────────────
// All step selectors use postback actions so they work in group chats
// without requiring @mention. Only free-text note input remains text-based.

function flexBtn(label: string, data: string, primary = false, color = '#6c8ef5'): object {
  return {
    type: 'button',
    style: primary ? 'primary' : 'secondary',
    ...(primary ? { color } : {}),
    action: { type: 'postback', label, data, displayText: label },
  }
}

function flexBubble(bodyText: string, footerBtns: object[], altText: string): object {
  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: bodyText, weight: 'bold', size: 'md', wrap: true }],
      },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerBtns },
    },
  }
}

export function makeDaysFlex(locale: Locale): object {
  const d = (n: number) => t(locale, 'daysBtn', { n: String(n) })
  return flexBubble(t(locale, 'daysTitle'), [
    flexBtn(d(2), 'suggest:step:days:2', true),
    flexBtn(d(3), 'suggest:step:days:3'),
    flexBtn(d(4), 'suggest:step:days:4'),
    flexBtn(d(5), 'suggest:step:days:5'),
    flexBtn(d(7), 'suggest:step:days:7'),
  ], t(locale, 'daysTitle'))
}

export function makeMembersFlex(locale: Locale): object {
  const p = (n: number) => t(locale, 'personBtn', { n: String(n) })
  return flexBubble(t(locale, 'membersTitle'), [
    flexBtn(p(1), 'suggest:step:members:1', true),
    flexBtn(p(2), 'suggest:step:members:2'),
    flexBtn(p(3), 'suggest:step:members:3'),
    flexBtn(p(4), 'suggest:step:members:4'),
    flexBtn(t(locale, 'fivePlus'), 'suggest:step:members:5'),
    flexBtn(t(locale, 'skip'), 'suggest:step:members:skip'),
  ], t(locale, 'membersTitle'))
}

export function makeBudgetFlex(locale: Locale): object {
  return flexBubble(t(locale, 'budgetTitle'), [
    flexBtn(t(locale, 'budgetBudgetBtn'), 'suggest:step:budget:budget', true),
    flexBtn(t(locale, 'budgetModerateBtn'), 'suggest:step:budget:moderate'),
    flexBtn(t(locale, 'budgetLuxuryBtn'), 'suggest:step:budget:luxury'),
  ], t(locale, 'budgetTitle'))
}

export function makeNoteMsg(locale: Locale): object {
  return {
    type: 'flex',
    altText: t(locale, 'noteAlt'),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: t(locale, 'noteTitle'), weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: t(locale, 'noteExample'), size: 'sm', color: '#aaaaaa', wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'secondary', action: { type: 'postback', label: t(locale, 'skip'), data: 'suggest:step:note:skip', displayText: t(locale, 'skip') } },
        ],
      },
    },
  }
}

export function makeStartDateFlex(locale: Locale): object {
  return {
    type: 'flex',
    altText: t(locale, 'dateAlt'),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: t(locale, 'dateTitle'), weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: t(locale, 'dateHint'), size: 'sm', color: '#aaaaaa', wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6c8ef5',
            action: { type: 'datetimepicker', label: t(locale, 'datePick'), data: 'suggest:date', mode: 'date' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: t(locale, 'skip'), data: 'suggest:date:skip' },
          },
        ],
      },
    },
  }
}

export function makeConfirmFlex(locale: Locale): object {
  return {
    type: 'flex',
    altText: t(locale, 'confirmAlt'),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: t(locale, 'confirmTitle'), weight: 'bold', size: 'md', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6c8ef5',
            action: { type: 'postback', label: t(locale, 'saveBtn'), data: 'suggest:confirm:save' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: t(locale, 'redoBtn'), data: 'suggest:confirm:redo' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: t(locale, 'cancelBtn'), data: 'suggest:confirm:cancel' },
          },
        ],
      },
    },
  }
}

// ── Recommended spots carousel ─────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  restaurant: '🍽 レストラン', cafe: '☕ カフェ', food_court: '🍜 フードコート',
  fast_food: '🍔 ファストフード', bar: '🍶 バー', pub: '🍺 パブ', izakaya_pub: '🍶 居酒屋',
  museum: '🏛 美術館', castle: '🏯 城', shrine: '⛩ 神社', temple: '🛕 寺院',
  attraction: '📸 観光', park: '🌳 公園', garden: '🌸 庭園', peak: '⛰ 山',
  beach: '🏖 ビーチ', volcano: '🌋 火山', hot_spring: '♨️ 温泉', viewpoint: '🔭 展望',
}

function recBubble(c: RankedCandidate, locale: Locale): object {
  const label = CATEGORY_LABEL[c.category] ?? `📍 ${c.category}`
  const mapQuery = encodeURIComponent(c.name)
  return {
    type: 'bubble',
    size: 'micro',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        { type: 'text', text: c.name, weight: 'bold', size: 'sm', wrap: true, maxLines: 2 },
        { type: 'text', text: label, size: 'xxs', color: '#8b93b0', wrap: true },
        { type: 'text', text: `📏 ${c.distanceKm.toFixed(1)}km`, size: 'xxs', color: '#aaaaaa' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          action: { type: 'uri', label: t(locale, 'mapBtn'), uri: `https://www.google.com/maps/search/?api=1&query=${mapQuery}` },
        },
      ],
    },
  }
}

/**
 * Build a Flex carousel of recommended spots + restaurants, or null if
 * there are none. Capped at 10 bubbles (LINE carousel limit is 12).
 */
export function makeRecommendCarousel(spots: RankedCandidate[], restaurants: RankedCandidate[], locale: Locale): object | null {
  const picks = [...spots.slice(0, 6), ...restaurants.slice(0, 4)]
  if (picks.length === 0) return null
  return {
    type: 'flex',
    altText: t(locale, 'recCarouselAlt'),
    contents: {
      type: 'carousel',
      contents: picks.map(c => recBubble(c, locale)),
    },
  }
}

// ── Main entry point ──────────────────────────────────────────
/**
 * Check if there is an active suggest session for this user and handle it.
 * Returns true if the message was consumed by the suggest flow.
 */
export async function handleSuggestFlow(
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
): Promise<boolean> {
  const pushTo = groupId || userId
  const session = await getSuggestSession(groupId, userId)
  const locale = await getLocale(pushTo)

  // ── Preview confirm/cancel/restart ───────────────────────────
  if (session?.step === 'preview') {
    if (/^(保存する|保存|儲存|1|①|yes|はい|好)$/i.test(text.trim())) {
      await replyMessage(replyToken, [textMsg(t(locale, 'savingTrip'))])
      try {
        const tripId = await saveTrip(session.generatedTrip, userId)
        await recordSuggestPreference(session, userId)
        await clearSuggestSession(groupId, userId)
        await pushMessage(pushTo, [textMsg(t(locale, 'savedTrip', { title: session.generatedTrip?.title ?? '', url: `${TRIP_URL}/${tripId}` }))])
      } catch (e: any) {
        await pushMessage(pushTo, [textMsg(t(locale, 'saveFailed', { err: e.message }))])
      }
      return true
    }
    if (/^(やり直す|やり直し|再生成|重做|2|②|redo)$/i.test(text.trim())) {
      await clearSuggestSession(groupId, userId)
      // Restart from scratch
      await replyMessage(replyToken, [textMsg(t(locale, 'restartDest'))])
      await saveSuggestSession(groupId, userId, { __type: 'suggest', action: 'suggest', step: 'destination', confidence: 0, raw: '' })
      return true
    }
    if (/^(キャンセル|取消|不用了|やめる|3|③|cancel)$/i.test(text.trim())) {
      await clearSuggestSession(groupId, userId)
      await replyMessage(replyToken, [textMsg(t(locale, 'cancelled'))])
      return true
    }
    // Any other message while in preview — re-show the preview
    await replyMessage(replyToken, [textMsg(t(locale, 'previewPrompt'))])
    return true
  }

  // ── Collect step-by-step inputs ───────────────────────────────
  if (session) {
    const next = await processStep(session, text, groupId, userId, replyToken, pushTo, locale)
    return next
  }

  // ── Trigger detection (no session yet) ───────────────────────
  // Existing keywords OR a "trip-shape" signal (day-trip / drive / N泊 / 出発)
  const isDayTrip = /日帰り|日歸|日归/.test(text)
  if (!/提案|おすすめ.*行程|行程.*提案|AI行程|コース提案|旅行提案/.test(text)
      && !isDayTrip
      && !/\d+\s*泊/.test(text)
      && !/ドライブ旅行|から出発|から出發|から日帰り/.test(text)) return false

  // Departure place: 「從X出發」「Xから出発」「X出発」
  let origin: string | undefined
  const originM = text.match(/從(.+?)出[発發]/) || text.match(/(.+?)から(?:出[発發]|日帰り)/)
  if (originM) origin = originM[1].replace(/[\s、，。@Tabi]+/gi, '').trim() || undefined

  // Transport
  let transport: string | undefined
  if (/開車|自駕|自驾|ドライブ|車で|マイカー|レンタカー/.test(text)) transport = 'ドライブ'
  else if (/電車|JR|新幹線/.test(text)) transport = '電車'
  else if (/飛行機|飛機|飞机|空路/.test(text)) transport = '飛行機'
  else if (/バス|高速バス/.test(text)) transport = 'バス'
  else if (/船|フェリー/.test(text)) transport = '船'

  // Days: N泊→N+1, N日/天, or day-trip→1
  const nightsM = text.match(/(\d+)\s*泊/)
  const daysM   = text.match(/(\d+)\s*(?:日間?|天)/)
  let extractedDays: number | undefined
  if (isDayTrip) extractedDays = 1
  else if (nightsM) extractedDays = parseInt(nightsM[1]) + 1
  else if (daysM) extractedDays = parseInt(daysM[1])

  // Destination = leftover after removing triggers / origin phrase / transport / month / day tokens
  const rawDest = text
    .replace(/從(.+?)出[発發]|(.+?)から(?:出[発發]|日帰り)/, '')
    .replace(/AI行程提案?|コース提案|旅行提案?|提案(して?)?|おすすめ|行程|旅行|して|ください|AI|お願い|生成|コース/g, '')
    .replace(/開車|自駕|自驾|ドライブ旅行|ドライブ|車で|マイカー|レンタカー|電車|新幹線|飛行機|飛機|飞机|高速バス|バス|フェリー/g, '')
    .replace(/日帰り|日歸|日归/g, '')
    .replace(/\d+\s*月/g, '')
    .replace(/\d+\s*(?:泊\d*日?|日間?|天)/g, '')
    .replace(/[のでへをにがはも。、，！？!?\s@Tabi]+/gi, '')
    .trim()
  const extractedDest = rawDest.length > 0 ? rawDest : undefined

  // Build initial session with what we have
  const initial: SuggestSession = {
    __type: 'suggest', action: 'suggest', confidence: 0, raw: text,
    step: 'destination',
    destination: extractedDest,
    days: extractedDays,
    origin,
    transport,
  }

  // Determine first missing step
  if (!initial.destination) {
    initial.step = 'destination'
    await saveSuggestSession(groupId, userId, initial)
    await replyMessage(replyToken, [textMsg(t(locale, 'suggestStart'))])
    return true
  }
  if (!initial.days) {
    initial.step = 'days'
    await saveSuggestSession(groupId, userId, initial)
    await replyMessage(replyToken, [makeDaysFlex(locale)])
    return true
  }
  // Both destination and days known — go to startDate
  initial.step = 'startDate'
  await saveSuggestSession(groupId, userId, initial)
  await replyMessage(replyToken, [makeStartDateFlex(locale)])
  return true
}

export async function processStep(
  session: SuggestSession,
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
  pushTo: string,
  locale: Locale,
): Promise<boolean> {
  const trim = text.trim()

  if (session.step === 'destination') {
    const dest = trim
      .replace(/AI行程提案?|コース提案|旅行提案?|提案(して?)?|おすすめ|行程|旅行|AI|お願い|生成|コース/g, '')
      .replace(/[のでへをにがはも。、！？!?]+$/g, '')
      .trim()
    if (!dest) {
      await replyMessage(replyToken, [textMsg(t(locale, 'askDest'))])
      return true
    }
    // If days were already extracted (e.g. 日帰り→1), skip the days question
    if (session.days) {
      const next = { ...session, destination: dest, step: 'startDate' as SuggestStep }
      await saveSuggestSession(groupId, userId, next)
      await replyMessage(replyToken, [makeStartDateFlex(locale)])
      return true
    }
    const next = { ...session, destination: dest, step: 'days' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeDaysFlex(locale)])
    return true
  }

  if (session.step === 'days') {
    const n = parseInt(trim)
    if (isNaN(n) || n < 1 || n > 14) {
      await replyMessage(replyToken, [makeDaysFlex(locale)])
      return true
    }
    const next = { ...session, days: n, step: 'startDate' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeStartDateFlex(locale)])
    return true
  }

  if (session.step === 'startDate') {
    // Text fallback: "スキップ" skips, anything else re-shows the Flex
    if (/スキップ|skip|略過/i.test(trim)) {
      const next = { ...session, startDate: undefined, step: 'members' as SuggestStep }
      await saveSuggestSession(groupId, userId, next)
      await replyMessage(replyToken, [makeMembersFlex(locale)])
    } else {
      await replyMessage(replyToken, [makeStartDateFlex(locale)])
    }
    return true
  }

  if (session.step === 'members') {
    let members: number | null = null
    if (!/スキップ|skip|略過/i.test(trim)) {
      const n = parseInt(trim)
      if (!isNaN(n) && n > 0) members = n
    }
    const next = { ...session, members, step: 'budget' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeBudgetFlex(locale)])
    return true
  }

  if (session.step === 'budget') {
    const budgetMap: Record<string, string> = {
      '節約': 'budget', '節省': 'budget', 'budget': 'budget', '1': 'budget', '①': 'budget',
      '普通': 'moderate', 'moderate': 'moderate', '2': 'moderate', '②': 'moderate',
      '豪華': 'luxury', 'luxury': 'luxury', '3': 'luxury', '③': 'luxury',
    }
    const budget = budgetMap[trim] ?? 'moderate'
    const next = { ...session, budget, step: 'note' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeNoteMsg(locale)])
    return true
  }

  if (session.step === 'note') {
    const freeNote = /スキップ|skip|略過/i.test(trim) ? '' : trim
    const next = { ...session, freeNote, step: 'generating' as SuggestStep }

    // Show summary before generating
    const summary = [
      t(locale, 'genHeader'),
      t(locale, 'genDest', { v: next.destination ?? '' }),
      t(locale, 'genDays', { v: String(next.days) }),
      next.origin ? t(locale, 'genOrigin', { v: next.origin }) : null,
      next.transport ? t(locale, 'genTransport', { v: next.transport }) : null,
      next.startDate ? t(locale, 'genStart', { v: next.startDate }) : null,
      next.members ? t(locale, 'genMembers', { v: String(next.members) }) : null,
      next.budget ? t(locale, 'genBudget', { v: t(locale, `budget_${next.budget}`) }) : null,
      next.freeNote ? t(locale, 'genNote', { v: next.freeNote }) : null,
      ``,
      t(locale, 'genWait'),
    ].filter(Boolean).join('\n')

    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [textMsg(summary)])

    // Generate async, then push preview
    try {
      const { trip, spots, restaurants } = await generateTrip(next)
      const withTrip = { ...next, generatedTrip: trip, step: 'preview' as SuggestStep }
      await saveSuggestSession(groupId, userId, withTrip)
      const previewMsgs = formatPreviewMessages(trip, locale)
      await pushMessage(pushTo, previewMsgs)
      const recCarousel = makeRecommendCarousel(spots, restaurants, locale)
      if (recCarousel) await pushMessage(pushTo, [recCarousel])
    } catch (e: any) {
      console.error('[suggest] generation error:', e)
      await clearSuggestSession(groupId, userId)
      await pushMessage(pushTo, [textMsg(t(locale, 'genFailed', { err: e.message || 'error' }))])
    }
    return true
  }

  return false
}

// ── Postback handlers (step Flex buttons + datetimepicker + confirm) ──

/**
 * Routes postback events from step Flex buttons (days / members / budget / note-skip).
 * postbackData format: "suggest:step:<step>:<value>"
 */
export async function handleSuggestStepPostback(
  postbackData: string,
  groupId: string,
  userId: string,
  replyToken: string,
): Promise<void> {
  const parts = postbackData.split(':')   // ['suggest','step','days','3']
  if (parts.length < 4) return
  const step = parts[2]
  const value = parts[3]

  const session = await getSuggestSession(groupId, userId)
  if (!session || session.step !== step) return

  const locale = await getLocale(groupId || userId)
  const syntheticText = value === 'skip' ? 'スキップ' : value
  await processStep(session, syntheticText, groupId, userId, replyToken, groupId || userId, locale)
}



/**
 * Called when LINE fires a postback event from the datetimepicker or skip button.
 * date: YYYY-MM-DD from the picker, or '' when skipped.
 */
export async function handleSuggestDatePostback(
  date: string,
  groupId: string,
  userId: string,
  replyToken: string,
): Promise<void> {
  const session = await getSuggestSession(groupId, userId)
  if (!session || session.step !== 'startDate') return
  const locale = await getLocale(groupId || userId)
  const next = { ...session, startDate: date || undefined, step: 'members' as SuggestStep }
  await saveSuggestSession(groupId, userId, next)
  await replyMessage(replyToken, [makeMembersFlex(locale)])
}

/**
 * Called when the user taps 保存する / やり直す / キャンセル in the confirm Flex.
 */
export async function handleSuggestConfirm(
  action: 'save' | 'redo' | 'cancel',
  groupId: string,
  userId: string,
  replyToken: string,
): Promise<void> {
  const pushTo = groupId || userId
  const session = await getSuggestSession(groupId, userId)
  if (!session || session.step !== 'preview') return
  const locale = await getLocale(pushTo)

  if (action === 'save') {
    await replyMessage(replyToken, [textMsg(t(locale, 'savingTrip'))])
    try {
      const tripId = await saveTrip(session.generatedTrip, userId)
      await recordSuggestPreference(session, userId)
      await clearSuggestSession(groupId, userId)
      await pushMessage(pushTo, [textMsg(t(locale, 'savedTrip', { title: session.generatedTrip?.title ?? '', url: `${TRIP_URL}/${tripId}` }))])
    } catch (e: any) {
      await pushMessage(pushTo, [textMsg(t(locale, 'saveFailed', { err: e.message }))])
    }
  } else if (action === 'redo') {
    await clearSuggestSession(groupId, userId)
    await replyMessage(replyToken, [textMsg(t(locale, 'restartDest'))])
    await saveSuggestSession(groupId, userId, { __type: 'suggest', action: 'suggest', step: 'destination', confidence: 0, raw: '' })
  } else {
    await clearSuggestSession(groupId, userId)
    await replyMessage(replyToken, [textMsg(t(locale, 'cancelled'))])
  }
}

/**
 * LINE bot の AI行程提案 会話フロー
 * pending_actions テーブルを流用して session state を管理する
 */
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { replyMessage, pushMessage, textMsg, quickReplyMsg } from '@/lib/line/reply'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Session type ───────────────────────────────────────────────
export type SuggestStep =
  | 'destination' | 'days' | 'members' | 'budget' | 'note' | 'generating' | 'preview'

export interface SuggestSession {
  __type: 'suggest'
  step: SuggestStep
  destination?: string
  days?: number
  members?: number | null
  budget?: string       // 'budget' | 'moderate' | 'luxury'
  freeNote?: string
  generatedTrip?: any   // filled after Gemini generation
  // dummy fields required by pending_actions schema
  action: 'suggest'
  confidence: number
  raw: string
}

// ── Session storage (reuses pending_actions table) ─────────────
export async function getSuggestSession(groupId: string, userId: string): Promise<SuggestSession | null> {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('pending_actions')
    .select('action_json')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const j = data.action_json as any
  return j?.__type === 'suggest' ? (j as SuggestSession) : null
}

async function saveSuggestSession(groupId: string, userId: string, session: SuggestSession) {
  const supabase = getAdmin()
  await supabase.from('pending_actions').delete().eq('group_id', groupId).eq('user_id', userId)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  await supabase.from('pending_actions').insert({
    group_id: groupId,
    user_id: userId,
    trip_id: '',
    action_json: session,
    expires_at: expiresAt,
  })
}

export async function clearSuggestSession(groupId: string, userId: string) {
  const supabase = getAdmin()
  await supabase.from('pending_actions').delete().eq('group_id', groupId).eq('user_id', userId)
}

// ── Gemini generation ──────────────────────────────────────────
const SYSTEM_PROMPT = `You are a travel planning assistant. Create a detailed, realistic travel itinerary.
Return ONLY valid JSON (no markdown) with this exact shape:
{"title":"string","members":null,"budget":null,"transport":null,"destination":"string","days":[{"label":"Day1｜8/1（金）","date":"YYYY-MM-DD","events":[{"time":"HH:MM","title":"string","type":"transport|gather|meal|activity|stay|free","note":"","location":null,"cost":null,"alert_min":0}]}]}
Rules: Each day 6-8 events, realistic HH:MM times, specific real place names, estimated JPY costs for meals/admissions. type must be one of: transport,gather,meal,activity,stay,free`

async function callGemini(prompt: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const tryModel = async (name: string) => {
    const m = genAI.getGenerativeModel({ model: name })
    const r = await m.generateContent(prompt)
    const raw = r.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(raw)
  }
  const delays = [1000, 2000]
  for (let i = 0; i <= delays.length; i++) {
    try { return await tryModel('gemini-2.5-flash') }
    catch (e: any) {
      if (!e.message?.includes('503') || i === delays.length) throw e
      await new Promise(r => setTimeout(r, delays[i]))
    }
  }
  return tryModel('gemini-2.0-flash')
}

export async function generateTrip(session: SuggestSession): Promise<any> {
  const budgetMap: Record<string, string> = { budget: '節約（低予算）', moderate: '普通', luxury: '豪華（高予算）' }
  const lines = [
    `目的地: ${session.destination}`,
    `旅行日数: ${session.days}日間（${(session.days ?? 3) - 1}泊${session.days}日）`,
    session.members ? `人数: ${session.members}人` : null,
    session.budget ? `予算感: ${budgetMap[session.budget] ?? session.budget}` : null,
    session.freeNote?.trim() ? `備考: ${session.freeNote.trim()}` : null,
  ].filter(Boolean).join('\n')
  return callGemini(`${SYSTEM_PROMPT}\n\n以下の条件で旅行行程を作成してください:\n${lines}`)
}

// ── Preview formatting ─────────────────────────────────────────
const EVENT_ICON: Record<string, string> = {
  transport: '🚢', gather: '📍', meal: '🍽', activity: '🤿', stay: '🏨', free: '🌊',
}

export function formatPreviewMessages(trip: any): object[] {
  const days: any[] = trip.days ?? []
  const totalEvents = days.reduce((a: number, d: any) => a + (d.events?.length || 0), 0)

  const header = [
    `✦ 行程プレビュー`,
    ``,
    `【${trip.title}】`,
    [
      trip.members ? `👥 ${trip.members}名` : null,
      trip.budget ? `💰 ${trip.budget}` : null,
      trip.transport ? `🚌 ${trip.transport}` : null,
      trip.destination ? `📍 ${trip.destination}` : null,
    ].filter(Boolean).join('  '),
    `📅 ${days.length}日間 · ${totalEvents}件`,
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

  const confirm = `\n\nこの内容で保存しますか？`

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
  // Last message with confirm prompt + quick reply
  messages.push(
    quickReplyMsg(current + confirm, [
      { label: '✅ 保存する', text: '保存する' },
      { label: '🔄 やり直す', text: 'やり直す' },
      { label: '❌ キャンセル', text: 'キャンセル' },
    ])
  )
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

// ── Step handlers ──────────────────────────────────────────────
function qr(text: string, items: Array<{ label: string; text: string }>) {
  return quickReplyMsg(text, items)
}

export function makeDaysQr() {
  return qr('📅 何日間の旅行ですか？', [
    { label: '2日間', text: '2' },
    { label: '3日間', text: '3' },
    { label: '4日間', text: '4' },
    { label: '5日間', text: '5' },
    { label: '7日間', text: '7' },
  ])
}

export function makeMembersQr() {
  return qr('👥 人数は？（スキップ可）', [
    { label: '1人', text: '1' },
    { label: '2人', text: '2' },
    { label: '3人', text: '3' },
    { label: '4人', text: '4' },
    { label: '5人以上', text: '5' },
    { label: 'スキップ', text: 'スキップ' },
  ])
}

export function makeBudgetQr() {
  return qr('💰 予算感は？', [
    { label: '節約', text: 'budget' },
    { label: '普通', text: 'moderate' },
    { label: '豪華', text: 'luxury' },
  ])
}

export function makeNoteMsg() {
  return qr('📝 その他の希望があれば教えてください（スキップ可）\n例：子連れOKな行程で / 海が見えるレストランを入れてほしい', [
    { label: 'スキップ', text: 'スキップ' },
  ])
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

  // ── Preview confirm/cancel/restart ───────────────────────────
  if (session?.step === 'preview') {
    if (/^(保存する|保存|1|①|yes|はい|好)$/i.test(text.trim())) {
      await replyMessage(replyToken, [textMsg('💾 保存中...')])
      try {
        const tripId = await saveTrip(session.generatedTrip, userId)
        await clearSuggestSession(groupId, userId)
        await pushMessage(pushTo, [textMsg(
          `✅ 保存しました！\n📍 ${session.generatedTrip?.title}\n\nApp で確認・修正できます：\nhttps://tabitomo-gilt.vercel.app/trips/${tripId}`
        )])
      } catch (e: any) {
        await pushMessage(pushTo, [textMsg(`⚠️ 保存に失敗しました: ${e.message}`)])
      }
      return true
    }
    if (/^(やり直す|やり直し|再生成|2|②|redo)$/i.test(text.trim())) {
      await clearSuggestSession(groupId, userId)
      // Restart from scratch
      await replyMessage(replyToken, [textMsg('🔄 最初からやり直します。\n\n📍 目的地を教えてください\n例：沖縄・京都・台北・ソウル')])
      await saveSuggestSession(groupId, userId, { __type: 'suggest', action: 'suggest', step: 'destination', confidence: 0, raw: '' })
      return true
    }
    if (/^(キャンセル|取消|不用了|やめる|3|③|cancel)$/i.test(text.trim())) {
      await clearSuggestSession(groupId, userId)
      await replyMessage(replyToken, [textMsg('❌ キャンセルしました。')])
      return true
    }
    // Any other message while in preview — re-show the preview
    await replyMessage(replyToken, [textMsg('「保存する」「やり直す」「キャンセル」のいずれかで答えてください。')])
    return true
  }

  // ── Collect step-by-step inputs ───────────────────────────────
  if (session) {
    const next = await processStep(session, text, groupId, userId, replyToken, pushTo)
    return next
  }

  // ── Trigger detection (no session yet) ───────────────────────
  if (!/提案|おすすめ.*行程|行程.*提案|AI行程|コース提案|旅行提案/.test(text)) return false

  // Try to extract destination and days from trigger message
  const nightsM = text.match(/(\d+)\s*泊/)
  const daysM   = text.match(/(\d+)\s*(?:日間?|天)/)
  let extractedDays: number | undefined
  if (nightsM) extractedDays = parseInt(nightsM[1]) + 1
  else if (daysM) extractedDays = parseInt(daysM[1])

  const rawDest = text
    .replace(/提案して?|おすすめ|行程|旅行|して|ください|AI|お願い|生成|コース/g, '')
    .replace(/\d+\s*(?:泊\d*日?|日間?|天)/g, '')
    .replace(/[のでへをにがはも。、！？!?\s@Tabi]+/gi, '')
    .trim()
  const extractedDest = rawDest.length > 0 ? rawDest : undefined

  // Build initial session with what we have
  const initial: SuggestSession = {
    __type: 'suggest', action: 'suggest', confidence: 0, raw: text,
    step: 'destination',
    destination: extractedDest,
    days: extractedDays,
  }

  // Determine first missing step
  if (!initial.destination) {
    initial.step = 'destination'
    await saveSuggestSession(groupId, userId, initial)
    await replyMessage(replyToken, [textMsg('✦ AI行程提案を始めます！\n\n📍 目的地を教えてください\n例：沖縄・京都・台北・ソウル')])
    return true
  }
  if (!initial.days) {
    initial.step = 'days'
    await saveSuggestSession(groupId, userId, initial)
    await replyMessage(replyToken, [makeDaysQr()])
    return true
  }
  // Both destination and days known — go to members
  initial.step = 'members'
  await saveSuggestSession(groupId, userId, initial)
  await replyMessage(replyToken, [makeMembersQr()])
  return true
}

async function processStep(
  session: SuggestSession,
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
  pushTo: string,
): Promise<boolean> {
  const trim = text.trim()

  if (session.step === 'destination') {
    const dest = trim.replace(/[のでへをにがはも。、！？!?]+$/g, '').trim()
    if (!dest) {
      await replyMessage(replyToken, [textMsg('📍 目的地を入力してください（例：沖縄・京都・台北）')])
      return true
    }
    const next = { ...session, destination: dest, step: 'days' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeDaysQr()])
    return true
  }

  if (session.step === 'days') {
    const n = parseInt(trim)
    if (isNaN(n) || n < 1 || n > 14) {
      await replyMessage(replyToken, [makeDaysQr()])
      return true
    }
    const next = { ...session, days: n, step: 'members' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeMembersQr()])
    return true
  }

  if (session.step === 'members') {
    let members: number | null = null
    if (!/スキップ|skip/i.test(trim)) {
      const n = parseInt(trim)
      if (!isNaN(n) && n > 0) members = n
    }
    const next = { ...session, members, step: 'budget' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeBudgetQr()])
    return true
  }

  if (session.step === 'budget') {
    const budgetMap: Record<string, string> = {
      '節約': 'budget', 'budget': 'budget', '1': 'budget', '①': 'budget',
      '普通': 'moderate', 'moderate': 'moderate', '2': 'moderate', '②': 'moderate',
      '豪華': 'luxury', 'luxury': 'luxury', '3': 'luxury', '③': 'luxury',
    }
    const budget = budgetMap[trim] ?? 'moderate'
    const next = { ...session, budget, step: 'note' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeNoteMsg()])
    return true
  }

  if (session.step === 'note') {
    const freeNote = /スキップ|skip/i.test(trim) ? '' : trim
    const next = { ...session, freeNote, step: 'generating' as SuggestStep }

    // Show summary before generating
    const budgetLabel: Record<string, string> = { budget: '節約', moderate: '普通', luxury: '豪華' }
    const summary = [
      `✦ 以下の条件で行程を生成します：`,
      `📍 目的地：${next.destination}`,
      `📅 ${next.days}日間`,
      next.members ? `👥 ${next.members}名` : null,
      next.budget ? `💰 ${budgetLabel[next.budget] ?? next.budget}` : null,
      next.freeNote ? `📝 ${next.freeNote}` : null,
      ``,
      `少々お待ちください（10〜20秒）...`,
    ].filter(Boolean).join('\n')

    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [textMsg(summary)])

    // Generate async, then push preview
    try {
      const trip = await generateTrip(next)
      const withTrip = { ...next, generatedTrip: trip, step: 'preview' as SuggestStep }
      await saveSuggestSession(groupId, userId, withTrip)
      const previewMsgs = formatPreviewMessages(trip)
      await pushMessage(pushTo, previewMsgs)
    } catch (e: any) {
      console.error('[suggest] generation error:', e)
      await clearSuggestSession(groupId, userId)
      await pushMessage(pushTo, [textMsg(`⚠️ 生成に失敗しました: ${e.message || 'エラー'}\nもう一度「提案して」で試してください。`)])
    }
    return true
  }

  return false
}

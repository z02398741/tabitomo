/**
 * LINE bot の AI行程提案 会話フロー
 * pending_actions テーブルを流用して session state を管理する
 */
import { createClient } from '@supabase/supabase-js'
import { replyMessage, pushMessage, textMsg } from '@/lib/line/reply'
import { runTravelAgent } from '@/lib/agents/travel/agent'
import type { BudgetLevel } from '@/lib/agents/travel/types'

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
export async function generateTrip(session: SuggestSession): Promise<any> {
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
  })
  return rec.itinerary
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
  messages.push(makeConfirmFlex())
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

export function makeDaysFlex(): object {
  return flexBubble('📅 何日間の旅行ですか？', [
    flexBtn('2日間', 'suggest:step:days:2', true),
    flexBtn('3日間', 'suggest:step:days:3'),
    flexBtn('4日間', 'suggest:step:days:4'),
    flexBtn('5日間', 'suggest:step:days:5'),
    flexBtn('7日間', 'suggest:step:days:7'),
  ], '何日間の旅行ですか？')
}

export function makeMembersFlex(): object {
  return flexBubble('👥 人数は？（スキップ可）', [
    flexBtn('1人', 'suggest:step:members:1', true),
    flexBtn('2人', 'suggest:step:members:2'),
    flexBtn('3人', 'suggest:step:members:3'),
    flexBtn('4人', 'suggest:step:members:4'),
    flexBtn('5人以上', 'suggest:step:members:5'),
    flexBtn('スキップ', 'suggest:step:members:skip'),
  ], '人数は？')
}

export function makeBudgetFlex(): object {
  return flexBubble('💰 予算感は？', [
    flexBtn('💴 節約', 'suggest:step:budget:budget', true),
    flexBtn('😊 普通', 'suggest:step:budget:moderate'),
    flexBtn('✨ 豪華', 'suggest:step:budget:luxury'),
  ], '予算感は？')
}

export function makeNoteMsg(): object {
  return {
    type: 'flex',
    altText: 'その他の希望があれば教えてください（スキップ可）',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📝 その他の希望があれば入力してください', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: '例：子連れOK / 海が見えるレストランを入れてほしい', size: 'sm', color: '#aaaaaa', wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'secondary', action: { type: 'postback', label: 'スキップ', data: 'suggest:step:note:skip', displayText: 'スキップ' } },
        ],
      },
    },
  }
}

export function makeStartDateFlex(): object {
  return {
    type: 'flex',
    altText: '旅行開始日を選んでください',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📅 旅行の開始日は？', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: 'スキップすると未設定のまま保存されます', size: 'sm', color: '#aaaaaa', wrap: true, margin: 'sm' },
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
            action: { type: 'datetimepicker', label: '📅 日付を選ぶ', data: 'suggest:date', mode: 'date' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: 'スキップ', data: 'suggest:date:skip' },
          },
        ],
      },
    },
  }
}

export function makeConfirmFlex(): object {
  return {
    type: 'flex',
    altText: 'この内容で保存しますか？',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '✦ 行程を保存しますか？', weight: 'bold', size: 'md', wrap: true },
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
            action: { type: 'postback', label: '✅ 保存する', data: 'suggest:confirm:save' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: '🔄 やり直す', data: 'suggest:confirm:redo' },
          },
          {
            type: 'button',
            style: 'secondary',
            action: { type: 'postback', label: '❌ キャンセル', data: 'suggest:confirm:cancel' },
          },
        ],
      },
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
    .replace(/AI行程提案?|コース提案|旅行提案?|提案(して?)?|おすすめ|行程|旅行|して|ください|AI|お願い|生成|コース/g, '')
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
    await replyMessage(replyToken, [makeDaysFlex()])
    return true
  }
  // Both destination and days known — go to startDate
  initial.step = 'startDate'
  await saveSuggestSession(groupId, userId, initial)
  await replyMessage(replyToken, [makeStartDateFlex()])
  return true
}

export async function processStep(
  session: SuggestSession,
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
  pushTo: string,
): Promise<boolean> {
  const trim = text.trim()

  if (session.step === 'destination') {
    const dest = trim
      .replace(/AI行程提案?|コース提案|旅行提案?|提案(して?)?|おすすめ|行程|旅行|AI|お願い|生成|コース/g, '')
      .replace(/[のでへをにがはも。、！？!?]+$/g, '')
      .trim()
    if (!dest) {
      await replyMessage(replyToken, [textMsg('📍 目的地を入力してください（例：沖縄・京都・台北）')])
      return true
    }
    const next = { ...session, destination: dest, step: 'days' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeDaysFlex()])
    return true
  }

  if (session.step === 'days') {
    const n = parseInt(trim)
    if (isNaN(n) || n < 1 || n > 14) {
      await replyMessage(replyToken, [makeDaysFlex()])
      return true
    }
    const next = { ...session, days: n, step: 'startDate' as SuggestStep }
    await saveSuggestSession(groupId, userId, next)
    await replyMessage(replyToken, [makeStartDateFlex()])
    return true
  }

  if (session.step === 'startDate') {
    // Text fallback: "スキップ" skips, anything else re-shows the Flex
    if (/スキップ|skip/i.test(trim)) {
      const next = { ...session, startDate: undefined, step: 'members' as SuggestStep }
      await saveSuggestSession(groupId, userId, next)
      await replyMessage(replyToken, [makeMembersFlex()])
    } else {
      await replyMessage(replyToken, [makeStartDateFlex()])
    }
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
    await replyMessage(replyToken, [makeBudgetFlex()])
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
      next.startDate ? `🗓 開始日：${next.startDate}` : null,
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

  const syntheticText = value === 'skip' ? 'スキップ' : value
  await processStep(session, syntheticText, groupId, userId, replyToken, groupId || userId)
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
  const next = { ...session, startDate: date || undefined, step: 'members' as SuggestStep }
  await saveSuggestSession(groupId, userId, next)
  await replyMessage(replyToken, [makeMembersFlex()])
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

  if (action === 'save') {
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
  } else if (action === 'redo') {
    await clearSuggestSession(groupId, userId)
    await replyMessage(replyToken, [textMsg('🔄 最初からやり直します。\n\n📍 目的地を教えてください\n例：沖縄・京都・台北・ソウル')])
    await saveSuggestSession(groupId, userId, { __type: 'suggest', action: 'suggest', step: 'destination', confidence: 0, raw: '' })
  } else {
    await clearSuggestSession(groupId, userId)
    await replyMessage(replyToken, [textMsg('❌ キャンセルしました。')])
  }
}

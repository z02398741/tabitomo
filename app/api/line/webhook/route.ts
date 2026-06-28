import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { parseRule } from '@/lib/rules/parser'
import { parseWithGemini, type EventSummary } from '@/lib/ai/gemini'
import { savePendingAction, getPendingAction, clearPendingAction } from '@/lib/actions/pending'
import { executeUpdate } from '@/lib/rules/update'
import { executeCreate } from '@/lib/rules/create'
import { executeDelete } from '@/lib/rules/delete'
import { replyMessage, textMsg, quickReplyMsg } from '@/lib/line/reply'
import { getWeather } from '@/lib/weather'
import { confirmationText, successText } from '@/lib/line/messages'
import { handleSuggestFlow, handleSuggestDatePostback, handleSuggestConfirm, handleSuggestStepPostback, handleSuggestDestPick } from '@/lib/line/suggest'
import { handleLocalSearch, handleLocalSearchLocation } from '@/lib/line/localsearch'
import { logGroupMessage, handleConversationRecommend } from '@/lib/line/conversation'
import { getLocale, setLocale, detectLocaleCommand, isLanguageMenu, t, helpText, helpNonEditorText, type Locale } from '@/lib/line/i18n'
import type { ParsedAction } from '@/types/action'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET!
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64')
  return hash === signature
}

function sortedDays(days: any[]): any[] {
  return [...(days ?? [])].sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position
    return (a.date ?? '').localeCompare(b.date ?? '')
  })
}

function sortedEvents(events: any[]): any[] {
  return [...(events ?? [])].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
}

const EVENT_ICON: Record<string, string> = {
  transport: '🚢', gather: '📍', activity: '🤿',
  meal: '🍽', stay: '🏨', free: '🌊',
}

async function getSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = getAdmin()
  const { data } = await supabase.storage.from('tickets').createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? null
}

function isImagePath(path: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path)
}

function formatTrip(trip: any): string {
  const lines: string[] = [`📍 ${trip.title}`]
  if (trip.transport) lines.push(`🚢 ${trip.transport}`)
  lines.push('')
  for (const day of sortedDays(trip.days)) {
    lines.push(`▶ ${day.label}`)
    for (const ev of sortedEvents(day.events)) {
      const hasTicket = (ev.tickets?.length ?? 0) > 0
      lines.push(`${EVENT_ICON[ev.type] || '•'} ${ev.time} ${ev.title}${hasTicket ? ' 📎' : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function getDayEventsMessages(day: any, locale: Locale, fallback: string): Promise<object[]> {
  if (!day || !sortedEvents(day.events ?? []).length) return [textMsg(fallback)]

  const lines = [t(locale, 'dayScheduleHeader', { label: day.label })]
  const ticketPaths: Array<{ name: string; path: string }> = []

  let dayCost = 0
  for (const ev of sortedEvents(day.events)) {
    lines.push(`${EVENT_ICON[ev.type] || '•'} ${ev.time} ${ev.title}`)
    if (ev.note) lines.push(`   📝 ${ev.note}`)
    if (ev.location) lines.push(`   📍 ${ev.location}`)
    if (ev.cost != null && ev.cost > 0) {
      lines.push(`   💰 ¥${ev.cost.toLocaleString()}`)
      dayCost += ev.cost
    }
    for (const tk of ev.tickets ?? []) {
      if (tk.storage_path) ticketPaths.push({ name: tk.name || ev.title, path: tk.storage_path })
    }
  }
  if (dayCost > 0) lines.push(`\n${t(locale, 'subtotal', { n: dayCost.toLocaleString() })}`)

  const messages: object[] = [textMsg(lines.join('\n'))]

  // LINE reply limit: 5 messages. 1 used for text, so max 4 files.
  for (const ticket of ticketPaths.slice(0, 4)) {
    const url = await getSignedUrl(ticket.path)
    if (!url) continue
    if (isImagePath(ticket.path)) {
      messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
    } else {
      messages.push(textMsg(`📎 ${ticket.name}\n${url}`))
    }
  }

  return messages
}

function findDayByQuery(text: string, trip: any): any | null {
  const days = sortedDays(trip.days ?? [])
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const toDate = (d: Date) => new Date(d.getTime() + jstOffset).toISOString().split('T')[0]

  if (/明後日|後天|あさって/.test(text)) {
    const target = toDate(new Date(now.getTime() + 2 * 86400000))
    return days.find((d: any) => d.date === target) ?? null
  }
  if (/明日|明天|あした|あす/.test(text)) {
    const target = toDate(new Date(now.getTime() + 86400000))
    return days.find((d: any) => d.date === target) ?? null
  }

  // M/D or M月D日
  const mdMatch = text.match(/(\d{1,2})[\/月](\d{1,2})日?/)
  if (mdMatch) {
    const mm = mdMatch[1].padStart(2, '0')
    const dd = mdMatch[2].padStart(2, '0')
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const found = days.find((d: any) => d.date === `${year}-${mm}-${dd}`)
      if (found) return found
    }
    return null
  }

  // Day1 / Day2 / 第1天 / 1日目
  const dayNumMatch = text.match(/(?:day|Day|第)\s*(\d+)(?:天|日)?|(\d+)\s*日目/i)
  if (dayNumMatch) {
    const idx = parseInt(dayNumMatch[1] ?? dayNumMatch[2]) - 1
    return days[idx] ?? null
  }

  // label partial match (e.g. "7/19" already handled above, but "7月19" etc.)
  const labelMatch = days.find((d: any) =>
    d.label && text.includes(d.label.replace(/^.*?[｜|]/, '').trim().slice(0, 4))
  )
  return labelMatch ?? null
}

function flattenEvents(trip: any): EventSummary[] {
  const result: EventSummary[] = []
  for (const day of trip.days || []) {
    for (const ev of day.events || []) {
      result.push({ id: ev.id, title: ev.title, time: ev.time, day: day.label, dayId: day.id })
    }
  }
  return result
}

function resolveEvent(events: EventSummary[], title: string): EventSummary | null {
  const t = title.toLowerCase()
  return events.find(e => e.title.toLowerCase().includes(t) || t.includes(e.title.toLowerCase())) ?? null
}

function resolveDay(trip: any, hint: 'today' | 'tomorrow' | 'dayAfterTomorrow' | undefined): string | null {
  const days = sortedDays(trip.days ?? [])
  const today = new Date().toISOString().split('T')[0]
  if (!hint) {
    const day = days.find((d: any) => d.date === today) ?? days[0]
    return day?.id ?? null
  }
  const offset = hint === 'today' ? 0 : hint === 'tomorrow' ? 1 : 2
  const target = new Date(Date.now() + offset * 86_400_000).toISOString().split('T')[0]
  // Try exact date match first; fall back to position-based index when trip has no dates
  const byDate = days.find((d: any) => d.date === target)
  if (byDate) return byDate.id
  const byIndex = days[offset] ?? days[days.length - 1]
  return byIndex?.id ?? null
}

async function handleCommand(
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
) {
  const supabase = getAdmin()
  const convoKey = groupId || userId

  // 言語切替 / 語言切換
  if (isLanguageMenu(text)) {
    const cur = await getLocale(convoKey)
    await replyMessage(replyToken, [quickReplyMsg(t(cur, 'langMenu'), [
      { label: t(cur, 'langJa'), text: '日本語' },
      { label: t(cur, 'langZh'), text: '繁體中文' },
    ])])
    return
  }
  const wantLocale = detectLocaleCommand(text)
  if (wantLocale) {
    await setLocale(convoKey, wantLocale)
    await replyMessage(replyToken, [textMsg(t(wantLocale, 'langChanged'))])
    return
  }
  const locale = await getLocale(convoKey)

  // 連携コマンド
  const bindMatch = text.match(/連携\s+([a-f0-9-]{36})/i)
  if (bindMatch) {
    const tripId = bindMatch[1]
    const { data: trip, error } = await supabase
      .from('trips')
      .update({ line_group_id: groupId })
      .eq('id', tripId)
      .select('title')
      .single()
    if (error || !trip) {
      await replyMessage(replyToken, [textMsg(t(locale, 'bindNotFound'))])
    } else {
      await replyMessage(replyToken, [textMsg(t(locale, 'bindOk', { title: trip.title }))])
    }
    return
  }

  // AI 行程提案フロー — グループ連携なしでも使える。既存の pending より優先チェック
  const suggestHandled = await handleSuggestFlow(text, groupId, userId, replyToken)
  if (suggestHandled) return

  // 当地のおすすめ検索（カフェ・ラーメン・観光 等）— 行程連携なしでも使える
  const localHandled = await handleLocalSearch(text, groupId, userId, replyToken)
  if (localHandled) return

  // 会話コンテキストからの自動おすすめ（曖昧なメンション時）
  const convoHandled = await handleConversationRecommend(text, groupId, userId, replyToken)
  if (convoHandled) return

  // Fetch trip linked to this group (including tickets nested under events)
  const { data: trip } = await supabase
    .from('trips')
    .select('*, days:trip_days(*, events(*, tickets(*)))')
    .eq('line_group_id', groupId)
    .single()

  if (!trip) {
    await replyMessage(replyToken, [textMsg(t(locale, 'noTripGroup', { url: 'https://tabitomo-gilt.vercel.app' }))])
    return
  }

  // Check if user is owner/editor
  const { data: member } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', trip.id)
    .eq('user_id', userId)
    .maybeSingle()

  const canEdit = member?.role === 'owner' || member?.role === 'editor'

  // Confirmation: user replies 確認/確定/yes to pending action
  const confirmed = /^(確認|確定|はい|yes|ok|OK|好|好的)$/i.test(text)
  const cancelled = /^(取消|キャンセル|いいえ|no|No|算了|不用了)$/i.test(text)

  if (confirmed || cancelled) {
    const pending = await getPendingAction(groupId, userId)
    // suggest セッションは handleSuggestFlow で処理済みのためスキップ
    if (pending && (pending.action_json as any).__type !== 'suggest') {
      await clearPendingAction(groupId, userId)
      if (cancelled) {
        await replyMessage(replyToken, [textMsg(t(locale, 'confirmCancelled'))])
        return
      }
      // Execute the pending action
      try {
        const action = pending.action_json
        if (action.action === 'update') await executeUpdate(action)
        else if (action.action === 'create') await executeCreate(action)
        else if (action.action === 'delete') await executeDelete(action)
        else if (action.action === 'trip_update' && action.tripField && action.tripValue !== undefined) {
          const val = action.tripField === 'members' ? parseInt(action.tripValue) : action.tripValue
          await supabase.from('trips').update({ [action.tripField]: val }).eq('id', pending.trip_id)
        } else {
          await replyMessage(replyToken, [textMsg(t(locale, 'execUnsupported'))])
          return
        }
        await replyMessage(replyToken, [textMsg(successText(action, locale))])
      } catch (e) {
        console.error('execute error:', e)
        await replyMessage(replyToken, [textMsg(t(locale, 'execError'))])
      }
      return
    }
    // No pending — fall through to normal handling
  }

  // Quick commands
  const lower = text.toLowerCase()

  // 天気 / 天氣 / weather — check before day/予定 handlers so "今日の天気" isn't swallowed
  if (/天気|天氣|お天気|weather/.test(lower)) {
    if (!trip.destination) {
      await replyMessage(replyToken, [textMsg(t(locale, 'weatherNoDest', { url: 'https://tabitomo-gilt.vercel.app' }))])
      return
    }
    const wx = await getWeather(trip.destination)
    if (!wx.location) {
      await replyMessage(replyToken, [textMsg(t(locale, 'weatherLocNotFound', { dest: trip.destination }))])
      return
    }
    const lines = [t(locale, 'weatherHeader', { name: wx.location.name })]
    const datedDays = sortedDays(trip.days ?? []).filter((d: any) => d.date && wx.days[d.date])
    if (datedDays.length) {
      for (const day of datedDays) {
        const w = wx.days[day.date]
        const rain = w.pop > 0 ? `  ☔${w.pop}%` : ''
        lines.push(`\n▶ ${day.label}`)
        lines.push(`${w.emoji} ${w.label}  ${w.tmin}〜${w.tmax}℃${rain}`)
      }
    } else {
      // 旅行日が予報範囲(16日)外 → 直近の予報を表示
      const upcoming = Object.values(wx.days).slice(0, 5)
      if (!upcoming.length) {
        await replyMessage(replyToken, [textMsg(t(locale, 'weatherNone'))])
        return
      }
      lines.push(t(locale, 'weatherOutOfRange'))
      for (const w of upcoming) {
        const rain = w.pop > 0 ? `  ☔${w.pop}%` : ''
        lines.push(`${w.date.slice(5).replace('-', '/')} ${w.emoji} ${w.label} ${w.tmin}〜${w.tmax}℃${rain}`)
      }
    }
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // Specific day query (明日, 7/19, Day2, etc.) — check before generic 予定
  const specificDay = findDayByQuery(text, trip)
  if (specificDay) {
    const messages = await getDayEventsMessages(specificDay, locale, t(locale, 'noEventsDay'))
    await replyMessage(replyToken, messages)
    return
  }

  // Today's schedule
  if (lower.includes('今日') || lower.includes('予定') || lower.includes('スケジュール') || lower.includes('今天')) {
    const today = new Date().toISOString().split('T')[0]
    const todayDay = (trip.days ?? []).find((d: any) => d.date === today)
    const messages = await getDayEventsMessages(todayDay, locale, t(locale, 'noEventsToday'))
    await replyMessage(replyToken, messages)
    return
  }

  // Full itinerary
  if (lower.includes('行程') || lower.includes('全部') || lower.includes('全体') || lower.includes('全程')) {
    await replyMessage(replyToken, [textMsg(formatTrip(trip))])
    return
  }

  // --- EXTENDED READ COMMANDS (all members) ---

  // 次の予定 / 下一個
  if (/次の予定|下一個|下一个|接下來/.test(lower)) {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const todayJST = jstNow.toISOString().slice(0, 10)
    const nowTime = jstNow.toISOString().slice(11, 16)
    const todayDay = sortedDays(trip.days ?? []).find((d: any) => d.date === todayJST)
    if (todayDay) {
      const next = sortedEvents(todayDay.events ?? []).find((ev: any) => ev.time > nowTime)
      if (next) {
        const lines = [
          t(locale, 'nextEventHeader'),
          `${EVENT_ICON[next.type] ?? '•'} ${next.time} ${next.title}`,
          next.note ? `📝 ${next.note}` : '',
          next.location ? `📍 ${next.location}` : '',
          next.cost != null && next.cost > 0 ? `💰 ¥${next.cost.toLocaleString()}` : '',
        ].filter(Boolean)
        await replyMessage(replyToken, [textMsg(lines.join('\n'))])
        return
      }
    }
    await replyMessage(replyToken, [textMsg(t(locale, 'noMoreToday'))])
    return
  }

  // 今日の残り / 今天剩下
  if (/今日の残り|今天剩下|剩下的|残り予定/.test(lower)) {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const todayJST = jstNow.toISOString().slice(0, 10)
    const nowTime = jstNow.toISOString().slice(11, 16)
    const todayDay = sortedDays(trip.days ?? []).find((d: any) => d.date === todayJST)
    if (todayDay) {
      const remaining = sortedEvents(todayDay.events ?? []).filter((ev: any) => ev.time >= nowTime)
      if (remaining.length) {
        const lines = [t(locale, 'remainHeader', { label: todayDay.label, n: String(remaining.length) })]
        for (const ev of remaining) {
          lines.push(`${EVENT_ICON[ev.type] ?? '•'} ${ev.time} ${ev.title}`)
          if (ev.note) lines.push(`   📝 ${ev.note}`)
          if (ev.location) lines.push(`   📍 ${ev.location}`)
          if (ev.cost != null && ev.cost > 0) lines.push(`   💰 ¥${ev.cost.toLocaleString()}`)
        }
        await replyMessage(replyToken, [textMsg(lines.join('\n'))])
        return
      }
    }
    await replyMessage(replyToken, [textMsg(t(locale, 'noMoreToday'))])
    return
  }

  // 成員 / メンバー一覧
  if (/^(成員|メンバー|参加者|member)(一覧|リスト|名單|list)?[\?？]?$/i.test(text.trim())) {
    const { data: memberRows } = await supabase
      .from('trip_members').select('user_id, role').eq('trip_id', trip.id)
    const userIds = (memberRows ?? []).map((m: any) => m.user_id)
    const { data: profiles } = await supabase
      .from('user_profiles').select('id, name').in('id', userIds)
    const profileMap: Record<string, string> = {}
    for (const p of profiles ?? []) profileMap[p.id] = p.name ?? p.id
    const lines = [t(locale, 'membersHeader', { n: String(memberRows?.length ?? 0) })]
    for (const m of (memberRows ?? [])) {
      const name = profileMap[(m as any).user_id] ?? (m as any).user_id
      lines.push((m as any).role === 'owner' ? `👑 ${name}` : `• ${name}`)
    }
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // 概要 / 旅行概要
  if (/概要|旅行情報/.test(lower)) {
    const days = sortedDays(trip.days ?? [])
    const dated = days.filter((d: any) => d.date)
    const first = dated[0]?.date
    const last = dated[dated.length - 1]?.date
    const range = first && last
      ? `${first.slice(5).replace('-', '/')} 〜 ${last.slice(5).replace('-', '/')}`
      : t(locale, 'dateUnset')
    const lines = [
      `📋 ${trip.title}`,
      trip.transport ? `🚢 ${trip.transport}` : '',
      trip.budget ? `💰 ${trip.budget}` : '',
      t(locale, 'summaryDays', { n: String(days.length), range }),
    ].filter(Boolean)
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // 最後一天 / 最終日
  if (/最後一天|最終日|最後の日|last day/.test(lower)) {
    const lastDay = [...sortedDays(trip.days ?? [])].pop()
    if (lastDay) {
      const messages = await getDayEventsMessages(lastDay, locale, t(locale, 'noEventsDay'))
      await replyMessage(replyToken, messages)
      return
    }
  }

  // 費用 / 費用合計 / cost summary
  if (/費用|コスト|budget|花費|支出/.test(lower)) {
    const lines = [t(locale, 'costHeader', { title: trip.title })]
    let tripTotal = 0
    for (const day of sortedDays(trip.days ?? [])) {
      let dayTotal = 0
      const evLines: string[] = []
      for (const ev of sortedEvents(day.events ?? [])) {
        if (ev.cost != null && ev.cost > 0) {
          evLines.push(`  ${EVENT_ICON[ev.type] || '•'} ${ev.title}：¥${ev.cost.toLocaleString()}`)
          dayTotal += ev.cost
        }
      }
      if (dayTotal > 0) {
        lines.push(`\n▶ ${day.label}`)
        lines.push(...evLines)
        lines.push(`  小計 ¥${dayTotal.toLocaleString()}`)
        tripTotal += dayTotal
      }
    }
    if (tripTotal === 0) {
      lines.push(`\n${t(locale, 'costNone')}`)
    } else {
      lines.push(`\n━━━━━━━━━━`)
      lines.push(t(locale, 'costTotal', { n: tripTotal.toLocaleString() }))
      if (trip.budget) lines.push(t(locale, 'costBudget', { budget: trip.budget }))
    }
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // 住宿 / 宿泊
  if (/^(住宿|宿泊|ホテル|チェックイン)/.test(lower)) {
    const lines = [t(locale, 'staysHeader')]
    for (const day of sortedDays(trip.days ?? []))
      for (const ev of sortedEvents(day.events ?? []))
        if (ev.type === 'stay') lines.push(`${day.label} | ${ev.time} ${ev.title}`)
    if (lines.length === 1) lines.push(t(locale, 'staysNone'))
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // 交通 / 移動 (standalone query only — not edit commands like 交通改バス)
  if (/^(交通|フライト|transport)(一覧|リスト|情報)?[\?？]?$/.test(lower.trim())) {
    const lines = [t(locale, 'transportHeader')]
    for (const day of sortedDays(trip.days ?? []))
      for (const ev of sortedEvents(day.events ?? []))
        if (ev.type === 'transport') lines.push(`${day.label} | ${ev.time} ${ev.title}`)
    if (lines.length === 1) lines.push(t(locale, 'transportNone'))
    await replyMessage(replyToken, [textMsg(lines.join('\n'))])
    return
  }

  // 残り何日 / 還有幾天
  if (/残り何日|還有幾天|あと何日|幾天後結束/.test(lower)) {
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dated = sortedDays(trip.days ?? []).filter((d: any) => d.date)
    const lastDay = dated[dated.length - 1]
    if (!lastDay) { await replyMessage(replyToken, [textMsg(t(locale, 'daysNoSchedule'))]); return }
    const diff = Math.ceil((new Date(lastDay.date).getTime() - new Date(todayJST).getTime()) / 86_400_000)
    const msg = diff < 0 ? t(locale, 'tripEnded')
      : diff === 0 ? t(locale, 'todayLastDay', { label: lastDay.label })
      : t(locale, 'daysLeft', { n: String(diff), label: lastDay.label, date: lastDay.date.slice(5).replace('-', '/') })
    await replyMessage(replyToken, [textMsg(msg)])
    return
  }

  // 何日目 / 第幾天
  if (/何日目|第幾天|今天第幾天|旅行何日目/.test(lower)) {
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dated = sortedDays(trip.days ?? []).filter((d: any) => d.date)
    const idx = dated.findIndex((d: any) => d.date === todayJST)
    let msg: string
    if (idx >= 0) {
      msg = t(locale, 'dayNumber', { n: String(idx + 1), label: dated[idx].label })
    } else {
      const first = dated[0]
      msg = first && first.date > todayJST
        ? t(locale, 'beforeStart', { n: String(Math.ceil((new Date(first.date).getTime() - new Date(todayJST).getTime()) / 86_400_000)) })
        : t(locale, 'outsideTrip')
    }
    await replyMessage(replyToken, [textMsg(msg)])
    return
  }

  // [event]幾點 / [event]はいつ — event time search by keyword
  const timeQueryMatch = text.match(/^(.+?)(幾點|幾時|はいつ|は何時|何時から|在幾點)[\?？]?$/)
  if (timeQueryMatch) {
    const keyword = timeQueryMatch[1].trim()
    const found: string[] = []
    for (const day of sortedDays(trip.days ?? []))
      for (const ev of sortedEvents(day.events ?? []))
        if (ev.title.includes(keyword)) found.push(`${day.label} ${ev.time} ${ev.title}`)
    const msg = found.length
      ? `${t(locale, 'timeQueryHeader', { kw: keyword })}\n\n${found.join('\n')}`
      : t(locale, 'timeQueryNone', { kw: keyword })
    await replyMessage(replyToken, [textMsg(msg)])
    return
  }

  // If user cannot edit, skip AI parse
  if (!canEdit) {
    await replyMessage(replyToken, [textMsg(helpNonEditorText(locale))])
    return
  }

  // --- AI PARSE FLOW ---

  // Explicit help shortcut — skip AI parse entirely
  if (/^(help|ヘルプ|幫助|說明|使い方)$/i.test(text)) {
    await replyMessage(replyToken, [textMsg(helpText(locale))])
    return
  }

  const events = flattenEvents(trip)

  // Try rule-based parser first
  let parsed: ParsedAction | null = null
  const ruleResult = parseRule(text)
  if (ruleResult && ruleResult.confidence >= 0.8) {
    parsed = { ...ruleResult, raw: text }
  }

  // Fallback to Gemini
  if (!parsed) {
    const geminiResult = await parseWithGemini(text, events)
    if (geminiResult.confidence >= 0.6) {
      parsed = geminiResult
    }
  }

  if (!parsed || parsed.confidence < 0.5) {
    await replyMessage(replyToken, [textMsg(helpText(locale))])
    return
  }

  // Resolve event reference (by title) if not already resolved by Gemini
  if (!parsed.eventId && parsed.eventTitle) {
    const matched = resolveEvent(events, parsed.eventTitle)
    if (matched) {
      parsed.eventId = matched.id
      parsed.eventTitle = matched.title
      parsed.oldTime = matched.time
      parsed.dayLabel = matched.day  // day label for confirmation display
    }
  }
  // For Gemini-resolved events that have eventId but no dayLabel, look it up
  if (parsed.eventId && !parsed.dayLabel) {
    const ev = events.find(e => e.id === parsed!.eventId)
    if (ev) parsed.dayLabel = ev.day
  }

  // For create: resolve dayId and dayLabel
  if (parsed.action === 'create' && !parsed.dayId) {
    const dayHint = (ruleResult as any)?.dayHint
    const dayId = resolveDay(trip, dayHint) ?? undefined
    parsed.dayId = dayId
    if (dayId) {
      const d = (trip.days ?? []).find((x: any) => x.id === dayId)
      if (d) parsed.dayLabel = d.date
        ? `${d.label} (${d.date.slice(5).replace('-', '/')})`
        : d.label
    }
  }

  // Validate required fields (trip_update needs neither eventId nor dayId)
  if (parsed.action !== 'create' && parsed.action !== 'trip_update' && !parsed.eventId) {
    await replyMessage(replyToken, [textMsg(t(locale, 'eventNotFound', { name: parsed.eventTitle || text }))])
    return
  }
  if (parsed.action === 'create' && !parsed.dayId) {
    await replyMessage(replyToken, [textMsg(t(locale, 'createNoDay'))])
    return
  }

  // Save pending action and ask for confirmation
  await savePendingAction(groupId, userId, trip.id, parsed)
  await replyMessage(replyToken, [
    quickReplyMsg(confirmationText(parsed, locale), [
      { label: '✅ 確認', text: '確認' },
      { label: '❌ 取消', text: '取消' },
    ]),
  ])
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  const signature = req.headers.get('x-line-signature') || ''
  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = JSON.parse(body)

  for (const event of data.events || []) {
    // Postback events (datetimepicker + Flex confirm buttons)
    if (event.type === 'postback') {
      const pbData: string = event.postback?.data || ''
      const pbGroupId: string = event.source?.groupId || ''
      const pbUserId: string = event.source?.userId || ''
      const pbReplyToken: string = event.replyToken
      if (pbData === 'suggest:date') {
        await handleSuggestDatePostback(event.postback?.params?.date || '', pbGroupId, pbUserId, pbReplyToken)
      } else if (pbData === 'suggest:date:skip') {
        await handleSuggestDatePostback('', pbGroupId, pbUserId, pbReplyToken)
      } else if (pbData.startsWith('suggest:confirm:')) {
        const confirmAction = pbData.replace('suggest:confirm:', '') as 'save' | 'redo' | 'cancel'
        await handleSuggestConfirm(confirmAction, pbGroupId, pbUserId, pbReplyToken)
      } else if (pbData.startsWith('suggest:dest:')) {
        await handleSuggestDestPick(pbData.slice('suggest:dest:'.length), pbGroupId, pbUserId, pbReplyToken)
      } else if (pbData.startsWith('suggest:step:')) {
        await handleSuggestStepPostback(pbData, pbGroupId, pbUserId, pbReplyToken)
      }
      continue
    }

    // Location messages — complete a pending current-location search
    if (event.type === 'message' && event.message?.type === 'location') {
      await handleLocalSearchLocation(
        event.message.latitude, event.message.longitude,
        event.source?.groupId || '', event.source?.userId || '', event.replyToken,
      )
      continue
    }

    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text: string = event.message.text
    const replyToken: string = event.replyToken
    const groupId: string = event.source?.groupId || ''
    const userId: string = event.source?.userId || ''

    // Passive log of group conversation for context-aware recommendations
    // (rolling buffer with TTL). Runs for every text message, before the
    // mention filter, so prior chatter is available when the bot is called.
    await logGroupMessage(groupId || userId, userId, text)

    const mentionees = event.message?.mention?.mentionees || []
    const isMentionedByObj = mentionees.some((m: { isSelf?: boolean }) => m.isSelf === true)
    const isMentionedByText = text.includes('@Tabi')

    // Allow confirmation replies without @mention (they're direct responses to bot prompt)
    const isConfirmation = /^(確認|確定|はい|yes|ok|OK|好|好的|取消|キャンセル|いいえ|no|No|算了|不用了)$/i.test(text.trim())
    // Allow language-switch quick-reply taps without @mention
    const isLangReply = detectLocaleCommand(text) !== null

    if (!isMentionedByObj && !isMentionedByText && !isConfirmation && !isLangReply) continue

    const command = isConfirmation ? text.trim() : text.replace(/@\S+\s*/g, '').trim()
    await handleCommand(command, groupId, userId, replyToken)
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

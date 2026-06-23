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
import { confirmationText, successText } from '@/lib/line/messages'
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

async function getDayEventsMessages(day: any, fallback = 'この日の予定はありません'): Promise<object[]> {
  if (!day || !sortedEvents(day.events ?? []).length) return [textMsg(fallback)]

  const lines = [`📅 ${day.label} の予定`]
  const ticketPaths: Array<{ name: string; path: string }> = []

  for (const ev of sortedEvents(day.events)) {
    lines.push(`${EVENT_ICON[ev.type] || '•'} ${ev.time} ${ev.title}`)
    if (ev.note) lines.push(`   📝 ${ev.note}`)
    for (const t of ev.tickets ?? []) {
      if (t.storage_path) ticketPaths.push({ name: t.name || ev.title, path: t.storage_path })
    }
  }

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
  const today = new Date().toISOString().split('T')[0]
  if (!hint) {
    const day = trip.days?.find((d: any) => d.date === today) ?? trip.days?.[0]
    return day?.id ?? null
  }
  const offset = hint === 'today' ? 0 : hint === 'tomorrow' ? 1 : 2
  const target = new Date(Date.now() + offset * 86_400_000).toISOString().split('T')[0]
  const day = trip.days?.find((d: any) => d.date === target)
  return day?.id ?? null
}

async function handleCommand(
  text: string,
  groupId: string,
  userId: string,
  replyToken: string,
) {
  const supabase = getAdmin()

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
      await replyMessage(replyToken, [textMsg('⚠️ 行程が見つかりませんでした。IDを確認してください。')])
    } else {
      await replyMessage(replyToken, [textMsg(`✅ 「${trip.title}」とこのグループを連携しました！\n予定通知がここに届くようになります。`)])
    }
    return
  }

  // Fetch trip linked to this group (including tickets nested under events)
  const { data: trip } = await supabase
    .from('trips')
    .select('*, days:trip_days(*, events(*, tickets(*)))')
    .eq('line_group_id', groupId)
    .single()

  if (!trip) {
    await replyMessage(replyToken, [textMsg('⚠️ このグループにはまだ行程が登録されていません。\nhttps://tabitomo-gilt.vercel.app')])
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
    if (pending) {
      await clearPendingAction(groupId, userId)
      if (cancelled) {
        await replyMessage(replyToken, [textMsg('已取消，行程未變更。')])
        return
      }
      // Execute the pending action
      try {
        const action = pending.action_json
        if (action.action === 'update') await executeUpdate(action)
        else if (action.action === 'create') await executeCreate(action)
        else if (action.action === 'delete') await executeDelete(action)
        else {
          await replyMessage(replyToken, [textMsg('⚠️ 此操作類型暫不支持自動執行，請在 App 中修改。')])
          return
        }
        await replyMessage(replyToken, [textMsg(successText(action))])
      } catch (e) {
        console.error('execute error:', e)
        await replyMessage(replyToken, [textMsg('⚠️ 執行時發生錯誤，請在 App 中確認。')])
      }
      return
    }
    // No pending — fall through to normal handling
  }

  // Quick commands
  const lower = text.toLowerCase()

  // Specific day query (明日, 7/19, Day2, etc.) — check before generic 予定
  const specificDay = findDayByQuery(text, trip)
  if (specificDay) {
    const messages = await getDayEventsMessages(specificDay, 'この日の予定はありません')
    await replyMessage(replyToken, messages)
    return
  }

  // Today's schedule
  if (lower.includes('今日') || lower.includes('予定') || lower.includes('スケジュール') || lower.includes('今天')) {
    const today = new Date().toISOString().split('T')[0]
    const todayDay = (trip.days ?? []).find((d: any) => d.date === today)
    const messages = await getDayEventsMessages(todayDay, '今日の予定はありません')
    await replyMessage(replyToken, messages)
    return
  }

  // Full itinerary
  if (lower.includes('行程') || lower.includes('全部') || lower.includes('全体') || lower.includes('全程')) {
    await replyMessage(replyToken, [textMsg(formatTrip(trip))])
    return
  }

  // If user cannot edit, skip AI parse
  if (!canEdit) {
    await replyMessage(replyToken, [textMsg(
      `🤖 Tabitomo Bot\n\n使い方：\n• 今日の予定は？\n• 行程を見せて\n\n✏️ 変更はアプリから：\nhttps://tabitomo-gilt.vercel.app`
    )])
    return
  }

  // --- AI PARSE FLOW ---

  // Explicit help shortcut — skip AI parse entirely
  if (/^(help|ヘルプ|幫助|說明|使い方)$/i.test(text)) {
    await replyMessage(replyToken, [textMsg(
      `🤖 Tabitomo Bot\n\n` +
      `📖 查詢\n` +
      `• @Tabi 今天的行程\n` +
      `• @Tabi 明日の予定\n` +
      `• @Tabi 7/19の予定\n` +
      `• @Tabi Day2\n` +
      `• @Tabi 全程行程\n\n` +
      `✏️ 修改時間\n` +
      `• @Tabi 咖啡廳改下午三點\n` +
      `• @Tabi 晚餐改18:30\n` +
      `• @Tabi 集合延後30分\n\n` +
      `➕ 新增行程\n` +
      `• @Tabi 新增下午兩點 海灘散步\n` +
      `• @Tabi 明天下午三點加咖啡廳\n\n` +
      `🗑️ 取消行程\n` +
      `• @Tabi 取消晚餐\n` +
      `• @Tabi 刪除咖啡廳\n\n` +
      `⚠️ 變更需要確認，Bot 會先詢問你\n` +
      `✏️ 複雜操作請在 App 中修改：\nhttps://tabitomo-gilt.vercel.app`
    )])
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
    await replyMessage(replyToken, [textMsg(
      `🤖 Tabitomo Bot\n\n` +
      `📖 查詢\n` +
      `• @Tabi 今天的行程\n` +
      `• @Tabi 明日の予定\n` +
      `• @Tabi 7/19の予定\n` +
      `• @Tabi Day2\n` +
      `• @Tabi 全程行程\n\n` +
      `✏️ 修改時間\n` +
      `• @Tabi 咖啡廳改下午三點\n` +
      `• @Tabi 晚餐改18:30\n` +
      `• @Tabi 集合延後30分\n\n` +
      `➕ 新增行程\n` +
      `• @Tabi 新增下午兩點 海灘散步\n` +
      `• @Tabi 明天下午三點加咖啡廳\n\n` +
      `🗑️ 取消行程\n` +
      `• @Tabi 取消晚餐\n` +
      `• @Tabi 刪除咖啡廳\n\n` +
      `⚠️ 變更需要確認，Bot 會先詢問你\n` +
      `✏️ 複雜操作請在 App 中修改：\nhttps://tabitomo-gilt.vercel.app`
    )])
    return
  }

  // Resolve event reference (by title) if not already resolved by Gemini
  if (!parsed.eventId && parsed.eventTitle) {
    const matched = resolveEvent(events, parsed.eventTitle)
    if (matched) {
      parsed.eventId = matched.id
      parsed.eventTitle = matched.title
      parsed.oldTime = matched.time
    }
  }

  // For create: resolve dayId if not set
  if (parsed.action === 'create' && !parsed.dayId) {
    parsed.dayId = resolveDay(trip, (ruleResult as any)?.dayHint) ?? undefined
  }

  // Validate required fields
  if (parsed.action !== 'create' && !parsed.eventId) {
    await replyMessage(replyToken, [textMsg(`⚠️ 找不到行程項目「${parsed.eventTitle || text}」，請確認名稱。`)])
    return
  }
  if (parsed.action === 'create' && !parsed.dayId) {
    await replyMessage(replyToken, [textMsg('⚠️ 無法確認新增到哪一天，請在 App 中操作。')])
    return
  }

  // Save pending action and ask for confirmation
  await savePendingAction(groupId, userId, trip.id, parsed)
  await replyMessage(replyToken, [
    quickReplyMsg(confirmationText(parsed), [
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
    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text: string = event.message.text
    const replyToken: string = event.replyToken
    const groupId: string = event.source?.groupId || ''
    const userId: string = event.source?.userId || ''

    const mentionees = event.message?.mention?.mentionees || []
    const isMentionedByObj = mentionees.some((m: { isSelf?: boolean }) => m.isSelf === true)
    const isMentionedByText = text.includes('@Tabi')

    // Allow confirmation replies without @mention (they're direct responses to bot prompt)
    const isConfirmation = /^(確認|確定|はい|yes|ok|OK|好|好的|取消|キャンセル|いいえ|no|No|算了|不用了)$/i.test(text.trim())

    if (!isMentionedByObj && !isMentionedByText && !isConfirmation) continue

    const command = isConfirmation ? text.trim() : text.replace(/@\S+\s*/g, '').trim()
    await handleCommand(command, groupId, userId, replyToken)
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

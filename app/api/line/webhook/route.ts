import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET!
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(body)
    .digest('base64')
  return hash === signature
}

async function reply(replyToken: string, messages: any[]) {
  console.log('reply called:', replyToken, JSON.stringify(messages))
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  })
  const result = await res.text()
  console.log('reply result:', res.status, result)
}

function formatTrip(trip: any): string {
  const lines: string[] = [`📍 ${trip.title}`]
  if (trip.transport) lines.push(`🚢 ${trip.transport}`)
  lines.push('')

  for (const day of trip.days || []) {
    lines.push(`▶ ${day.label}`)
    for (const ev of day.events || []) {
      const icon: Record<string, string> = {
        transport:'🚢', gather:'📍', activity:'🤿',
        meal:'🍽', stay:'🏨', free:'🌊'
      }
      lines.push(`${icon[ev.type]||'•'} ${ev.time} ${ev.title}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function getTodayEvents(trip: any): string {
  const today = new Date().toISOString().split('T')[0]
  const day = trip.days?.find((d: any) => d.date === today)
  if (!day || !day.events?.length) return '今日の予定はありません'

  const lines = [`📅 ${day.label} の予定`]
  for (const ev of day.events) {
    const icon: Record<string, string> = {
      transport:'🚢', gather:'📍', activity:'🤿',
      meal:'🍽', stay:'🏨', free:'🌊'
    }
    lines.push(`${icon[ev.type]||'•'} ${ev.time} ${ev.title}`)
    if (ev.note) lines.push(`   📝 ${ev.note}`)
  }
  return lines.join('\n')
}

async function handleCommand(text: string, groupId: string, replyToken: string) {
  const supabase = getAdmin()

  // 連携コマンド: 連携 <trip_id>
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
      await reply(replyToken, [{ type: 'text', text: '⚠️ 行程が見つかりませんでした。IDを確認してください。' }])
    } else {
      await reply(replyToken, [{ type: 'text', text: `✅ 「${trip.title}」とこのグループを連携しました！\n予定通知がここに届くようになります。` }])
    }
    return
  }

  const { data: trip } = await supabase
    .from('trips')
    .select(`*, days:trip_days(*, events(*))`)
    .eq('line_group_id', groupId)
    .single()

  if (!trip) {
    await reply(replyToken, [{
      type: 'text',
      text: '⚠️ このグループにはまだ行程が登録されていません。\nhttps://tabitomo-gilt.vercel.app'
    }])
    return
  }

  const lower = text.toLowerCase()

  if (lower.includes('今日') || lower.includes('予定') || lower.includes('スケジュール')) {
    await reply(replyToken, [{ type:'text', text: getTodayEvents(trip) }])
    return
  }

  if (lower.includes('行程') || lower.includes('全部') || lower.includes('全体')) {
    await reply(replyToken, [{ type:'text', text: formatTrip(trip) }])
    return
  }

  await reply(replyToken, [{
    type: 'text',
    text: `🤖 Tabitomo Bot\n\n使い方：\n• 今日の予定は？\n• 行程を見せて\n\n✏️ 変更はアプリから：\nhttps://tabitomo-gilt.vercel.app`
  }])
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  console.log('POST received')

  const signature = req.headers.get('x-line-signature') || ''
  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const data = JSON.parse(body)
  console.log('events count:', data.events?.length)

  for (const event of data.events || []) {
    console.log('event type:', event.type)
    if (event.type !== 'message' || event.message?.type !== 'text') continue

    const text: string = event.message.text
    const replyToken: string = event.replyToken
    const groupId: string = event.source?.groupId || ''

    const mentionees = event.message?.mention?.mentionees || []
    const isMentionedByObj = mentionees.some((m: { isSelf?: boolean }) => m.isSelf === true)
    const isMentionedByText = text.includes('@Tabi')

    if (!isMentionedByObj && !isMentionedByText) continue

    const command = text.replace(/@\S+\s*/g, '').trim()
    await handleCommand(command, groupId, replyToken)
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

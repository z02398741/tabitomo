import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `You are a travel itinerary parser. Extract structured data from the given itinerary text and return ONLY valid JSON with no markdown, no explanation.

Return this exact shape:
{
  "title": "trip title string",
  "members": null or number,
  "budget": null or "budget string",
  "transport": null or "transport string",
  "days": [
    {
      "label": "Day1｜7/18（五）",
      "date": "YYYY-MM-DD or empty string",
      "events": [
        {
          "time": "HH:MM",
          "title": "event title",
          "type": "transport|gather|meal|activity|stay|free",
          "note": "",
          "alert_min": 0
        }
      ]
    }
  ]
}

Rules:
- type must be one of: transport, gather, meal, activity, stay, free
- alert_min: transport=60, gather=60, meal=15, activity=30, stay=0, free=0
- date: convert relative dates to YYYY-MM-DD using year 2026 if year not specified
- Include only events that have a time (HH:MM format)
- Lines starting with ※ or → are notes for the previous event, not new events
- Return ONLY the JSON object, nothing else`

const USER_PROMPT = (text: string) =>
  `Parse this itinerary text:\n\n${text}`

function fallbackParse() {
  return { title: '旅行行程', members: null, budget: null, transport: null, days: [] }
}

async function parseClaude(text: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const stream = client.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT(text) }],
  })
  const msg = await stream.finalMessage()
  const textBlock = msg.content.find((b: any) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') return fallbackParse()
  return JSON.parse(textBlock.text.trim())
}

async function parseGemini(text: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(
    `${SYSTEM_PROMPT}\n\n${USER_PROMPT(text)}`
  )
  const raw = result.response.text().trim()
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, provider } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  try {
    let parsed: any
    if (provider === 'gemini') {
      parsed = await parseGemini(text)
    } else {
      // claude is temporarily disabled; keyword parsing is handled client-side
      return NextResponse.json({ error: 'invalid provider' }, { status: 400 })
    }
    return NextResponse.json(parsed)
  } catch (e: any) {
    console.error('[parse] error:', e)
    return NextResponse.json({ error: e.message || 'parse failed' }, { status: 500 })
  }
}

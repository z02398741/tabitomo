import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `You are a travel planning assistant. Create a detailed, realistic travel itinerary based on the user's requirements.

Return ONLY valid JSON with no markdown, no explanation.

Return this exact shape:
{
  "title": "trip title string (e.g. 京都 2泊3日旅行)",
  "members": null or number,
  "budget": null or "budget description string",
  "transport": null or "transport string",
  "destination": "main destination city/area for weather lookup",
  "days": [
    {
      "label": "Day1｜8/1（金）",
      "date": "YYYY-MM-DD or empty string",
      "events": [
        {
          "time": "HH:MM",
          "title": "event title using specific real place names",
          "type": "transport|gather|meal|activity|stay|free",
          "note": "",
          "location": null or "specific venue/place name",
          "cost": null or number (estimated JPY),
          "alert_min": 0
        }
      ]
    }
  ]
}

Rules:
- type must be exactly one of: transport, gather, meal, activity, stay, free
- alert_min: transport=60, gather=60, meal=15, activity=30, stay=0, free=0
- Each day must have 6-8 events with realistic HH:MM times
- First day starts with departure/transport, last day ends with return
- Include check-in/check-out on appropriate days
- Use specific real place names, not generic descriptions
- Include realistic estimated costs in JPY for meals, admissions, activities
- 節約 budget: public transport, ramen/teishoku, budget hotels; 豪華: premium experiences, good restaurants
- Return ONLY the JSON object, nothing else`

async function callGemini(modelName: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: modelName })
  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim()
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(json)
}

async function generate(userPrompt: string) {
  const full = `${SYSTEM_PROMPT}\n\n以下の条件で旅行行程を作成してください:\n\n${userPrompt}`
  const delays = [1000, 2000]
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await callGemini('gemini-2.5-flash', full)
    } catch (e: any) {
      const is503 = e.message?.includes('503') || e.status === 503
      if (!is503 || attempt === delays.length) throw e
      await new Promise(r => setTimeout(r, delays[attempt]))
    }
  }
  console.warn('[suggest] gemini-2.5-flash overloaded, falling back to gemini-2.0-flash')
  return callGemini('gemini-2.0-flash', full)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { destination, days, startDate, members, budget, transport, styles, freeNote } = await req.json()
  if (!destination?.trim()) return NextResponse.json({ error: 'destination required' }, { status: 400 })
  if (!days || days < 1 || days > 14) return NextResponse.json({ error: 'days must be 1-14' }, { status: 400 })

  const budgetLabel: Record<string, string> = { budget: '節約（低予算）', moderate: '普通', luxury: '豪華（高予算）' }

  const lines = [
    `目的地: ${destination.trim()}`,
    `旅行日数: ${days}日間（${days - 1}泊${days}日）`,
    startDate ? `出発日: ${startDate}` : '出発日: 未定（2026年を想定）',
    members ? `人数: ${members}人` : null,
    budget ? `予算感: ${budgetLabel[budget] ?? budget}` : null,
    transport ? `移動手段（往復）: ${transport}` : null,
    styles?.length ? `旅のスタイル: ${(styles as string[]).join('・')}` : null,
    freeNote?.trim() ? `備考: ${freeNote.trim()}` : null,
  ].filter(Boolean).join('\n')

  try {
    const parsed = await generate(lines)
    return NextResponse.json(parsed)
  } catch (e: any) {
    console.error('[suggest] error:', e)
    return NextResponse.json({ error: e.message || 'generation failed' }, { status: 500 })
  }
}

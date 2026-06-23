import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedAction } from '@/types/action'

export type EventSummary = {
  id: string
  title: string
  time: string
  day: string
  dayId: string
}

export async function parseWithGemini(
  userMessage: string,
  events: EventSummary[]
): Promise<ParsedAction> {
  const fallback: ParsedAction = { action: 'update', confidence: 0, raw: userMessage }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fallback

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a travel itinerary assistant.
Current events:
${JSON.stringify(events, null, 2)}

User message: "${userMessage}"

Return JSON only (no markdown, no explanation).
Schema:
{
  "action": "update" | "create" | "delete" | "move",
  "eventId": "uuid of matched event, or null for create",
  "eventTitle": "display title of matched event, or null",
  "time": "HH:MM format, or null",
  "title": "new event title for create, or null",
  "targetDayLabel": "target day label for move, or null",
  "dayId": "uuid of target day for create, or null",
  "confidence": 0.0 to 1.0
}

Rules:
- For update: find the event by title, return its id and new time
- For delete: find the event by title, return its id
- For create: return new title and time; set dayId if mentioned day matches
- For move: return eventId and targetDayLabel
- Set confidence low (< 0.5) if intent is unclear`

  try {
    const result = await model.generateContent(prompt)
    const raw = result.response.text().trim()
      .replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()

    const parsed = JSON.parse(raw)
    return {
      action: parsed.action ?? 'update',
      eventId: parsed.eventId ?? undefined,
      eventTitle: parsed.eventTitle ?? undefined,
      time: parsed.time ?? undefined,
      title: parsed.title ?? undefined,
      targetDayLabel: parsed.targetDayLabel ?? undefined,
      dayId: parsed.dayId ?? undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      raw: userMessage,
    }
  } catch (e) {
    console.error('Gemini error:', e)
    return fallback
  }
}

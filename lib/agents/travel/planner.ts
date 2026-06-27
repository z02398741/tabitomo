import { GoogleGenerativeAI } from '@google/generative-ai'
import type { TravelAgentInput, RankedCandidate } from './types'
import { SYSTEM_PROMPT, buildCandidateBlock } from './prompts/suggest'

async function callGemini(modelName: string, prompt: string): Promise<any> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: modelName })
  const result = await model.generateContent(prompt)
  const raw = result.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  return JSON.parse(raw)
}

export async function buildItinerary(
  input: TravelAgentInput,
  spots: RankedCandidate[],
  restaurants: RankedCandidate[],
  weatherHint = '',
): Promise<any> {
  const budgetLabel: Record<string, string> = {
    budget: '節約（低予算）',
    moderate: '普通',
    luxury: '豪華（高予算）',
  }

  const lines = [
    `目的地: ${input.destination}`,
    `旅行日数: ${input.durationDays}日間（${input.durationDays - 1}泊${input.durationDays}日）`,
    input.startDate ? `出発日: ${input.startDate}` : '出発日: 未定（2026年を想定）',
    input.members ? `人数: ${input.members}人` : null,
    `予算感: ${budgetLabel[input.budget] ?? input.budget}`,
    input.note?.trim() ? `備考: ${input.note.trim()}` : null,
  ].filter(Boolean).join('\n')

  const candidateBlock = buildCandidateBlock(spots, restaurants)
  const fullPrompt = `${SYSTEM_PROMPT}\n\n以下の条件で旅行行程を作成してください:\n\n${lines}${candidateBlock}${weatherHint}`

  const delays = [1000, 2000]
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await callGemini('gemini-2.5-flash', fullPrompt)
    } catch (e: any) {
      const is503 = e.message?.includes('503') || e.status === 503
      if (!is503 || attempt === delays.length) throw e
      await new Promise(r => setTimeout(r, delays[attempt]))
    }
  }
  console.warn('[travel] gemini-2.5-flash overloaded, falling back to gemini-2.0-flash')
  return callGemini('gemini-2.0-flash', fullPrompt)
}

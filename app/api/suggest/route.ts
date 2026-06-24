import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { runTravelAgent } from '@/lib/agents/travel/agent'
import type { BudgetLevel } from '@/lib/agents/travel/types'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { destination, days, startDate, members, budget, transport, styles, freeNote } = await req.json()
  if (!destination?.trim()) return NextResponse.json({ error: 'destination required' }, { status: 400 })
  if (!days || days < 1 || days > 14) return NextResponse.json({ error: 'days must be 1-14' }, { status: 400 })

  const validBudgets: BudgetLevel[] = ['budget', 'moderate', 'luxury']
  const resolvedBudget: BudgetLevel = validBudgets.includes(budget) ? budget : 'moderate'

  const noteLines = [
    transport ? `移動手段（往復）: ${transport}` : null,
    styles?.length ? `旅のスタイル: ${(styles as string[]).join('・')}` : null,
    freeNote?.trim() ? freeNote.trim() : null,
  ].filter(Boolean).join('、')

  try {
    const rec = await runTravelAgent({
      destination: destination.trim(),
      durationDays: days,
      startDate: startDate || undefined,
      members: members ?? 2,
      budget: resolvedBudget,
      note: noteLines || undefined,
      userId: (session.user as any).id,
    })
    return NextResponse.json({ ...rec.itinerary, spots: rec.spots, restaurants: rec.restaurants })
  } catch (e: any) {
    console.error('[suggest] error:', e)
    return NextResponse.json({ error: e.message || 'generation failed' }, { status: 500 })
  }
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { savePreference } from '@/lib/agents/travel/memory/preferences'
import type { BudgetLevel } from '@/lib/agents/travel/types'

// Record a travel preference signal (e.g. the user added a recommended
// spot to their trip). Feeds future ranking via prefMatch.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  if (!userId) return NextResponse.json({ error: 'no user id' }, { status: 400 })

  const { destination, tags, budget } = await req.json().catch(() => ({}))
  if (!destination?.trim()) return NextResponse.json({ error: 'destination required' }, { status: 400 })

  const validBudgets: BudgetLevel[] = ['budget', 'moderate', 'luxury']
  const resolvedBudget: BudgetLevel = validBudgets.includes(budget) ? budget : 'moderate'
  const cleanTags: string[] = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === 'string').slice(0, 20)
    : []

  await savePreference({
    userId,
    destination: destination.trim(),
    tags: cleanTags,
    budget: resolvedBudget,
  })
  return NextResponse.json({ ok: true })
}

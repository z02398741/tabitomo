import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { getRankedCandidates } from '@/lib/agents/travel/agent'
import type { BudgetLevel } from '@/lib/agents/travel/types'

// Spot lookup hits Nominatim + Overpass (with a Japan-biased retry);
// give the function headroom but still bound it.
export const maxDuration = 45

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const destination = searchParams.get('destination')?.trim()
  const daysParam = searchParams.get('days')
  const budget = (searchParams.get('budget') ?? 'moderate') as BudgetLevel
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

  if (!destination) return NextResponse.json({ error: 'destination required' }, { status: 400 })

  const durationDays = daysParam ? parseInt(daysParam, 10) : 3
  if (isNaN(durationDays) || durationDays < 1 || durationDays > 14) {
    return NextResponse.json({ error: 'days must be 1-14' }, { status: 400 })
  }

  const validBudgets: BudgetLevel[] = ['budget', 'moderate', 'luxury']
  const resolvedBudget: BudgetLevel = validBudgets.includes(budget) ? budget : 'moderate'

  try {
    const { spots, restaurants } = await getRankedCandidates({
      destination,
      durationDays,
      budget: resolvedBudget,
      members: 2,
      userId: (session.user as any).id,
      lat: latParam ? parseFloat(latParam) : undefined,
      lng: lngParam ? parseFloat(lngParam) : undefined,
    })
    return NextResponse.json({ spots, restaurants })
  } catch (e: any) {
    console.error('[travel/recommend] error:', e)
    return NextResponse.json({ error: e.message || 'failed' }, { status: 500 })
  }
}

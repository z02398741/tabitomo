import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { addEvent } from '@/lib/trips'
import { isTripMember, tripIdFromDay } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const userId = (session.user as { id?: string }).id ?? ''

  if (!body.day_id) return NextResponse.json({ error: 'day_id required' }, { status: 400 })
  const tripId = await tripIdFromDay(body.day_id)
  if (!tripId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const event = await addEvent(body)
  return NextResponse.json(event)
}

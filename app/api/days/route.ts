import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { addDay } from '@/lib/trips'
import { isTripMember } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const userId = (session.user as { id?: string }).id ?? ''

  if (!body.trip_id) return NextResponse.json({ error: 'trip_id required' }, { status: 400 })
  if (!(await isTripMember(body.trip_id, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const day = await addDay(body)
  return NextResponse.json(day)
}

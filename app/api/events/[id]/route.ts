import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { updateEvent, deleteEvent } from '@/lib/trips'
import { isTripMember, tripIdFromEvent } from '@/lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id ?? ''

  const tripId = await tripIdFromEvent(id)
  if (!tripId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const event = await updateEvent(id, body)
  return NextResponse.json(event)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id ?? ''

  const tripId = await tripIdFromEvent(id)
  if (!tripId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteEvent(id)
  return NextResponse.json({ ok: true })
}

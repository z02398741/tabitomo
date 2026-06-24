import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { deleteDay, updateDay } from '@/lib/trips'
import { isTripMember, tripIdFromDay } from '@/lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id ?? ''

  const tripId = await tripIdFromDay(id)
  if (!tripId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if ('label' in body) patch.label = body.label
  if ('date' in body) patch.date = body.date || null
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const day = await updateDay(id, patch as any)
  return NextResponse.json(day)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id ?? ''

  const tripId = await tripIdFromDay(id)
  if (!tripId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteDay(id)
  return NextResponse.json({ ok: true })
}

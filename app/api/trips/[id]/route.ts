import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { deleteTrip, getTrip } from '@/lib/trips'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const trip = await getTrip(id)
  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const userId = (session.user as any).id
  if (trip.created_by !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteTrip(id)
  return new NextResponse(null, { status: 204 })
}

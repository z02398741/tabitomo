import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { getTrips, createTrip } from '@/lib/trips'

export async function GET() {
  const session = await getServerSession(authOptions)
  console.log('userId:', (session?.user as any)?.id)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const trips = await getTrips(userId)
  return NextResponse.json(trips)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = (session.user as any).id
  const body = await req.json()
  const trip = await createTrip(body, userId)
  return NextResponse.json(trip)
}

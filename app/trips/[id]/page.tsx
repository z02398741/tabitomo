import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import { getTrip } from '@/lib/trips'
import TripClient from '@/components/TripClient'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id } = await params

  try {
    const trip = await getTrip(id)
    if (!trip) redirect('/')
    return <TripClient trip={trip} session={session} />
  } catch (e) {
    redirect('/')
  }
}

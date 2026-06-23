import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import { getTrip } from '@/lib/trips'
import TripClient from '@/components/TripClient'
import TechBackground from '@/app/components/TechBackground'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { id } = await params

  try {
    const trip = await getTrip(id)
    if (!trip) redirect('/')
    return (
      <>
        <TechBackground />
        <div className="relative z-10">
          <TripClient trip={trip} session={session} />
        </div>
      </>
    )
  } catch (e) {
    redirect('/')
  }
}

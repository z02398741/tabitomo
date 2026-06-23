import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import HomeClient from '@/components/HomeClient'
import TechBackground from '@/app/components/TechBackground'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return (
    <>
      <TechBackground />
      <div className="relative z-10">
        <HomeClient session={session} />
      </div>
    </>
  )
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import SuggestClient from '@/components/SuggestClient'
import TechBackground from '@/app/components/TechBackground'

export default async function SuggestPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return (
    <>
      <TechBackground />
      <div className="relative z-10">
        <SuggestClient session={session} />
      </div>
    </>
  )
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import ImportClient from '@/components/ImportClient'
import TechBackground from '@/app/components/TechBackground'

export default async function ImportPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return (
    <>
      <TechBackground />
      <div className="relative z-10">
        <ImportClient session={session} />
      </div>
    </>
  )
}

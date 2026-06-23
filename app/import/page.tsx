import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import ImportClient from '@/components/ImportClient'

export default async function ImportPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return <ImportClient session={session} />
}

import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { reorderDays } from '@/lib/trips'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json()
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids required' }, { status: 400 })

  await reorderDays(ids)
  return NextResponse.json({ ok: true })
}

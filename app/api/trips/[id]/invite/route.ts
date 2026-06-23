import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: tripId } = await params
  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const supabase = getAdmin()
  await supabase.from('invite_tokens').insert({
    token,
    trip_id: tripId,
    expires_at: expiresAt.toISOString(),
  })

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
  return NextResponse.json({ url })
}

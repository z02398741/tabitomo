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
  const supabase = getAdmin()

  // 既存の有効なトークンがあれば再利用
  const { data: existing } = await supabase
    .from('invite_tokens')
    .select('token')
    .eq('trip_id', tripId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${existing.token}`
    return NextResponse.json({ url })
  }

  // 有効なトークンがなければ新規作成
  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await supabase.from('invite_tokens').insert({
    token,
    trip_id: tripId,
    expires_at: expiresAt.toISOString(),
  })

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
  return NextResponse.json({ url })
}

// DELETE /api/trips/[id]/invite — revoke active invite tokens
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  await getAdmin()
    .from('invite_tokens')
    .update({ used: true })
    .eq('trip_id', tripId)
    .eq('used', false)

  return new NextResponse(null, { status: 204 })
}

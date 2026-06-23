import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = getAdmin()

  const { data: invite } = await supabase
    .from('invite_tokens')
    .select('*, trips(id, title)')
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0d0f14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#edf0f7', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>招待リンクが無効です</div>
          <div style={{ fontSize: '13px', color: '#8b93b0' }}>期限切れまたは使用済みです</div>
          <a href="/" style={{ color: '#6c8ef5', fontSize: '14px', marginTop: '16px', display: 'block' }}>
            トップに戻る
          </a>
        </div>
      </div>
    )
  }

  const session = await getServerSession(authOptions)

  if (!session) {
    redirect(`/login?next=/invite/${token}`)
  }

  const userId = (session.user as any).id

  const { data: existing } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', invite.trip_id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    await supabase.from('trip_members').insert({
      trip_id: invite.trip_id,
      user_id: userId,
      role: 'member',
    })

    await supabase
      .from('invite_tokens')
      .update({ used: true })
      .eq('token', token)
  }

  redirect(`/trips/${invite.trip_id}`)
}

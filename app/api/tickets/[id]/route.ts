import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as any).id
  const supabase = getAdmin()

  // Resolve trip_id via nested join for authorization
  const { data: ticket } = await supabase
    .from('tickets')
    .select('storage_path, events(trip_days(trip_id))')
    .eq('id', id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tripId = (ticket as any).events?.trip_days?.trip_id
  if (tripId) {
    const { data: member } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if ((ticket as any).storage_path) {
    await supabase.storage.from('tickets').remove([(ticket as any).storage_path])
  }

  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

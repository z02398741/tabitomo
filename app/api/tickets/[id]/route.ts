import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isTripMember } from '@/lib/auth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id ?? ''
  const supabase = getAdmin()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, storage_path, events(trip_days(trip_id))')
    .eq('id', id)
    .single()

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tripId = (ticket as any).events?.trip_days?.trip_id
  if (!tripId || !(await isTripMember(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (ticket.storage_path) {
    await supabase.storage.from('tickets').remove([ticket.storage_path])
  }

  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

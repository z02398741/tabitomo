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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: tripId } = await params
  const { alert_min, scope } = await req.json()

  const supabase = getAdmin()

  // trip_days の id 一覧を取得
  const { data: days } = await supabase
    .from('trip_days')
    .select('id')
    .eq('trip_id', tripId)

  if (!days?.length) return NextResponse.json({ updated: 0 })

  const dayIds = days.map(d => d.id)

  let query = supabase
    .from('events')
    .update({ alert_min })
    .in('day_id', dayIds)

  // scope: 'unset' の場合は通知なしのイベントのみ対象
  if (scope === 'unset') {
    query = query.eq('alert_min', 0)
  }

  const { data, error } = await query.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: data?.length ?? 0 })
}

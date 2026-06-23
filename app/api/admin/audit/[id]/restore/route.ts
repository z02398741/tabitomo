import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function resolveTripId(
  supabase: SupabaseClient,
  log: { trip_id: string | null; table_name: string; old_data: Record<string, unknown> }
): Promise<string | null> {
  if (log.trip_id) return log.trip_id
  // events may have null trip_id when cascade-deleted with parent day
  if (log.table_name === 'events' && log.old_data?.day_id) {
    const { data } = await supabase
      .from('audit_logs')
      .select('trip_id')
      .eq('table_name', 'trip_days')
      .eq('row_id', log.old_data.day_id as string)
      .not('trip_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    return (data?.trip_id as string) ?? null
  }
  return null
}

// POST /api/admin/audit/[id]/restore  — restore a deleted/updated row (owner only)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string }).id
  const supabase = getAdmin()

  const { data: log, error: logErr } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('id', Number(id))
    .single()

  if (logErr || !log) return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  if (!['DELETE', 'UPDATE'].includes(log.operation as string)) {
    return NextResponse.json({ error: 'Only DELETE/UPDATE can be restored' }, { status: 400 })
  }

  const tripId = await resolveTripId(supabase, log as { trip_id: string | null; table_name: string; old_data: Record<string, unknown> })
  if (!tripId) return NextResponse.json({ error: 'Cannot determine trip' }, { status: 403 })

  const { data: membership } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single()

  if (membership?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const old = log.old_data as Record<string, unknown>
  let restoreErr: string | null = null

  switch (log.table_name as string) {
    case 'events': {
      if (log.operation === 'DELETE') {
        const { error } = await supabase.from('events').insert(old)
        restoreErr = error?.message ?? null
      } else {
        const { error } = await supabase.from('events').update(old).eq('id', old.id)
        restoreErr = error?.message ?? null
      }
      break
    }

    case 'trip_days': {
      if (log.operation === 'DELETE') {
        const { error } = await supabase.from('trip_days').insert(old)
        restoreErr = error?.message ?? null
        if (!restoreErr) {
          // Restore events deleted within 2 s of the day deletion (cascade)
          const t = new Date(log.created_at as string).getTime()
          const { data: evLogs } = await supabase
            .from('audit_logs')
            .select('old_data')
            .eq('table_name', 'events')
            .eq('operation', 'DELETE')
            .gte('created_at', new Date(t - 2000).toISOString())
            .lte('created_at', new Date(t + 2000).toISOString())
          const evts = (evLogs ?? [])
            .map((e: { old_data: Record<string, unknown> }) => e.old_data)
            .filter((e) => e?.day_id === old.id)
          if (evts.length) await supabase.from('events').insert(evts)
        }
      } else {
        const { error } = await supabase.from('trip_days').update(old).eq('id', old.id)
        restoreErr = error?.message ?? null
      }
      break
    }

    case 'trip_members': {
      if (log.operation === 'DELETE') {
        const { error } = await supabase.from('trip_members').insert({
          trip_id: old.trip_id,
          user_id: old.user_id,
          role: old.role,
        })
        restoreErr = error?.message ?? null
      }
      break
    }

    case 'trips': {
      if (log.operation === 'DELETE') {
        const { error } = await supabase.from('trips').insert(old)
        restoreErr = error?.message ?? null
        if (!restoreErr) {
          const t = new Date(log.created_at as string).getTime()
          const win = 3000

          const { data: memLogs } = await supabase
            .from('audit_logs').select('old_data').eq('table_name', 'trip_members').eq('operation', 'DELETE')
            .gte('created_at', new Date(t - win).toISOString()).lte('created_at', new Date(t + win).toISOString())
          const mems = (memLogs ?? []).map((m: { old_data: Record<string, unknown> }) => m.old_data).filter((m) => m?.trip_id === old.id)
          if (mems.length) await supabase.from('trip_members').insert(mems.map((m) => ({ trip_id: m.trip_id, user_id: m.user_id, role: m.role })))

          const { data: dayLogs } = await supabase
            .from('audit_logs').select('old_data').eq('table_name', 'trip_days').eq('operation', 'DELETE')
            .gte('created_at', new Date(t - win).toISOString()).lte('created_at', new Date(t + win).toISOString())
          const days = (dayLogs ?? []).map((d: { old_data: Record<string, unknown> }) => d.old_data).filter((d) => d?.trip_id === old.id)
          if (days.length) {
            await supabase.from('trip_days').insert(days)
            const dayIds = days.map((d) => d.id)
            const { data: evLogs } = await supabase
              .from('audit_logs').select('old_data').eq('table_name', 'events').eq('operation', 'DELETE')
              .gte('created_at', new Date(t - win).toISOString()).lte('created_at', new Date(t + win).toISOString())
            const evts = (evLogs ?? []).map((e: { old_data: Record<string, unknown> }) => e.old_data).filter((e) => dayIds.includes(e?.day_id))
            if (evts.length) await supabase.from('events').insert(evts)
          }
        }
      } else {
        const { error } = await supabase.from('trips').update(old).eq('id', old.id)
        restoreErr = error?.message ?? null
      }
      break
    }

    case 'invite_tokens': {
      if (log.operation === 'UPDATE') {
        // Re-activate revoked token
        const { error } = await supabase.from('invite_tokens').update({ used: false }).eq('token', old.token)
        restoreErr = error?.message ?? null
      }
      break
    }

    default:
      return NextResponse.json({ error: `Unsupported: ${log.table_name}` }, { status: 400 })
  }

  if (restoreErr) return NextResponse.json({ error: restoreErr }, { status: 500 })

  await supabase.from('audit_logs').insert({
    table_name: log.table_name,
    operation: 'RESTORE',
    row_id: log.row_id,
    trip_id: tripId,
    new_data: { restored_from_log_id: Number(id), by_user: userId },
  })

  return NextResponse.json({ ok: true })
}

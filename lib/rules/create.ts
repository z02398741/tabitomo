import { createClient } from '@supabase/supabase-js'
import type { ParsedAction } from '@/types/action'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function executeCreate(action: ParsedAction): Promise<void> {
  if (!action.dayId) throw new Error('executeCreate: missing dayId')
  if (!action.title) throw new Error('executeCreate: missing title')

  const supabase = getAdmin()
  const { error } = await supabase.from('events').insert({
    day_id: action.dayId,
    title: action.title,
    time: action.time ?? '12:00',
    type: 'activity',
    note: null,
    alert_min: 0,
  })

  if (error) throw error
}

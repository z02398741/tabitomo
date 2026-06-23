import { createClient } from '@supabase/supabase-js'
import type { ParsedAction } from '@/types/action'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function executeUpdate(action: ParsedAction): Promise<void> {
  if (!action.eventId) throw new Error('executeUpdate: missing eventId')

  let newTime = action.time

  if (action.delayMinutes && action.oldTime) {
    const [h, m] = action.oldTime.split(':').map(Number)
    const total = h * 60 + m + action.delayMinutes
    newTime = `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
  }

  if (!newTime) throw new Error('executeUpdate: cannot determine new time')

  const supabase = getAdmin()
  const { error } = await supabase
    .from('events')
    .update({ time: newTime })
    .eq('id', action.eventId)

  if (error) throw error
}

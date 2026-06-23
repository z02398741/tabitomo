import { createClient } from '@supabase/supabase-js'
import type { ParsedAction } from '@/types/action'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function executeDelete(action: ParsedAction): Promise<void> {
  if (!action.eventId) throw new Error('executeDelete: missing eventId')

  const supabase = getAdmin()
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', action.eventId)

  if (error) throw error
}

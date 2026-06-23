import { createClient } from '@supabase/supabase-js'
import type { ParsedAction, PendingActionRecord } from '@/types/action'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function savePendingAction(
  groupId: string,
  userId: string,
  tripId: string,
  action: ParsedAction
): Promise<void> {
  const supabase = getAdmin()

  // Clear existing pending for this user in this group
  await supabase
    .from('pending_actions')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await supabase.from('pending_actions').insert({
    group_id: groupId,
    user_id: userId,
    trip_id: tripId,
    action_json: action,
    expires_at: expiresAt,
  })

  if (error) throw error
}

export async function getPendingAction(
  groupId: string,
  userId: string
): Promise<PendingActionRecord | null> {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

export async function clearPendingAction(groupId: string, userId: string): Promise<void> {
  const supabase = getAdmin()
  await supabase
    .from('pending_actions')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
}

export type ActionType = 'update' | 'create' | 'delete' | 'move'

export type ParsedAction = {
  action: ActionType
  // for update/delete/move
  eventId?: string
  eventTitle?: string
  oldTime?: string       // original time — for display in confirmation
  // for update
  time?: string          // new time HH:MM
  delayMinutes?: number  // for "延後X分"
  // for create
  title?: string
  dayId?: string         // target day
  dayLabel?: string      // human-readable day label shown in confirmation
  // for move
  targetDayLabel?: string
  confidence: number
  raw: string            // original user text
}

export type PendingActionRecord = {
  id: string
  group_id: string
  user_id: string
  trip_id: string
  action_json: ParsedAction
  expires_at: string
  created_at: string
}

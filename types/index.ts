export type TripDay = {
  id: string
  trip_id: string
  date: string | null
  label: string
  position: number
}

export type Event = {
  id: string
  day_id: string
  time: string
  title: string
  type: 'transport' | 'gather' | 'activity' | 'meal' | 'stay' | 'free'
  note: string | null
  location: string | null
  cost: number | null
  alert_min: number
  notified_at: string | null
  tickets?: Ticket[]
}

export type Ticket = {
  id: string
  event_id: string
  name: string
  storage_path: string | null
}

export type Trip = {
  id: string
  title: string
  members: number | null
  budget: string | null
  transport: string | null
  destination: string | null
  line_group_id: string | null
  created_by: string
  created_at: string
  days?: (TripDay & { events?: Event[] })[]
}

export type TripMember = {
  trip_id: string
  user_id: string
  role: 'owner' | 'member'
}

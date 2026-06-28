export type BudgetLevel = 'budget' | 'moderate' | 'luxury'

export interface LatLng {
  lat: number
  lng: number
}

export interface PlaceCandidate {
  id: string
  name: string
  category: string
  latLng: LatLng
  tags: string[]
  rating?: number
  distanceKm: number
}

export interface RankedCandidate extends PlaceCandidate {
  score: number
}

export interface TravelPreference {
  userId: string
  destination: string
  tags: string[]
  budget: BudgetLevel
}

export interface TravelAgentInput {
  destination: string
  durationDays: number
  startDate?: string
  members: number
  budget: BudgetLevel
  note?: string
  origin?: string        // departure place (round-trip start/end)
  transport?: string     // e.g. 車/ドライブ・電車・飛行機
  userId?: string
  groupId?: string
  lat?: number
  lng?: number
}

export interface TravelRecommendation {
  itinerary: any
  spots: RankedCandidate[]
  restaurants: RankedCandidate[]
}

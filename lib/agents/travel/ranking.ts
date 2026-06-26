import type { PlaceCandidate, RankedCandidate, TravelAgentInput, TravelPreference } from './types'

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

function budgetMatch(tags: string[], budget: string): number {
  const key = `budget=${budget}`
  return tags.some(t => t === key) ? 1 : 0.5
}

function prefMatch(tags: string[], prefs: TravelPreference[]): number {
  if (prefs.length === 0) return 0.5
  const prefTags = prefs.flatMap(p => p.tags)
  if (prefTags.length === 0) return 0.5
  const matched = prefTags.filter(pt => tags.includes(pt)).length
  return matched / prefTags.length
}

export function rank(
  candidates: PlaceCandidate[],
  input: TravelAgentInput,
  prefs: TravelPreference[],
  topN = 10,
): RankedCandidate[] {
  return candidates
    .map(c => {
      const normalizedRating = (c.rating ?? 2.5) / 5
      const distanceScore = 1 - clamp(c.distanceKm / 15, 0, 1)
      const score =
        normalizedRating * 0.4 +
        distanceScore * 0.2 +
        budgetMatch(c.tags, input.budget) * 0.2 +
        prefMatch(c.tags, prefs) * 0.2
      return { ...c, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

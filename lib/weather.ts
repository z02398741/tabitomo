// Weather forecast via Open-Meteo (free, no API key required).
// Geocoding: https://geocoding-api.open-meteo.com
// Forecast:  https://api.open-meteo.com  (up to 16 days ahead)

export type DayWeather = {
  date: string   // YYYY-MM-DD
  code: number
  emoji: string
  label: string
  tmax: number
  tmin: number
  pop: number    // max precipitation probability (%)
}

export type WeatherResult = {
  location: { name: string; lat: number; lon: number } | null
  days: Record<string, DayWeather>  // keyed by YYYY-MM-DD
}

// WMO weather interpretation codes → emoji + 日本語ラベル
const WMO: Record<number, { emoji: string; label: string }> = {
  0:  { emoji: '☀️', label: '快晴' },
  1:  { emoji: '🌤', label: '晴れ' },
  2:  { emoji: '⛅', label: '晴れ時々曇り' },
  3:  { emoji: '☁️', label: '曇り' },
  45: { emoji: '🌫', label: '霧' },
  48: { emoji: '🌫', label: '霧氷' },
  51: { emoji: '🌦', label: '霧雨（弱）' },
  53: { emoji: '🌦', label: '霧雨' },
  55: { emoji: '🌦', label: '霧雨（強）' },
  56: { emoji: '🌧', label: '着氷性の霧雨' },
  57: { emoji: '🌧', label: '着氷性の霧雨（強）' },
  61: { emoji: '🌧', label: '小雨' },
  63: { emoji: '🌧', label: '雨' },
  65: { emoji: '🌧', label: '大雨' },
  66: { emoji: '🌧', label: '着氷性の雨' },
  67: { emoji: '🌧', label: '着氷性の大雨' },
  71: { emoji: '🌨', label: '小雪' },
  73: { emoji: '❄️', label: '雪' },
  75: { emoji: '❄️', label: '大雪' },
  77: { emoji: '🌨', label: '雪あられ' },
  80: { emoji: '🌦', label: 'にわか雨（弱）' },
  81: { emoji: '🌦', label: 'にわか雨' },
  82: { emoji: '⛈', label: 'にわか雨（激）' },
  85: { emoji: '🌨', label: 'にわか雪' },
  86: { emoji: '🌨', label: 'にわか雪（強）' },
  95: { emoji: '⛈', label: '雷雨' },
  96: { emoji: '⛈', label: '雷雨（雹）' },
  99: { emoji: '⛈', label: '激しい雷雨（雹）' },
}

function describe(code: number): { emoji: string; label: string } {
  return WMO[code] ?? { emoji: '🌡', label: '不明' }
}

export async function geocode(
  query: string
): Promise<{ name: string; lat: number; lon: number } | null> {
  // 1. Open-Meteo geocoding (GeoNames-based)
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(query)}&count=1&language=ja&format=json`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const r = data.results?.[0]
      if (r) return { name: r.name, lat: r.latitude, lon: r.longitude }
    }
  } catch (e) {
    console.error('open-meteo geocode error:', e)
  }

  // 2. Nominatim (OpenStreetMap) fallback — better coverage for Japanese islands/towns
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ja`
    const res = await fetch(url, { headers: { 'User-Agent': 'tabitomo-app/1.0' } })
    if (res.ok) {
      const data = await res.json()
      const r = data[0]
      if (r) return { name: r.display_name.split(',')[0], lat: parseFloat(r.lat), lon: parseFloat(r.lon) }
    }
  } catch (e) {
    console.error('nominatim geocode error:', e)
  }

  return null
}

export async function getWeatherByCoords(lat: number, lon: number): Promise<Record<string, DayWeather>> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=${encodeURIComponent('Asia/Tokyo')}&forecast_days=16`

  try {
    const res = await fetch(url)
    if (!res.ok) return {}
    const data = await res.json()
    const d = data.daily
    const days: Record<string, DayWeather> = {}
    if (d?.time) {
      for (let i = 0; i < d.time.length; i++) {
        const code = d.weather_code[i]
        const { emoji, label } = describe(code)
        days[d.time[i]] = {
          date: d.time[i],
          code,
          emoji,
          label,
          tmax: Math.round(d.temperature_2m_max[i]),
          tmin: Math.round(d.temperature_2m_min[i]),
          pop: d.precipitation_probability_max?.[i] ?? 0,
        }
      }
    }
    return days
  } catch (e) {
    console.error('getWeatherByCoords error:', e)
    return {}
  }
}

export async function getWeather(destination: string): Promise<WeatherResult> {
  const loc = await geocode(destination)
  if (!loc) return { location: null, days: {} }
  const days = await getWeatherByCoords(loc.lat, loc.lon)
  return { location: loc, days }
}

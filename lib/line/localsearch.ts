/**
 * LINE bot「当地のおすすめ」検索。
 * 指定した場所（または現在地）の周辺から、カテゴリ別（カフェ／ラーメン／
 * 観光／温泉 等）のスポットを Overpass(OSM) で検索して Flex carousel で返す。
 * 「営業中」指定時は opening_hours を簡易判定で絞り込む。
 */
import { createClient } from '@supabase/supabase-js'
import { replyMessage, textMsg } from '@/lib/line/reply'
import { runOverpass } from '@/lib/agents/travel/providers/overpass'
import { haversine } from '@/lib/agents/travel/geo'
import { geocode } from '@/lib/weather'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ── Categories ─────────────────────────────────────────────────
interface Category {
  key: string
  emoji: string
  label: string
  test: RegExp
  selectors: string[]   // Overpass element filters (without around clause)
}

const CATEGORIES: Category[] = [
  { key: 'cafe', emoji: '☕', label: 'カフェ', test: /カフェ|喫茶|珈琲|咖啡|コーヒー|coffee/i,
    selectors: ['nwr["amenity"="cafe"]'] },
  { key: 'ramen', emoji: '🍜', label: 'ラーメン', test: /ラーメン|らーめん|拉麵|拉面|つけ麺/i,
    selectors: ['nwr["cuisine"~"ramen|noodle"]'] },
  { key: 'sushi', emoji: '🍣', label: '寿司', test: /寿司|鮨|sushi/i,
    selectors: ['nwr["cuisine"~"sushi"]'] },
  { key: 'izakaya', emoji: '🍶', label: '居酒屋・バー', test: /居酒屋|izakaya|バー|飲み屋|酒場/i,
    selectors: ['nwr["amenity"~"^(bar|pub)$"]', 'nwr["cuisine"~"izakaya"]'] },
  { key: 'restaurant', emoji: '🍽', label: 'レストラン', test: /レストラン|餐廳|餐厅|ご飯|ごはん|食事|グルメ|美食|ランチ|ディナー|定食/i,
    selectors: ['nwr["amenity"="restaurant"]'] },
  { key: 'convenience', emoji: '🏪', label: 'コンビニ', test: /コンビニ|convenience|便利商店|便利店/i,
    selectors: ['nwr["shop"="convenience"]'] },
  { key: 'onsen', emoji: '♨️', label: '温泉・銭湯', test: /温泉|銭湯|スパ|spa|湯/i,
    selectors: ['nwr["amenity"="public_bath"]', 'nwr["leisure"="spa"]', 'nwr["natural"="hot_spring"]'] },
  { key: 'sightseeing', emoji: '📸', label: '観光スポット', test: /観光|景點|景点|名所|見どころ|スポット|觀光/i,
    selectors: ['nwr["tourism"~"attraction|museum|viewpoint|artwork|gallery|theme_park|zoo|aquarium"]', 'nwr["historic"]'] },
  { key: 'park', emoji: '🌳', label: '公園・庭園', test: /公園|庭園|park|garden/i,
    selectors: ['nwr["leisure"~"^(park|garden)$"]'] },
  { key: 'hotel', emoji: '🏨', label: 'ホテル・宿', test: /ホテル|hotel|宿泊施設|旅館|民宿/i,
    selectors: ['nwr["tourism"~"hotel|guest_house|hostel"]'] },
  { key: 'shopping', emoji: '🛍', label: 'ショッピング', test: /ショッピング|買い物|デパート|モール|百貨|商場/i,
    selectors: ['nwr["shop"~"mall|department_store"]'] },
]

const MARKER = /近く|周辺|現在地|この辺|このへん|今いる|ここ|おすすめ|オススメ|探して|さがして|教えて|どこ|ある[?？]|やってる|営業/
const CURRENT_LOC = /近く|周辺|現在地|この辺|このへん|今いる|ここら|ここ周辺/
const OPEN_NOW = /営業|やってる|今開|オープン|開いてる/

interface SearchCandidate {
  id: string
  name: string
  lat: number
  lng: number
  distanceKm: number
  openingHours?: string
}

// ── opening_hours simple "open now" check (best-effort) ────────
// Returns true / false / null(unknown).
function isOpenNow(oh?: string): boolean | null {
  if (!oh) return null
  const s = oh.trim()
  if (/24\s*\/\s*7/.test(s)) return true
  const now = new Date(Date.now() + 9 * 3600 * 1000) // JST
  const dow = now.getUTCDay() // 0=Su .. 6=Sa
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes()
  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const dayApplies = (part: string): boolean => {
    if (!part) return true
    let foundValid = false
    for (const tok of part.split(',')) {
      const t = tok.trim()
      const range = t.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/)
      if (range) {
        const a = DAYS.indexOf(range[1]); const b = DAYS.indexOf(range[2])
        if (a < 0 || b < 0) continue
        foundValid = true
        if (a <= b ? (dow >= a && dow <= b) : (dow >= a || dow <= b)) return true
      } else {
        const i = DAYS.indexOf(t)
        if (i < 0) continue
        foundValid = true
        if (i === dow) return true
      }
    }
    return foundValid ? false : true // unparseable day part → assume applies
  }

  let sawToday = false
  let parsedAny = false
  for (const ruleRaw of s.split(';')) {
    const rule = ruleRaw.trim()
    const times = [...rule.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)]
    if (times.length === 0) continue
    parsedAny = true
    const firstIdx = rule.search(/\d{1,2}:\d{2}/)
    const dayPart = rule.slice(0, firstIdx).replace(/[0-9:.\-]/g, '').trim()
    if (!dayApplies(dayPart)) continue
    sawToday = true
    for (const m of times) {
      const start = (+m[1]) * 60 + (+m[2])
      let end = (+m[3]) * 60 + (+m[4])
      if (end === 0) end = 24 * 60
      if (end < start) { if (cur >= start || cur < end) return true }
      else { if (cur >= start && cur < end) return true }
    }
  }
  if (sawToday) return false
  return parsedAny ? false : null
}

// ── Overpass search ────────────────────────────────────────────
// cuisine filtering only makes sense for the generic restaurant category;
// for specific categories (cafe/ramen/sushi/…) the selector already narrows
// enough and a cuisine tag filter would over-constrain to near-zero.
function effectiveCuisine(cat: Category, cuisine?: string): string | undefined {
  return cuisine && cat.key === 'restaurant' ? cuisine : undefined
}

async function searchPlaces(cat: Category, lat: number, lng: number, radiusM: number, cuisine?: string): Promise<SearchCandidate[]> {
  const useCuisine = effectiveCuisine(cat, cuisine)
  const around = `(around:${radiusM},${lat},${lng})`
  const run = async (cuisineVal?: string): Promise<SearchCandidate[]> => {
    const cuisineFilter = cuisineVal ? `["cuisine"~"${cuisineVal}",i]` : ''
    const body = cat.selectors.map(s => `  ${s}${cuisineFilter}${around};`).join('\n')
    const query = `[out:json][timeout:15];\n(\n${body}\n);\nout body center;`
    return parseElements(await runOverpass(query), lat, lng)
  }
  const out = await run(useCuisine)
  // Fallback: cuisine-tagged matches are sparse in OSM — retry without it.
  if (out.length === 0 && useCuisine) return run(undefined)
  return out
}

function parseElements(raw: any[], lat: number, lng: number): SearchCandidate[] {
  const out: SearchCandidate[] = []
  for (const el of raw) {
    const name: string = el.tags?.['name:ja'] || el.tags?.name || el.tags?.['name:en']
    if (!name) continue
    const elat: number = el.type === 'node' ? el.lat : el.center?.lat
    const elng: number = el.type === 'node' ? el.lon : el.center?.lon
    if (!elat || !elng) continue
    out.push({
      id: String(el.id),
      name,
      lat: elat,
      lng: elng,
      distanceKm: haversine(lat, lng, elat, elng),
      openingHours: el.tags?.opening_hours,
    })
  }
  return out
}

// ── Result carousel ────────────────────────────────────────────
function resultBubble(c: SearchCandidate, emoji: string, openState: boolean | null): object {
  const mapQuery = encodeURIComponent(c.name)
  const statusText = openState === true ? '🟢 営業中'
    : openState === false ? '🔴 営業時間外'
    : c.openingHours ? '🕒 時間要確認' : ''
  const bodyContents: object[] = [
    { type: 'text', text: `${emoji} ${c.name}`, weight: 'bold', size: 'sm', wrap: true, maxLines: 2 },
    { type: 'text', text: `📏 ${c.distanceKm.toFixed(1)}km`, size: 'xxs', color: '#aaaaaa' },
  ]
  if (statusText) bodyContents.push({ type: 'text', text: statusText, size: 'xxs', color: '#8b93b0' })
  return {
    type: 'bubble',
    size: 'micro',
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: bodyContents },
    footer: {
      type: 'box', layout: 'vertical',
      contents: [{
        type: 'button', style: 'link', height: 'sm',
        action: { type: 'uri', label: '🗺 地図', uri: `https://www.google.com/maps/search/?api=1&query=${mapQuery}` },
      }],
    },
  }
}

async function replyResults(
  replyToken: string, cat: Category, placeLabel: string,
  candidates: SearchCandidate[], openNow: boolean,
): Promise<void> {
  let list = candidates
  let withState: Array<{ c: SearchCandidate; open: boolean | null }> = list.map(c => ({ c, open: isOpenNow(c.openingHours) }))

  if (openNow) {
    // keep open or unknown; sort open-first then distance
    withState = withState.filter(x => x.open !== false)
    withState.sort((a, b) => {
      const ao = a.open === true ? 0 : 1
      const bo = b.open === true ? 0 : 1
      return ao - bo || a.c.distanceKm - b.c.distanceKm
    })
  } else {
    withState.sort((a, b) => a.c.distanceKm - b.c.distanceKm)
  }

  const picks = withState.slice(0, 10)
  if (picks.length === 0) {
    await replyMessage(replyToken, [textMsg(`😢 ${placeLabel}周辺で「${cat.label}」が見つかりませんでした。`)])
    return
  }

  const header = `${cat.emoji} ${placeLabel}周辺の${cat.label}${openNow ? '（営業中優先）' : ''} ${picks.length}件`
  const carousel = {
    type: 'flex',
    altText: header,
    contents: { type: 'carousel', contents: picks.map(p => resultBubble(p.c, cat.emoji, p.open)) },
  }
  await replyMessage(replyToken, [textMsg(header), carousel])
}

// ── Session (for current-location round-trip) ──────────────────
interface LocalSearchSession { __type: 'localsearch'; categoryKey: string; openNow: boolean; cuisine?: string }

async function saveSession(groupId: string, userId: string, s: LocalSearchSession) {
  const supabase = getAdmin()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await supabase.from('suggest_sessions').upsert({
    group_id: groupId, user_id: userId, session_json: s, expires_at: expiresAt,
  })
}

async function loadSession(groupId: string, userId: string): Promise<LocalSearchSession | null> {
  const supabase = getAdmin()
  const { data } = await supabase.from('suggest_sessions')
    .select('session_json, expires_at').eq('group_id', groupId).eq('user_id', userId).maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null
  const j = data.session_json as any
  return j?.__type === 'localsearch' ? (j as LocalSearchSession) : null
}

async function clearSession(groupId: string, userId: string) {
  const supabase = getAdmin()
  await supabase.from('suggest_sessions').delete().eq('group_id', groupId).eq('user_id', userId)
}

// ── Parsing ────────────────────────────────────────────────────
function detectCategory(text: string): Category | null {
  return CATEGORIES.find(c => c.test.test(text)) ?? null
}

function extractPlace(text: string, cat: Category): string {
  let t = text
  t = t.replace(cat.test, ' ')
  t = t.replace(MARKER, ' ')
  t = t.replace(/営業中|営業|今|の|で|に|から|を|は|や|、|，|。|！|？|!|\?|周辺|付近|あたり|店|お店/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

// ── Entry points ───────────────────────────────────────────────
// Current-location search prefers precision (50m) and expands up to 1km
// only when nothing is found nearby.
const RADII_CURRENT = [50, 100, 200, 500, 1000]
const RADIUS_NAMED = 4000

async function searchAdaptive(cat: Category, lat: number, lng: number, radii: number[], cuisine?: string): Promise<{ list: SearchCandidate[]; radius: number }> {
  let last: SearchCandidate[] = []
  for (const r of radii) {
    last = await searchPlaces(cat, lat, lng, r, cuisine)
    if (last.length > 0) return { list: last, radius: r }
  }
  return { list: last, radius: radii[radii.length - 1] }
}

/**
 * Handle a "local recommendation" text query. Returns true if consumed.
 * Examples (after @mention):
 *   「広島のカフェおすすめ」「現在地 営業中のカフェ」「尾道で観光スポット教えて」
 */
export async function handleLocalSearch(
  text: string, groupId: string, userId: string, replyToken: string,
): Promise<boolean> {
  const cat = detectCategory(text)
  if (!cat || !MARKER.test(text)) return false

  const openNow = OPEN_NOW.test(text)
  const wantsCurrent = CURRENT_LOC.test(text)
  const place = extractPlace(text, cat)

  // Current location requested (or no place name given) → ask for location
  if (wantsCurrent || !place) {
    await saveSession(groupId, userId, { __type: 'localsearch', categoryKey: cat.key, openNow })
    await replyMessage(replyToken, [{
      type: 'text',
      text: `${cat.emoji} 現在地周辺の${cat.label}${openNow ? '（営業中）' : ''}を探します。\n下のボタンから位置情報を送ってください📍`,
      quickReply: {
        items: [{ type: 'action', action: { type: 'location', label: '📍 位置情報を送る' } }],
      },
    }])
    return true
  }

  // Named place → geocode then search
  const loc = await geocode(place)
  if (!loc) {
    await replyMessage(replyToken, [textMsg(`📍「${place}」の場所が見つかりませんでした。`)])
    return true
  }
  const candidates = await searchPlaces(cat, loc.lat, loc.lon, RADIUS_NAMED)
  await replyResults(replyToken, cat, loc.name, candidates, openNow)
  return true
}

/**
 * Handle a LINE location message — completes a pending current-location search.
 * Silently ignores when there's no pending localsearch session.
 */
export async function handleLocalSearchLocation(
  lat: number, lng: number, groupId: string, userId: string, replyToken: string,
): Promise<void> {
  const session = await loadSession(groupId, userId)
  if (!session) return
  await clearSession(groupId, userId)
  const cat = CATEGORIES.find(c => c.key === session.categoryKey)
  if (!cat) return
  const { list, radius } = await searchAdaptive(cat, lat, lng, RADII_CURRENT, session.cuisine)
  await replyResults(replyToken, cat, `現在地（半径${radius}m）`, list, session.openNow)
}

/**
 * Reusable entry for an already-resolved search intent (e.g. extracted
 * from group conversation by the LLM). Named place → geocode + search;
 * no place → ask for current location (carrying cuisine in the session).
 */
export async function runIntentSearch(
  intent: { categoryKey: string; cuisine?: string | null; place?: string | null; openNow: boolean },
  groupId: string, userId: string, replyToken: string,
): Promise<void> {
  const cat = CATEGORIES.find(c => c.key === intent.categoryKey)
    ?? CATEGORIES.find(c => c.key === 'restaurant')!
  // only keep cuisine when it will actually be applied (restaurant category)
  const cuisine = effectiveCuisine(cat, intent.cuisine || undefined)

  if (intent.place) {
    const loc = await geocode(intent.place)
    if (!loc) {
      await replyMessage(replyToken, [textMsg(`📍「${intent.place}」の場所が見つかりませんでした。`)])
      return
    }
    const list = await searchPlaces(cat, loc.lat, loc.lon, RADIUS_NAMED, cuisine)
    await replyResults(replyToken, cat, loc.name, list, intent.openNow)
    return
  }

  // No place → current location round-trip (carry cuisine in session)
  await saveSession(groupId, userId, { __type: 'localsearch', categoryKey: cat.key, openNow: intent.openNow, cuisine })
  await replyMessage(replyToken, [{
    type: 'text',
    text: `${cat.emoji} 現在地周辺の${cuisine ? cuisine + ' ' : ''}${cat.label}${intent.openNow ? '（営業中）' : ''}を探します。\n下のボタンから位置情報を送ってください📍`,
    quickReply: { items: [{ type: 'action', action: { type: 'location', label: '📍 位置情報を送る' } }] },
  }])
}

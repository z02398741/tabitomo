/**
 * LINE bot の言語切替（日本語 / 繁體中文）。
 * 言語設定は会話キー（groupId or userId）単位で bot_locale テーブルに保存。
 */
import { createClient } from '@supabase/supabase-js'

export type Locale = 'ja' | 'zh'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function getLocale(key: string): Promise<Locale> {
  if (!key) return 'ja'
  const supabase = getAdmin()
  const { data } = await supabase.from('bot_locale').select('locale').eq('key', key).maybeSingle()
  return data?.locale === 'zh' ? 'zh' : 'ja'
}

export async function setLocale(key: string, locale: Locale): Promise<void> {
  const supabase = getAdmin()
  await supabase.from('bot_locale').upsert({ key, locale, updated_at: new Date().toISOString() })
}

// Detect an explicit language-switch command. Returns the target locale or null.
export function detectLocaleCommand(text: string): Locale | null {
  const t = text.trim()
  if (/^(日本語|日語|にほんご|japanese|jp|ja)$/i.test(t)) return 'ja'
  if (/^(中文|繁體中文|繁体中文|繁中|繁體|台灣|chinese|zh|tw)$/i.test(t)) return 'zh'
  if (/言語|語言|language|lang/i.test(t)) return null // handled as "show switcher"
  return null
}

export function isLanguageMenu(text: string): boolean {
  return /^(言語|語言|language|lang)(設定|切替|切換|切换)?[\?？]?$/i.test(text.trim())
}

// ── Dictionary ─────────────────────────────────────────────────
type Entry = { ja: string; zh: string }

const D: Record<string, Entry> = {
  langChanged: { ja: '✅ 言語を日本語に切り替えました。', zh: '✅ 已切換為繁體中文。' },
  langMenu: { ja: '🌐 言語を選んでください', zh: '🌐 請選擇語言' },
  langJa: { ja: '日本語', zh: '日本語' },
  langZh: { ja: '繁體中文', zh: '繁體中文' },

  // local search
  sendLocation: { ja: '📍 位置情報を送る', zh: '📍 傳送位置資訊' },
  openNow: { ja: '🟢 営業中', zh: '🟢 營業中' },
  closedNow: { ja: '🔴 営業時間外', zh: '🔴 非營業時間' },
  checkHours: { ja: '🕒 時間要確認', zh: '🕒 營業時間待確認' },
  currentLocation: { ja: '現在地', zh: '目前位置' },
  notFoundPlace: { ja: '📍「{place}」の場所が見つかりませんでした。', zh: '📍 找不到「{place}」這個地點。' },
  convoNotFound: {
    ja: '🤔 会話からお探しのお店が読み取れませんでした。\n例：「@Tabi 近くのカフェ」「@Tabi 広島の海鮮おすすめ」',
    zh: '🤔 無法從對話判斷你想找什麼店。\n例：「@Tabi 附近的咖啡廳」「@Tabi 廣島的海鮮推薦」',
  },
  resultsHeader: { ja: '{emoji} {place}周辺の{cat}{suffix} {n}件', zh: '{emoji} {place}附近的{cat}{suffix} {n}筆' },
  notFoundHeader: { ja: '😢 {place}周辺で「{cat}」が見つかりませんでした。', zh: '😢 {place}附近找不到「{cat}」。' },
  openSuffixPreferred: { ja: '（営業中優先）', zh: '（營業中優先）' },
  openSuffix: { ja: '（営業中）', zh: '（營業中）' },
  radiusLabel: { ja: '現在地（半径{r}m）', zh: '目前位置（半徑{r}m）' },
  currentSearchPrompt: {
    ja: '{emoji} 現在地周辺の{cuisine}{cat}{suffix}を探します。\n下のボタンから位置情報を送ってください📍',
    zh: '{emoji} 將搜尋目前位置附近的{cuisine}{cat}{suffix}。\n請用下方按鈕傳送位置資訊📍',
  },

  // categories (labels)
  cat_cafe: { ja: 'カフェ', zh: '咖啡廳' },
  cat_ramen: { ja: 'ラーメン', zh: '拉麵' },
  cat_sushi: { ja: '寿司', zh: '壽司' },
  cat_izakaya: { ja: '居酒屋・バー', zh: '居酒屋・酒吧' },
  cat_restaurant: { ja: 'レストラン', zh: '餐廳' },
  cat_convenience: { ja: 'コンビニ', zh: '便利商店' },
  cat_onsen: { ja: '温泉・銭湯', zh: '溫泉・錢湯' },
  cat_sightseeing: { ja: '観光スポット', zh: '觀光景點' },
  cat_park: { ja: '公園・庭園', zh: '公園・庭園' },
  cat_hotel: { ja: 'ホテル・宿', zh: '飯店・住宿' },
  cat_shopping: { ja: 'ショッピング', zh: '購物' },
}

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const entry = D[key]
  let s = entry ? entry[locale] : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
  return s
}

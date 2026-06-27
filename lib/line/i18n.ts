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

  // ── AI suggest flow ──
  savingTrip: { ja: '💾 保存中...', zh: '💾 儲存中…' },
  savedTrip: {
    ja: '✅ 保存しました！\n📍 {title}\n\nApp で確認・修正できます：\n{url}',
    zh: '✅ 已儲存！\n📍 {title}\n\n可在 App 中查看・修改：\n{url}',
  },
  saveFailed: { ja: '⚠️ 保存に失敗しました: {err}', zh: '⚠️ 儲存失敗：{err}' },
  restartDest: {
    ja: '🔄 最初からやり直します。\n\n📍 目的地を教えてください\n例：沖縄・京都・台北・ソウル',
    zh: '🔄 重新開始。\n\n📍 請告訴我目的地\n例：沖繩・京都・台北・首爾',
  },
  cancelled: { ja: '❌ キャンセルしました。', zh: '❌ 已取消。' },
  previewPrompt: {
    ja: '「保存する」「やり直す」「キャンセル」のいずれかで答えてください。',
    zh: '請回覆「儲存」「重做」「取消」其中之一。',
  },
  suggestStart: {
    ja: '✦ AI行程提案を始めます！\n\n📍 目的地を教えてください\n例：沖縄・京都・台北・ソウル',
    zh: '✦ 開始 AI 行程提案！\n\n📍 請告訴我目的地\n例：沖繩・京都・台北・首爾',
  },
  askDest: { ja: '📍 目的地を入力してください（例：沖縄・京都・台北）', zh: '📍 請輸入目的地（例：沖繩・京都・台北）' },
  genFailed: {
    ja: '⚠️ 生成に失敗しました: {err}\nもう一度「提案して」で試してください。',
    zh: '⚠️ 生成失敗：{err}\n請再輸入「提案」重試一次。',
  },
  genHeader: { ja: '✦ 以下の条件で行程を生成します：', zh: '✦ 將以下列條件生成行程：' },
  genDest: { ja: '📍 目的地：{v}', zh: '📍 目的地：{v}' },
  genDays: { ja: '📅 {v}日間', zh: '📅 {v}天' },
  genStart: { ja: '🗓 開始日：{v}', zh: '🗓 出發日：{v}' },
  genMembers: { ja: '👥 {v}名', zh: '👥 {v}人' },
  genBudget: { ja: '💰 {v}', zh: '💰 {v}' },
  genNote: { ja: '📝 {v}', zh: '📝 {v}' },
  genWait: { ja: '少々お待ちください（10〜20秒）...', zh: '請稍候（約 10〜20 秒）…' },

  budget_budget: { ja: '節約', zh: '節省' },
  budget_moderate: { ja: '普通', zh: '普通' },
  budget_luxury: { ja: '豪華', zh: '豪華' },

  // Flex builders
  daysTitle: { ja: '📅 何日間の旅行ですか？', zh: '📅 要玩幾天呢？' },
  daysBtn: { ja: '{n}日間', zh: '{n}天' },
  membersTitle: { ja: '👥 人数は？（スキップ可）', zh: '👥 幾個人？（可略過）' },
  personBtn: { ja: '{n}人', zh: '{n}人' },
  fivePlus: { ja: '5人以上', zh: '5人以上' },
  skip: { ja: 'スキップ', zh: '略過' },
  budgetTitle: { ja: '💰 予算感は？', zh: '💰 預算大概？' },
  budgetBudgetBtn: { ja: '💴 節約', zh: '💴 節省' },
  budgetModerateBtn: { ja: '😊 普通', zh: '😊 普通' },
  budgetLuxuryBtn: { ja: '✨ 豪華', zh: '✨ 豪華' },
  noteTitle: { ja: '📝 その他の希望があれば入力してください', zh: '📝 有其他需求請輸入' },
  noteExample: { ja: '例：子連れOK / 海が見えるレストランを入れてほしい', zh: '例：有帶小孩 / 想安排看得到海的餐廳' },
  noteAlt: { ja: 'その他の希望があれば教えてください（スキップ可）', zh: '有其他需求請告訴我（可略過）' },
  dateTitle: { ja: '📅 旅行の開始日は？', zh: '📅 出發日是？' },
  dateHint: { ja: 'スキップすると未設定のまま保存されます', zh: '略過則不設定出發日' },
  datePick: { ja: '📅 日付を選ぶ', zh: '📅 選擇日期' },
  dateAlt: { ja: '旅行開始日を選んでください', zh: '請選擇出發日' },
  confirmTitle: { ja: '✦ 行程を保存しますか？', zh: '✦ 要儲存這個行程嗎？' },
  confirmAlt: { ja: 'この内容で保存しますか？', zh: '要以此內容儲存嗎？' },
  saveBtn: { ja: '✅ 保存する', zh: '✅ 儲存' },
  redoBtn: { ja: '🔄 やり直す', zh: '🔄 重做' },
  cancelBtn: { ja: '❌ キャンセル', zh: '❌ 取消' },
  previewHeader: { ja: '✦ 行程プレビュー', zh: '✦ 行程預覽' },
  previewMeta: { ja: '📅 {days}日間 · {n}件', zh: '📅 {days}天 · {n}項' },
  recCarouselAlt: { ja: '📍 周辺のおすすめスポット', zh: '📍 周邊推薦景點' },
  mapBtn: { ja: '🗺 地図', zh: '🗺 地圖' },
}

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const entry = D[key]
  let s = entry ? entry[locale] : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
  return s
}

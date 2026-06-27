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

  // ── Webhook read commands ──
  bindNotFound: { ja: '⚠️ 行程が見つかりませんでした。IDを確認してください。', zh: '⚠️ 找不到行程，請確認 ID。' },
  bindOk: { ja: '✅ 「{title}」とこのグループを連携しました！\n予定通知がここに届くようになります。', zh: '✅ 已將「{title}」與本群組連結！\n行程通知會送到這裡。' },
  noTripGroup: { ja: '⚠️ このグループにはまだ行程が登録されていません。\n{url}', zh: '⚠️ 本群組尚未登錄行程。\n{url}' },
  weatherNoDest: { ja: '🌤 目的地が設定されていません。\nApp で目的地を設定すると天気予報を表示できます。\n{url}', zh: '🌤 尚未設定目的地。\n在 App 設定目的地後即可顯示天氣預報。\n{url}' },
  weatherLocNotFound: { ja: '「{dest}」の場所が見つかりませんでした', zh: '找不到「{dest}」這個地點' },
  weatherHeader: { ja: '🌤 {name} の天気予報', zh: '🌤 {name} 的天氣預報' },
  weatherOutOfRange: { ja: '（旅行日は予報範囲外のため直近の予報）', zh: '（旅行日超出預報範圍，顯示近期預報）' },
  weatherNone: { ja: '天気予報を取得できませんでした', zh: '無法取得天氣預報' },
  dayScheduleHeader: { ja: '📅 {label} の予定', zh: '📅 {label} 的行程' },
  noEventsToday: { ja: '今日の予定はありません', zh: '今天沒有行程' },
  noEventsDay: { ja: 'この日の予定はありません', zh: '這天沒有行程' },
  subtotal: { ja: '💴 小計 ¥{n}', zh: '💴 小計 ¥{n}' },
  nextEventHeader: { ja: '⏰ 次の予定', zh: '⏰ 下一個行程' },
  noMoreToday: { ja: '今日はこれ以上の予定がありません', zh: '今天沒有更多行程了' },
  remainHeader: { ja: '📅 {label} の残り ({n}件)', zh: '📅 {label} 剩餘 ({n}項)' },
  membersHeader: { ja: '👥 メンバー ({n}名)', zh: '👥 成員 ({n}人)' },
  summaryDays: { ja: '📅 {n}日間 ({range})', zh: '📅 {n}天 ({range})' },
  dateUnset: { ja: '日程未設定', zh: '日期未設定' },
  costHeader: { ja: '💴 {title} 費用合計', zh: '💴 {title} 費用合計' },
  costNone: { ja: '費用データがまだ登録されていません', zh: '尚未登錄費用資料' },
  costTotal: { ja: '合計 ¥{n}', zh: '合計 ¥{n}' },
  costBudget: { ja: '予算 {budget}', zh: '預算 {budget}' },
  staysHeader: { ja: '🏨 宿泊', zh: '🏨 住宿' },
  staysNone: { ja: '宿泊イベントは登録されていません', zh: '尚未登錄住宿行程' },
  transportHeader: { ja: '🚢 交通', zh: '🚢 交通' },
  transportNone: { ja: '交通イベントは登録されていません', zh: '尚未登錄交通行程' },
  daysNoSchedule: { ja: '日程が設定されていません', zh: '尚未設定日期' },
  tripEnded: { ja: '旅行はすでに終了しています', zh: '旅行已結束' },
  todayLastDay: { ja: '🗓️ 今日が最終日です！\n{label}', zh: '🗓️ 今天是最後一天！\n{label}' },
  daysLeft: { ja: '🗓️ あと {n} 日\n最終日: {label}（{date}）', zh: '🗓️ 還有 {n} 天\n最後一天：{label}（{date}）' },
  dayNumber: { ja: '📍 旅行 {n} 日目\n{label}', zh: '📍 旅行第 {n} 天\n{label}' },
  beforeStart: { ja: '旅行開始まであと {n} 日です', zh: '距離旅行開始還有 {n} 天' },
  outsideTrip: { ja: '今日は旅行の日程外です', zh: '今天不在旅行日期內' },
  timeQueryHeader: { ja: '🔍 「{kw}」', zh: '🔍 「{kw}」' },
  timeQueryNone: { ja: '「{kw}」という予定は見つかりませんでした', zh: '找不到「{kw}」這個行程' },
  eventNotFound: { ja: '⚠️ 予定「{name}」が見つかりませんでした。名前を確認してください。', zh: '⚠️ 找不到行程項目「{name}」，請確認名稱。' },
  createNoDay: { ja: '⚠️ どの日に追加するか判断できませんでした。App で操作してください。', zh: '⚠️ 無法判斷要新增到哪一天，請在 App 中操作。' },
  confirmCancelled: { ja: '取消しました。変更はありません。', zh: '已取消，行程未變更。' },
  execUnsupported: { ja: '⚠️ この操作は自動実行に対応していません。App で修正してください。', zh: '⚠️ 此操作暫不支援自動執行，請在 App 中修改。' },
  execError: { ja: '⚠️ 実行時にエラーが発生しました。App で確認してください。', zh: '⚠️ 執行時發生錯誤，請在 App 中確認。' },

  // ── Edit confirmation / success (messages.ts) ──
  confirmHeader: { ja: '✏️ 行程確認', zh: '✏️ 行程確認' },
  confirmFooter: { ja: '\n「確認」/「取消」で答えてください', zh: '\n請回覆：確認 / 取消' },
  lblAdd: { ja: '➕ 追加', zh: '➕ 新增' },
  lblDelete: { ja: '🗑️ 削除', zh: '🗑️ 取消' },
  lblMove: { ja: '📦 移動', zh: '📦 移動' },
  fieldMembers: { ja: '人数', zh: '人數' },
  fieldBudget: { ja: '予算', zh: '預算' },
  fieldTransport: { ja: '交通手段', zh: '交通手段' },
  okUpdateDelay: { ja: '✅ {title}{day} を {sign}{n}分 変更しました', zh: '✅ 已將 {title}{day} 變更 {sign}{n} 分鐘' },
  okUpdateTime: { ja: '✅ {title}{day} を {time} に変更しました', zh: '✅ 已將 {title}{day} 改到 {time}' },
  okCreate: { ja: '✅ {title}{day} を追加しました', zh: '✅ 已新增 {title}{day}' },
  okDelete: { ja: '✅ {title}{day} を削除しました', zh: '✅ 已取消 {title}{day}' },
  okMove: { ja: '✅ {title} を {target} へ移動しました', zh: '✅ 已將 {title} 移到 {target}' },
  okTripUpdate: { ja: '✅ {field} を {value} に更新しました', zh: '✅ {field} 已更新為 {value}' },
  okDone: { ja: '✅ 完了', zh: '✅ 完成' },
}

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const entry = D[key]
  let s = entry ? entry[locale] : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
  return s
}

const APP_URL = 'https://tabitomo-gilt.vercel.app'

export function helpText(locale: Locale): string {
  if (locale === 'zh') {
    return [
      '🤖 Tabitomo Bot',
      '',
      '✦ AI 行程提案',
      '• @Tabi 沖繩3天提案',
      '• @Tabi 京都2泊3日推薦行程',
      '',
      '📖 查詢',
      '• @Tabi 今天的行程 / 明天 / 7/19 / Day2 / 全部行程',
      '• @Tabi 下一個 / 今天剩下 / 晚餐幾點',
      '• @Tabi 成員 / 概要 / 最後一天 / 住宿 / 交通',
      '• @Tabi 還有幾天 / 第幾天 / 費用 / 天氣',
      '',
      '🍜 當地推薦',
      '• @Tabi 廣島的咖啡廳推薦',
      '• @Tabi 附近的拉麵（傳位置搜尋）',
      '• @Tabi 尾道的觀光景點',
      '（咖啡／拉麵／壽司／居酒屋／餐廳／溫泉／觀光／公園／飯店…）',
      '',
      '💬 從對話推薦',
      '例）「想吃海鮮」→「@Tabi 有推薦嗎？」',
      '',
      '🌐 語言',
      '• @Tabi 語言 / @Tabi 中文 / @Tabi 日本語',
      '',
      '✏️ 修改（需確認）',
      '• @Tabi 咖啡廳改下午三點 / 晚餐改18:30',
      '• @Tabi 新增下午兩點 海灘散步 / 取消晚餐',
      '',
      `✏️ 複雜操作請在 App 中修改：\n${APP_URL}`,
    ].join('\n')
  }
  return [
    '🤖 Tabitomo Bot',
    '',
    '✦ AI行程提案',
    '• @Tabi 沖縄3日提案して',
    '• @Tabi 京都2泊3日おすすめ行程',
    '',
    '📖 照会',
    '• @Tabi 今日の予定 / 明日 / 7/19 / Day2 / 全体',
    '• @Tabi 次の予定 / 今日の残り / 夕食はいつ',
    '• @Tabi メンバー / 概要 / 最終日 / 宿泊 / 交通',
    '• @Tabi 残り何日 / 何日目 / 費用 / 天気',
    '',
    '🍜 当地のおすすめ',
    '• @Tabi 広島のカフェおすすめ',
    '• @Tabi 近くのラーメン（位置情報で検索）',
    '• @Tabi 尾道で観光スポット教えて',
    '（カフェ／ラーメン／寿司／居酒屋／レストラン／温泉／観光／公園／ホテル…）',
    '',
    '💬 会話からおすすめ',
    '例）「海鮮食べたいね」→「@Tabi おすすめは？」',
    '',
    '🌐 言語 / 語言',
    '• @Tabi 言語 / @Tabi 中文 / @Tabi 日本語',
    '',
    '✏️ 変更（確認あり）',
    '• @Tabi 咖啡廳改下午三點 / 晚餐改18:30',
    '• @Tabi 新增下午兩點 海灘散步 / 取消晚餐',
    '',
    `✏️ 複雑な操作はアプリから：\n${APP_URL}`,
  ].join('\n')
}

export function helpNonEditorText(locale: Locale): string {
  if (locale === 'zh') {
    return `🤖 Tabitomo Bot\n\n用法：\n• 今天的行程？\n• 顯示行程\n• 下一個\n• 成員\n• 附近的咖啡廳（當地推薦）\n\n✏️ 修改請從 App：\n${APP_URL}`
  }
  return `🤖 Tabitomo Bot\n\n使い方：\n• 今日の予定は？\n• 行程を見せて\n• 次の予定\n• 成員\n• 近くのカフェ（当地のおすすめ）\n\n✏️ 変更はアプリから：\n${APP_URL}`
}

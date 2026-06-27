/**
 * 会話コンテキストからの自動おすすめ。
 * グループの直近メッセージを記録（rolling buffer）し、Bot がメンションされた
 * ときに最近の会話を Gemini で解析して「探したい店・場所」を抽出、
 * localsearch エンジンで検索して返す。
 *
 * 例: a「等等去吃什麼」b「附近有什麼海鮮料理店嗎?」a「@Tabi」
 *  → { category:'restaurant', cuisine:'seafood', place:null, openNow:false }
 */
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { replyMessage, textMsg } from '@/lib/line/reply'
import { runIntentSearch } from '@/lib/line/localsearch'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const RETAIN_MIN = 45        // keep ~45 min of context
const CONTEXT_LIMIT = 15     // analyze last N messages

// ── Rolling buffer ─────────────────────────────────────────────
export async function logGroupMessage(convoKey: string, userId: string, text: string): Promise<void> {
  if (!convoKey || !text.trim()) return
  const supabase = getAdmin()
  try {
    await supabase.from('chat_messages').insert({
      group_id: convoKey, user_id: userId, text: text.slice(0, 500),
    })
    // opportunistic prune of old rows for this conversation
    const cutoff = new Date(Date.now() - RETAIN_MIN * 60 * 1000).toISOString()
    await supabase.from('chat_messages').delete().eq('group_id', convoKey).lt('created_at', cutoff)
  } catch (e: any) {
    console.warn('[convo] logGroupMessage error:', e?.message)
  }
}

async function getRecentMessages(convoKey: string): Promise<string[]> {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('text, created_at')
    .eq('group_id', convoKey)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_LIMIT)
  if (error || !data) return []
  return data.map(r => r.text as string).reverse() // chronological
}

// ── Gemini intent extraction ───────────────────────────────────
const CATEGORY_KEYS = ['cafe', 'ramen', 'sushi', 'izakaya', 'restaurant', 'convenience', 'onsen', 'sightseeing', 'park', 'hotel', 'shopping']

interface ConvoIntent {
  found: boolean
  category: string
  cuisine: string | null
  place: string | null
  openNow: boolean
}

async function analyzeConversation(messages: string[]): Promise<ConvoIntent> {
  const fallback: ConvoIntent = { found: false, category: 'restaurant', cuisine: null, place: null, openNow: false }
  if (messages.length === 0 || !process.env.GEMINI_API_KEY) return fallback

  const convo = messages.map((m, i) => `${i + 1}. ${m}`).join('\n')
  const prompt = `あなたはグループ会話から「近くの店・場所を探したい意図」を抽出するアシスタントです。
以下は最近のグループ会話です（古い順）。最後にユーザーがBotに尋ねています。

${convo}

会話全体から判断し、JSONのみ返してください（マークダウン・説明なし）:
{
  "found": true または false,
  "category": ${JSON.stringify(CATEGORY_KEYS)} のいずれか,
  "cuisine": null または OSMの英語cuisine値（例 "seafood","ramen","sushi","italian","chinese","yakiniku","cafe"）,
  "place": null または会話に出た具体的な地名（nullは現在地周辺の意味）,
  "openNow": true または false（今営業中の店に限定したい雰囲気か）
}
ルール:
- 海鮮/シーフード→category "restaurant", cuisine "seafood"
- カフェ/コーヒー→"cafe"、ラーメン→"ramen"、寿司→"sushi"、焼肉→category "restaurant" cuisine "yakiniku"
- 店や場所を探す意図が読み取れない場合は found=false
- JSONのみ返す`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const r = await model.generateContent(prompt)
    const raw = r.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const j = JSON.parse(raw)
    return {
      found: !!j.found,
      category: CATEGORY_KEYS.includes(j.category) ? j.category : 'restaurant',
      cuisine: typeof j.cuisine === 'string' && j.cuisine.trim() ? j.cuisine.trim() : null,
      place: typeof j.place === 'string' && j.place.trim() ? j.place.trim() : null,
      openNow: !!j.openNow,
    }
  } catch (e: any) {
    console.warn('[convo] analyze error:', e?.message)
    return fallback
  }
}

// Vague "recommend from context" triggers (mention already stripped)
const VAGUE_TRIGGER = /^$|おすすめ|オススメ|推薦|推荐|お店|どこ(行|食べ|い|か)|何(食べ|を食べ|か食べ|がいい)|決めて|探して|さがして|ご飯どこ/

/**
 * Handle a vague mention that should be answered from recent conversation.
 * Returns true if consumed.
 */
export async function handleConversationRecommend(
  text: string, groupId: string, userId: string, replyToken: string,
): Promise<boolean> {
  const stripped = text.trim()
  if (!VAGUE_TRIGGER.test(stripped)) return false

  const convoKey = groupId || userId
  const messages = await getRecentMessages(convoKey)
  const intent = await analyzeConversation(messages)

  if (!intent.found) {
    await replyMessage(replyToken, [textMsg(
      '🤔 会話からお探しのお店が読み取れませんでした。\n例：「@Tabi 近くのカフェ」「@Tabi 広島の海鮮おすすめ」'
    )])
    return true
  }

  await runIntentSearch(
    { categoryKey: intent.category, cuisine: intent.cuisine, place: intent.place, openNow: intent.openNow },
    groupId, userId, replyToken,
  )
  return true
}

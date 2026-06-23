'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const T = {
  bg:       '#0d0f14',
  card:     '#1a1e2a',
  border:   '#252a3a',
  accent:   '#6c8ef5',
  accentDim:'#6c8ef522',
  accentLt: '#8aaaf8',
  teal:     '#4ecdc4',
  green:    '#66bb6a',
  amber:    '#f5a623',
  textPri:  '#edf0f7',
  textSec:  '#8b93b0',
  textDim:  '#4a5170',
}

const KEYWORD_MAP: Record<string, string[]> = {
  transport:['出発','到着','乗船','高速船','フェリー','バス','電車','搭乗','出航','抵達','出發','回程','搭船'],
  gather:   ['集合','迎え','お迎え','待合','チェックイン','check-in'],
  meal:     ['朝食','昼食','夕食','ランチ','ディナー','餐','食事','早餐','午餐','晚餐','居酒屋','レストラン'],
  activity: ['浮潛','浮潜','ダイビング','シュノーケル','登山','トレッキング','観光','体験','三原山','裏砂漠'],
  stay:     ['チェックイン','check-in','宿泊','ホテル','hotel','旅館','休息','入住'],
  free:     ['自由','散步','散歩','温泉','溫泉','買い物','買物','伴手禮','お土産','休憩'],
}
const ALERT_MIN: Record<string, number> = { transport:60, gather:60, meal:15, activity:30, stay:0, free:0 }

function detectType(text: string): string {
  const lower = text.toLowerCase()
  for (const [type, kws] of Object.entries(KEYWORD_MAP)) {
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) return type
  }
  return 'activity'
}

function normalizeTime(raw: string): string | null {
  raw = raw.replace(/[０-９：]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  const m = raw.match(/(\d{1,2})[:：](\d{2})/)
  if (!m) return null
  return `${String(m[1]).padStart(2,'0')}:${m[2]}`
}

function parseItinerary(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const meta: any = { title:'', members:null, budget:'', transport:'' }

  for (const line of lines) {
    if (!meta.title && /【.+】/.test(line)) meta.title = line.match(/【(.+)】/)![1]
    const mM = line.match(/人數[：:]\s*(\d+)/); if (mM) meta.members = parseInt(mM[1])
    const mB = line.match(/預算[：:]\s*(.+)/);  if (mB) meta.budget = mB[1].trim()
    const mT = line.match(/交通[：:]\s*(.+)/);  if (mT) meta.transport = mT[1].trim()
  }

  const DAY_RE = /(?:■|▶|【)?Day\s*\d+/i
  const TIME_RE = /\d{1,2}[:：]\d{2}/
  const days: any[] = []
  let cur: any = null

  for (const line of lines) {
    if (DAY_RE.test(line)) {
      if (cur) days.push(cur)
      const dm = line.match(/(\d{1,2})[\/\-](\d{1,2})/)
      const date = dm ? `2026-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}` : ''
      cur = { label: line.replace(/^[■▶#\s]+/,'').trim(), date, events:[] }
      continue
    }
    if (!cur) continue
    if (TIME_RE.test(line)) {
      const timeRaw = line.match(TIME_RE)![0]
      const time = normalizeTime(timeRaw)
      if (!time) continue
      const title = line.replace(timeRaw,'').replace(/^[\s\-\.\．。、　]+/,'').trim()
      if (!title) continue
      const type = detectType(title)
      cur.events.push({ time, title, type, note:'', alert_min: ALERT_MIN[type] || 0 })
      continue
    }
    if (/^[※→▶注]/.test(line) && cur.events.length > 0) {
      const last = cur.events[cur.events.length-1]
      const note = line.replace(/^[※→▶注\s]+/,'').trim()
      last.note = last.note ? `${last.note}／${note}` : note
    }
  }
  if (cur && cur.events.length > 0) days.push(cur)

  return { title: meta.title || '旅行行程', members: meta.members,
    budget: meta.budget || null, transport: meta.transport || null, days }
}

const DEMO = `【伊豆大島 3天2夜行程｜7/18–7/20】

👥 人數：4人
💰 預算：約6万/人
🚢 交通：竹芝 ⇄ 大島（高速船）

■ Day1｜7/18（五）
08:15 竹芝出發（高速船）
10:00 抵達大島（元町港）
11:30 午餐（港口附近海鮮）
※13:15 元町港船客待合所 集合
13:15 浮潛體驗
17:30 Check-in / 休息
19:00 晚餐（居酒屋）

■ Day2｜7/19（六）
07:30 早餐
08:45 浮潛主力
12:30 午餐
14:00 自由活動（三原山 or 裏砂漠）
18:30 晚餐
21:00 溫泉

■ Day3｜7/20（日）
08:00 早餐＋散步
10:00 買伴手禮
11:30 午餐（簡單）
16:00 回程（大島→竹芝 高速船）`

type Provider = 'claude' | 'gemini' | 'keyword'

const PROVIDERS: { id: Provider; label: string; icon: string; color: string }[] = [
  { id: 'claude',  label: 'Claude',   icon: '◆', color: '#c084fc' },
  { id: 'gemini',  label: 'Gemini',   icon: '✦', color: '#4ecdc4' },
  { id: 'keyword', label: 'キーワード', icon: '#', color: '#8b93b0' },
]

const Ico = {
  back:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>,
  spark: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
}

const LS_KEY = 'tabitomo_ai_provider'

export default function ImportClient({ session }: { session: any }) {
  const router = useRouter()
  const [text,     setText]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [log,      setLog]      = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider>('claude')

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Provider | null
    if (saved && PROVIDERS.some(p => p.id === saved)) setProvider(saved)
  }, [])

  const switchProvider = (p: Provider) => {
    setProvider(p)
    localStorage.setItem(LS_KEY, p)
  }

  const handle = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setLog(null)
    try {
      let parsed: any
      if (provider === 'keyword') {
        parsed = parseItinerary(text)
        setLog(`解析完了 — ${parsed.days.length}日・${parsed.days.reduce((a:number,d:any)=>a+d.events.length,0)}件`)
      } else {
        setLog('AI解析中...')
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, provider }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'AI解析失敗')
        }
        parsed = await res.json()
        const totalEvents = (parsed.days || []).reduce((a: number, d: any) => a + (d.events?.length || 0), 0)
        setLog(`AI解析完了 — ${(parsed.days || []).length}日・${totalEvents}件`)
      }

      const res = await fetch('/api/trips/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const trip = await res.json()
      router.push(`/trips/${trip.id}`)
    } catch(e: any) {
      setError(e.message)
      setLog(null)
    } finally {
      setLoading(false)
    }
  }

  const inputSt: React.CSSProperties = {
    width:'100%', padding:'14px', borderRadius:'12px',
    border:`1px solid ${T.border}`, background:T.card,
    color:T.textPri, fontSize:'13px', lineHeight:1.7,
    fontFamily:'inherit', resize:'vertical',
    boxSizing:'border-box', outline:'none',
  }

  const activeProv = PROVIDERS.find(p => p.id === provider)!

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.textPri,
      fontFamily:"'Inter','Noto Sans JP',sans-serif" }}>

      <div style={{ padding:'20px 20px 0' }}>
        <button onClick={() => router.push('/')} style={{ display:'flex',
          alignItems:'center', gap:'6px', background:'none', border:'none',
          color:T.textSec, cursor:'pointer', fontSize:'13px', padding:0,
          marginBottom:'20px' }}>
          {Ico.back} 戻る
        </button>
        <div style={{ fontSize:'10px', fontWeight:700, color:T.accent,
          letterSpacing:'.15em', marginBottom:'6px' }}>AI IMPORT</div>
        <h1 style={{ fontSize:'22px', fontWeight:700, color:T.textPri,
          margin:'0 0 4px' }}>行程テキストを貼り付ける</h1>
        <p style={{ fontSize:'13px', color:T.textSec, margin:'0 0 16px' }}>
          どんな形式でも自動解析
        </p>

        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'20px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'11px', color:T.textDim, marginRight:'2px' }}>解析エンジン</span>
          {PROVIDERS.map(p => {
            const active = provider === p.id
            return (
              <button key={p.id} onClick={() => switchProvider(p.id)} style={{
                padding:'5px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
                border: active ? `1.5px solid ${p.color}` : `1px solid ${T.border}`,
                background: active ? `${p.color}22` : 'transparent',
                color: active ? p.color : T.textSec,
                cursor:'pointer', transition:'all .15s',
                display:'flex', alignItems:'center', gap:'5px',
              }}>
                <span style={{ fontSize:'10px' }}>{p.icon}</span>
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding:'0 20px 40px', maxWidth:'600px', margin:'0 auto' }}>
        <textarea value={text} onChange={e=>setText(e.target.value)}
          placeholder="行程テキストをここに貼り付けてください..." rows={12}
          style={inputSt}/>

        {error && (
          <div style={{ marginTop:'8px', padding:'10px 14px', borderRadius:'8px',
            background:'#dc262622', color:'#f87171', fontSize:'13px',
            border:'1px solid #dc262633' }}>{error}</div>
        )}
        {log && (
          <div style={{ marginTop:'8px', padding:'10px 14px', borderRadius:'8px',
            background:'#4caf8f22', color:T.green, fontSize:'12px' }}>✓ {log}</div>
        )}

        <button onClick={() => setText(DEMO)} style={{ marginTop:'8px',
          background:'none', border:'none', color:T.textDim, cursor:'pointer',
          fontSize:'12px', textDecoration:'underline', padding:0 }}>
          サンプルを使う（伊豆大島）
        </button>

        <button onClick={handle} disabled={!text.trim()||loading} style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          width:'100%', marginTop:'14px', padding:'14px', borderRadius:'12px',
          border:'none',
          background: text.trim()&&!loading
            ? activeProv.color
            : T.textDim+'44',
          color:'#fff', cursor:text.trim()&&!loading?'pointer':'default',
          fontSize:'15px', fontWeight:700, transition:'background .2s' }}>
          {loading
            ? <><span style={{ display:'inline-block', width:'16px', height:'16px',
                border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff',
                borderRadius:'50%', animation:'spin 1s linear infinite' }}/> 解析中...</>
            : <>{Ico.spark} {provider === 'keyword' ? '行程に変換' : `${activeProv.label}で変換`}</>
          }
        </button>

        {provider !== 'keyword' && (
          <div style={{ marginTop:'8px', fontSize:'11px', color:T.textDim, textAlign:'center' }}>
            {provider === 'claude' ? 'Claude Opus 4.8（高精度・思考モード）' : 'Gemini 2.0 Flash（高速）'}
            で解析します
          </div>
        )}

        <div style={{ marginTop:'20px', padding:'14px 16px', borderRadius:'10px',
          background:T.card, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:T.textDim,
            marginBottom:'8px', letterSpacing:'.05em' }}>対応フォーマット</div>
          {[
            '時刻＋イベント名（08:15 竹芝出発 等）',
            '日程ブロック（Day1 / ■ / 【】等）',
            '※ や → で始まる備考・注意事項',
            '中文・日本語・混在テキスト',
          ].map(t => (
            <div key={t} style={{ fontSize:'12px', color:'#aaa',
              display:'flex', gap:'6px', marginBottom:'3px' }}>
              <span style={{ color:T.green }}>✓</span> {t}
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

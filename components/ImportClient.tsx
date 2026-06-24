'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import TabitomoLogo from '@/components/logo/TabitomoLogo'

const T = {
  bg:       '#0d0f14',
  card:     '#1a1e2a',
  cardHov:  '#1f2435',
  border:   '#252a3a',
  borderLt: '#2e3448',
  accent:   '#6c8ef5',
  accentDim:'#6c8ef522',
  accentLt: '#8aaaf8',
  teal:     '#4ecdc4',
  green:    '#66bb6a',
  amber:    '#f5a623',
  rose:     '#f06292',
  textPri:  '#edf0f7',
  textSec:  '#8b93b0',
  textDim:  '#4a5170',
}

const EVENT_TYPE_CFG: Record<string, { color: string; bg: string; label: string }> = {
  transport: { color:'#6c8ef5', bg:'#6c8ef518', label:'移動' },
  gather:    { color:'#f5a623', bg:'#f5a62318', label:'集合' },
  meal:      { color:'#f06292', bg:'#f0629218', label:'食事' },
  activity:  { color:'#4ecdc4', bg:'#4ecdc418', label:'アクティビティ' },
  stay:      { color:'#a78bfa', bg:'#a78bfa18', label:'宿泊' },
  free:      { color:'#66bb6a', bg:'#66bb6a18', label:'自由' },
}

const KEYWORD_MAP: Record<string, string[]> = {
  transport:['出発','到着','乗船','高速船','フェリー','バス','電車','搭乗','出航','抵達','出發','回程','搭船','空港','飛行機'],
  gather:   ['集合','迎え','お迎え','待合','チェックイン','check-in'],
  meal:     ['朝食','昼食','夕食','ランチ','ディナー','餐','食事','早餐','午餐','晚餐','居酒屋','レストラン'],
  activity: ['浮潛','浮潜','ダイビング','シュノーケル','登山','トレッキング','観光','体験','三原山','裏砂漠','水族館'],
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

function parseCost(text: string): number | null {
  const m = text.match(/[¥￥]\s*([\d,，]+)|(\d[\d,，]+)\s*(?:円|JPY)/)
  if (!m) return null
  const raw = (m[1] ?? m[2]).replace(/[,，]/g, '')
  const n = parseInt(raw)
  return isNaN(n) ? null : n
}

function parseItinerary(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const meta: any = { title:'', members:null, budget:'', transport:'', destination:'' }

  for (const line of lines) {
    if (!meta.title && /【.+】/.test(line)) meta.title = line.match(/【(.+)】/)![1]
    const mM = line.match(/(?:人數|人数|人員)[：:]\s*(\d+)/); if (mM) meta.members = parseInt(mM[1])
    const mB = line.match(/(?:預算|予算)[：:]\s*(.+)/);       if (mB) meta.budget = mB[1].trim()
    const mT = line.match(/(?:交通)[：:]\s*(.+)/);             if (mT) meta.transport = mT[1].trim()
    const mD = line.match(/(?:目的地|行き先|場所)[：:]\s*(.+)/); if (mD) meta.destination = mD[1].trim()
  }

  if (!meta.destination && meta.title) {
    const dest = meta.title.match(/^([^\s\d｜|・\-–—]+(?:[島市都県省]|大島|沖縄|北海道))/)
    if (dest) meta.destination = dest[1]
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
      const cost = parseCost(line)
      cur.events.push({ time, title, type, note:'', location: null, cost, alert_min: ALERT_MIN[type] || 0 })
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
    budget: meta.budget || null, transport: meta.transport || null,
    destination: meta.destination || null, days }
}

const DEMO = `【沖縄 3泊4日旅行｜8/1–8/4】

👥 人数：3人
💰 予算：約8万/人
✈️ 交通：羽田 ⇄ 那覇（飛行機）
📍 目的地：沖縄

■ Day1｜8/1（金）
10:30 羽田空港 出発（ANA533便）
13:00 那覇空港 到着
14:00 ランチ（国際通り ¥1,500）
15:30 国際通り 買い物・散歩
18:00 チェックイン（ホテル日航那覇）
19:30 夕食（居酒屋うりずん ¥3,000）

■ Day2｜8/2（土）
07:30 朝食（ホテル）
09:00 美ら海水族館（¥2,180）
13:00 昼食（海洋博公園 ¥1,200）
15:00 古宇利島 ドライブ
19:00 夕食（海鮮料理 ¥3,500）

■ Day3｜8/3（日）
08:00 朝食
09:30 シュノーケル体験（万座毛 ¥5,000）
12:30 昼食（¥1,000）
14:00 首里城観光（¥400）
17:00 温泉・自由活動
19:30 夕食（ステーキ ¥5,000）

■ Day4｜8/4（月）
08:00 朝食＋チェックアウト
10:00 お土産買い物
12:00 那覇空港へ出発
14:30 那覇空港 搭乗
16:30 羽田空港 到着`

type Provider = 'gemini' | 'keyword'
type Phase    = 'input'  | 'preview'

const PROVIDERS: { id: Provider; label: string; icon: string; color: string }[] = [
  { id: 'gemini',  label: 'Gemini',   icon: '✦', color: '#4ecdc4' },
  { id: 'keyword', label: 'キーワード', icon: '#', color: '#8b93b0' },
]

const Ico = {
  back:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>,
  spark: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
  out:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  save:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
}

const LS_KEY = 'tabitomo_ai_provider'

// ── Preview: Trip Summary ─────────────────────────────────────
function PreviewScreen({ parsed, onConfirm, onBack, saving }: {
  parsed: any
  onConfirm: () => void
  onBack: () => void
  saving: boolean
}) {
  const totalEvents = (parsed.days || []).reduce((a: number, d: any) => a + (d.events?.length || 0), 0)
  const totalCost   = (parsed.days || []).reduce((a: number, d: any) =>
    a + (d.events || []).reduce((b: number, e: any) => b + (e.cost || 0), 0), 0)

  return (
    <div style={{ padding:'0 20px 60px', maxWidth:'600px', margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:'6px',
          background:'none', border:'none', color:T.textSec, cursor:'pointer',
          fontSize:'13px', padding:0 }}>
          {Ico.back} 修正する
        </button>
      </div>

      <h2 style={{ fontSize:'18px', fontWeight:700, color:T.textPri, margin:'0 0 4px' }}>
        内容を確認してください
      </h2>
      <p style={{ fontSize:'12px', color:T.textSec, margin:'0 0 20px' }}>
        {parsed.days?.length || 0}日 · {totalEvents}件のイベント
        {totalCost > 0 && ` · 合計¥${totalCost.toLocaleString()}`}
      </p>

      {/* Trip meta */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:'14px',
        padding:'16px 18px', marginBottom:'16px' }}>
        <div style={{ fontSize:'16px', fontWeight:700, color:T.textPri, marginBottom:'10px' }}>
          {parsed.title}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
          {[
            ['👥 人数',    parsed.members ? `${parsed.members}名` : '—'],
            ['💰 予算',    parsed.budget || '—'],
            ['🚌 交通',    parsed.transport || '—'],
            ['📍 目的地',  parsed.destination || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize:'10px', color:T.textDim, marginBottom:'2px' }}>{label}</div>
              <div style={{ fontSize:'13px', color: value === '—' ? T.textDim : T.textPri }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Days */}
      {(parsed.days || []).map((day: any, di: number) => {
        const accent = ['#6c8ef5','#4ecdc4','#f5a623','#f06292','#a78bfa'][di % 5]
        return (
          <div key={di} style={{ marginBottom:'12px', background:T.card,
            border:`1px solid ${T.border}`, borderRadius:'14px', overflow:'hidden' }}>
            {/* Day header */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`,
              display:'flex', alignItems:'center', gap:'10px',
              background:`${accent}0d` }}>
              <span style={{ width:'4px', height:'16px', borderRadius:'2px',
                background:accent, flexShrink:0, display:'inline-block' }}/>
              <span style={{ fontSize:'13px', fontWeight:700, color:T.textPri }}>
                {day.label}
              </span>
              {day.date && (
                <span style={{ fontSize:'11px', color:T.textSec }}>{day.date}</span>
              )}
              <span style={{ marginLeft:'auto', fontSize:'11px', color:T.textDim }}>
                {day.events?.length || 0}件
              </span>
            </div>

            {/* Events */}
            <div style={{ padding:'8px 0' }}>
              {(day.events || []).map((ev: any, ei: number) => {
                const cfg = EVENT_TYPE_CFG[ev.type] || EVENT_TYPE_CFG.activity
                return (
                  <div key={ei} style={{ padding:'7px 16px',
                    borderBottom: ei < day.events.length - 1 ? `1px solid ${T.border}44` : 'none',
                    display:'flex', alignItems:'flex-start', gap:'10px' }}>
                    <span style={{ fontSize:'12px', fontWeight:600, color:T.textDim,
                      minWidth:'38px', flexShrink:0, paddingTop:'1px' }}>{ev.time}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                        <span style={{ fontSize:'13px', color:T.textPri }}>{ev.title}</span>
                        <span style={{ fontSize:'9px', fontWeight:700, padding:'1px 6px',
                          borderRadius:'10px', background:cfg.bg, color:cfg.color,
                          border:`1px solid ${cfg.color}44` }}>{cfg.label}</span>
                        {ev.cost != null && (
                          <span style={{ fontSize:'11px', color:T.amber }}>
                            ¥{ev.cost.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {ev.note && (
                        <div style={{ fontSize:'11px', color:T.textDim, marginTop:'2px' }}>
                          {ev.note}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Confirm button */}
      <button onClick={onConfirm} disabled={saving} style={{
        display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
        width:'100%', marginTop:'20px', padding:'14px', borderRadius:'12px',
        border:'none',
        background: saving ? T.textDim+'44' : T.accent,
        color:'#fff', cursor: saving ? 'default' : 'pointer',
        fontSize:'15px', fontWeight:700, transition:'background .2s' }}>
        {saving
          ? <><span style={{ display:'inline-block', width:'16px', height:'16px',
              border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff',
              borderRadius:'50%', animation:'spin 1s linear infinite' }}/> 保存中...</>
          : <>{Ico.save} この内容で保存する</>
        }
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function ImportClient({ session }: { session: any }) {
  const router = useRouter()
  const [text,     setText]     = useState('')
  const [phase,    setPhase]    = useState<Phase>('input')
  const [parsed,   setParsed]   = useState<any>(null)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [log,      setLog]      = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider>('gemini')

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Provider | null
    if (saved && PROVIDERS.some(p => p.id === saved)) setProvider(saved)
    else localStorage.removeItem(LS_KEY)
  }, [])

  const switchProvider = (p: Provider) => {
    setProvider(p)
    localStorage.setItem(LS_KEY, p)
  }

  // Step 1: parse text → show preview
  const handleParse = async () => {
    if (!text.trim()) return
    setLoading(true); setError(null); setLog(null)
    try {
      let result: any
      if (provider === 'keyword') {
        result = parseItinerary(text)
        setLog(`解析完了 — ${result.days.length}日・${result.days.reduce((a:number,d:any)=>a+d.events.length,0)}件`)
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
        result = await res.json()
        const total = (result.days || []).reduce((a: number, d: any) => a + (d.events?.length || 0), 0)
        setLog(`AI解析完了 — ${(result.days || []).length}日・${total}件`)
      }
      setParsed(result)
      setPhase('preview')
    } catch(e: any) {
      setError(e.message)
      setLog(null)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: user confirms → write to DB
  const handleSave = async () => {
    if (!parsed) return
    setSaving(true)
    try {
      const res = await fetch('/api/trips/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const trip = await res.json()
      router.push(`/trips/${trip.id}`)
    } catch(e: any) {
      setError(e.message)
      setPhase('input')
    } finally {
      setSaving(false)
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
    <div style={{ minHeight:'100vh', background:'transparent', color:T.textPri,
      fontFamily:"'Inter','Noto Sans JP',sans-serif" }}>

      {/* Top bar */}
      <div style={{ padding:'20px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <button onClick={() => phase === 'preview' ? setPhase('input') : router.push('/')}
            style={{ display:'flex', alignItems:'center', gap:'6px', background:'none', border:'none',
              color:T.textSec, cursor:'pointer', fontSize:'13px', padding:0 }}>
            {Ico.back} {phase === 'preview' ? '修正する' : '戻る'}
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ display:'flex',
            alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'10px',
            border:`1px solid ${T.border}`, background:'none',
            color:T.textSec, cursor:'pointer', fontSize:'12px' }}>
            {Ico.out} ログアウト
          </button>
        </div>
        {phase === 'input' && (
          <>
            <div style={{ marginBottom:'6px' }}><TabitomoLogo /></div>
            <h1 style={{ fontSize:'22px', fontWeight:700, color:T.textPri, margin:'0 0 4px' }}>
              行程テキストを貼り付ける
            </h1>
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
          </>
        )}
      </div>

      {phase === 'preview' && parsed ? (
        <PreviewScreen
          parsed={parsed}
          onConfirm={handleSave}
          onBack={() => setPhase('input')}
          saving={saving}
        />
      ) : (
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
            サンプルを使う（沖縄4日間）
          </button>

          <button onClick={handleParse} disabled={!text.trim()||loading} style={{
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
              Gemini 2.5 Flash で解析します
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
              '¥・円で金額を自動抽出',
              '中文・日本語・混在テキスト',
            ].map(t => (
              <div key={t} style={{ fontSize:'12px', color:'#aaa',
                display:'flex', gap:'6px', marginBottom:'3px' }}>
                <span style={{ color:T.green }}>✓</span> {t}
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import TabitomoLogo from '@/components/logo/TabitomoLogo'

const T = {
  bg:       '#0d0f14',
  card:     '#1a1e2a',
  border:   '#252a3a',
  accent:   '#6c8ef5',
  accentDim:'#6c8ef522',
  teal:     '#4ecdc4',
  green:    '#66bb6a',
  amber:    '#f5a623',
  textPri:  '#edf0f7',
  textSec:  '#8b93b0',
  textDim:  '#4a5170',
}

const EVENT_CFG: Record<string, { color: string; bg: string; label: string }> = {
  transport: { color:'#6c8ef5', bg:'#6c8ef518', label:'移動' },
  gather:    { color:'#f5a623', bg:'#f5a62318', label:'集合' },
  meal:      { color:'#f06292', bg:'#f0629218', label:'食事' },
  activity:  { color:'#4ecdc4', bg:'#4ecdc418', label:'アクティビティ' },
  stay:      { color:'#a78bfa', bg:'#a78bfa18', label:'宿泊' },
  free:      { color:'#66bb6a', bg:'#66bb6a18', label:'自由' },
}

const STYLES = ['食べ歩き', '自然・アウトドア', '文化・歴史', 'アクティビティ', '温泉', 'ショッピング']
const BUDGETS = [
  { id: 'budget',   label: '節約', desc: '低予算・公共交通' },
  { id: 'moderate', label: '普通', desc: 'バランス重視' },
  { id: 'luxury',   label: '豪華', desc: 'プレミアム体験' },
]
const TRANSPORTS = ['飛行機', '新幹線', '車', 'フェリー']

const Ico = {
  back:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>,
  spark: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
  save:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  out:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

type Phase = 'form' | 'preview'

// ── Chip ─────────────────────────────────────────────────────
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding:'5px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
      border: active ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
      background: active ? `${T.accent}22` : 'transparent',
      color: active ? T.accent : T.textSec,
      cursor:'pointer', transition:'all .15s',
    }}>{label}</button>
  )
}

// ── Preview ───────────────────────────────────────────────────
function PreviewScreen({ parsed, onConfirm, onBack, saving }: {
  parsed: any; onConfirm: () => void; onBack: () => void; saving: boolean
}) {
  const totalEvents = (parsed.days || []).reduce((a: number, d: any) => a + (d.events?.length || 0), 0)
  const totalCost   = (parsed.days || []).reduce((a: number, d: any) =>
    a + (d.events || []).reduce((b: number, e: any) => b + (e.cost || 0), 0), 0)

  return (
    <div style={{ padding:'0 20px 60px', maxWidth:'600px', margin:'0 auto' }}>
      <h2 style={{ fontSize:'18px', fontWeight:700, color:T.textPri, margin:'0 0 4px' }}>
        内容を確認してください
      </h2>
      <p style={{ fontSize:'12px', color:T.textSec, margin:'0 0 20px' }}>
        {parsed.days?.length || 0}日 · {totalEvents}件
        {totalCost > 0 && ` · 概算合計 ¥${totalCost.toLocaleString()}`}
      </p>

      {/* Trip meta */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:'14px',
        padding:'16px 18px', marginBottom:'16px' }}>
        <div style={{ fontSize:'16px', fontWeight:700, color:T.textPri, marginBottom:'10px' }}>
          {parsed.title}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
          {[
            ['👥 人数',   parsed.members ? `${parsed.members}名` : '—'],
            ['💰 予算',   parsed.budget   || '—'],
            ['🚌 交通',   parsed.transport || '—'],
            ['📍 目的地', parsed.destination || '—'],
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
            <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`,
              display:'flex', alignItems:'center', gap:'10px', background:`${accent}0d` }}>
              <span style={{ width:'4px', height:'16px', borderRadius:'2px',
                background:accent, flexShrink:0, display:'inline-block' }}/>
              <span style={{ fontSize:'13px', fontWeight:700, color:T.textPri }}>{day.label}</span>
              {day.date && <span style={{ fontSize:'11px', color:T.textSec }}>{day.date}</span>}
              <span style={{ marginLeft:'auto', fontSize:'11px', color:T.textDim }}>
                {day.events?.length || 0}件
              </span>
            </div>
            <div style={{ padding:'8px 0' }}>
              {(day.events || []).map((ev: any, ei: number) => {
                const cfg = EVENT_CFG[ev.type] ?? EVENT_CFG.activity
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
                        <div style={{ fontSize:'11px', color:T.textDim, marginTop:'2px' }}>{ev.note}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
        <button onClick={onBack} style={{ flex:'0 0 auto', padding:'14px 20px',
          borderRadius:'12px', border:`1px solid ${T.border}`, background:'none',
          color:T.textSec, cursor:'pointer', fontSize:'14px' }}>
          {Ico.back} 修正する
        </button>
        <button onClick={onConfirm} disabled={saving} style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          padding:'14px', borderRadius:'12px', border:'none',
          background: saving ? T.textDim+'44' : T.accent,
          color:'#fff', cursor: saving ? 'default' : 'pointer',
          fontSize:'15px', fontWeight:700 }}>
          {saving
            ? <><span style={{ display:'inline-block', width:'16px', height:'16px',
                border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff',
                borderRadius:'50%', animation:'spin 1s linear infinite' }}/> 保存中...</>
            : <>{Ico.save} この内容で保存する</>}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function SuggestClient({ session }: { session: any }) {
  const router = useRouter()
  const [phase,       setPhase]       = useState<Phase>('form')
  const [parsed,      setParsed]      = useState<any>(null)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // form state
  const [destination, setDestination] = useState('')
  const [days,        setDays]        = useState(3)
  const [startDate,   setStartDate]   = useState('')
  const [members,     setMembers]     = useState<number | ''>('')
  const [budget,      setBudget]      = useState<string>('moderate')
  const [transport,   setTransport]   = useState<string>('')
  const [styles,      setStyles]      = useState<string[]>([])
  const [freeNote,    setFreeNote]    = useState('')

  const toggleStyle = (s: string) =>
    setStyles(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  const inputSt: React.CSSProperties = {
    width:'100%', padding:'10px 12px', borderRadius:'9px',
    border:`1px solid ${T.border}`, background:'#13161e',
    color:T.textPri, fontSize:'13px', fontFamily:'inherit',
    boxSizing:'border-box', outline:'none',
  }

  const labelSt: React.CSSProperties = {
    display:'block', fontSize:'11px', fontWeight:700,
    color:T.textDim, letterSpacing:'.06em', marginBottom:'6px',
  }

  const handleGenerate = async () => {
    if (!destination.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: destination.trim(),
          days,
          startDate: startDate || undefined,
          members: members === '' ? undefined : members,
          budget,
          transport: transport || undefined,
          styles: styles.length ? styles : undefined,
          freeNote: freeNote.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'AI生成失敗')
      }
      const data = await res.json()
      setParsed(data)
      setPhase('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

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
    } catch (e: any) {
      setError(e.message)
      setPhase('form')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'transparent', color:T.textPri,
      fontFamily:"'Inter','Noto Sans JP',sans-serif" }}>

      {/* Top bar */}
      <div style={{ padding:'20px 20px 0' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginBottom:'20px' }}>
          <button
            onClick={() => phase === 'preview' ? setPhase('form') : router.push('/')}
            style={{ display:'flex', alignItems:'center', gap:'6px', background:'none',
              border:'none', color:T.textSec, cursor:'pointer', fontSize:'13px', padding:0 }}>
            {Ico.back} {phase === 'preview' ? '修正する' : '戻る'}
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ display:'flex',
            alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'10px',
            border:`1px solid ${T.border}`, background:'none',
            color:T.textSec, cursor:'pointer', fontSize:'12px' }}>
            {Ico.out} ログアウト
          </button>
        </div>

        {phase === 'form' && (
          <>
            <div style={{ marginBottom:'6px' }}><TabitomoLogo /></div>
            <h1 style={{ fontSize:'22px', fontWeight:700, color:T.textPri, margin:'0 0 4px' }}>
              AI行程提案
            </h1>
            <p style={{ fontSize:'13px', color:T.textSec, margin:'0 0 24px' }}>
              条件を入力するだけで行程を自動生成
            </p>
          </>
        )}
      </div>

      {phase === 'preview' && parsed ? (
        <PreviewScreen
          parsed={parsed}
          onConfirm={handleSave}
          onBack={() => setPhase('form')}
          saving={saving}
        />
      ) : (
        <div style={{ padding:'0 20px 60px', maxWidth:'600px', margin:'0 auto' }}>

          {/* Destination + Days */}
          <div style={{ marginBottom:'16px' }}>
            <label style={labelSt}>📍 目的地 *</label>
            <input value={destination} onChange={e => setDestination(e.target.value)}
              placeholder="例：京都、沖縄、台北、ソウル" style={inputSt}/>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
            <div>
              <label style={labelSt}>📅 旅行日数 *</label>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <button onClick={() => setDays(d => Math.max(1, d - 1))}
                  style={{ width:'32px', height:'32px', borderRadius:'8px',
                    border:`1px solid ${T.border}`, background:'#13161e',
                    color:T.textPri, cursor:'pointer', fontSize:'16px', flexShrink:0 }}>−</button>
                <span style={{ fontSize:'15px', fontWeight:700, color:T.textPri,
                  minWidth:'60px', textAlign:'center' }}>
                  {days}日間
                </span>
                <button onClick={() => setDays(d => Math.min(14, d + 1))}
                  style={{ width:'32px', height:'32px', borderRadius:'8px',
                    border:`1px solid ${T.border}`, background:'#13161e',
                    color:T.textPri, cursor:'pointer', fontSize:'16px', flexShrink:0 }}>＋</button>
              </div>
            </div>
            <div>
              <label style={labelSt}>📆 出発日</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ ...inputSt, colorScheme:'dark' }}/>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
            <div>
              <label style={labelSt}>👥 人数</label>
              <input type="number" min={1} max={50} value={members}
                onChange={e => setMembers(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="3" style={inputSt}/>
            </div>
            <div>
              <label style={labelSt}>🚌 移動手段（往復）</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', paddingTop:'2px' }}>
                {TRANSPORTS.map(t => (
                  <Chip key={t} label={t} active={transport === t}
                    onClick={() => setTransport(p => p === t ? '' : t)}/>
                ))}
              </div>
            </div>
          </div>

          {/* Budget */}
          <div style={{ marginBottom:'16px' }}>
            <label style={labelSt}>💰 予算感</label>
            <div style={{ display:'flex', gap:'8px' }}>
              {BUDGETS.map(b => (
                <button key={b.id} onClick={() => setBudget(b.id)} style={{
                  flex:1, padding:'10px 8px', borderRadius:'10px', textAlign:'center',
                  border: budget === b.id ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                  background: budget === b.id ? `${T.accent}22` : '#13161e',
                  cursor:'pointer', transition:'all .15s',
                }}>
                  <div style={{ fontSize:'13px', fontWeight:700,
                    color: budget === b.id ? T.accent : T.textPri }}>{b.label}</div>
                  <div style={{ fontSize:'10px', color:T.textDim, marginTop:'2px' }}>{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Styles */}
          <div style={{ marginBottom:'16px' }}>
            <label style={labelSt}>🎯 旅のスタイル（複数選択可）</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {STYLES.map(s => (
                <Chip key={s} label={s} active={styles.includes(s)} onClick={() => toggleStyle(s)}/>
              ))}
            </div>
          </div>

          {/* Free note */}
          <div style={{ marginBottom:'20px' }}>
            <label style={labelSt}>📝 その他の希望（任意）</label>
            <textarea value={freeNote} onChange={e => setFreeNote(e.target.value)}
              placeholder="例：子連れなので無理のないペースで。海中公園は必ず入れてほしい。" rows={3}
              style={{ ...inputSt, resize:'vertical', lineHeight:1.6 }}/>
          </div>

          {error && (
            <div style={{ marginBottom:'12px', padding:'10px 14px', borderRadius:'8px',
              background:'#dc262622', color:'#f87171', fontSize:'13px',
              border:'1px solid #dc262633' }}>{error}</div>
          )}

          <button onClick={handleGenerate} disabled={!destination.trim() || loading} style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
            width:'100%', padding:'14px', borderRadius:'12px', border:'none',
            background: destination.trim() && !loading ? T.accent : T.textDim+'44',
            color:'#fff', cursor: destination.trim() && !loading ? 'pointer' : 'default',
            fontSize:'15px', fontWeight:700, transition:'background .2s' }}>
            {loading
              ? <><span style={{ display:'inline-block', width:'16px', height:'16px',
                  border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff',
                  borderRadius:'50%', animation:'spin 1s linear infinite' }}/> AI生成中...</>
              : <>{Ico.spark} Geminiで行程を生成</>}
          </button>
          <div style={{ marginTop:'8px', fontSize:'11px', color:T.textDim, textAlign:'center' }}>
            Gemini 2.5 Flash で生成します · 目安10〜20秒
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

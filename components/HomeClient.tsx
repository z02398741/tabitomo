'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { Trip } from '@/types'
import TabitomoLogo from '@/components/logo/TabitomoLogo'

// ── Design Tokens ──────────────────────────────────────────────
const T = {
  bg:       '#0d0f14',
  card:     '#1a1e2a',
  cardHov:  '#1f2435',
  border:   '#252a3a',
  borderLt: '#2e3448',
  accent:   '#6c8ef5',
  accentLt: '#8aaaf8',
  accentDim:'#6c8ef522',
  teal:     '#4ecdc4',
  textPri:  '#edf0f7',
  textSec:  '#8b93b0',
  textDim:  '#4a5170',
}

const DAY_ACCENTS = ['#6c8ef5','#4ecdc4','#f5a623','#f06292','#a78bfa']

// ── Icons ──────────────────────────────────────────────────────
const Ico = {
  spark: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
  plus:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  out:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

// ── New Trip Modal ─────────────────────────────────────────────
function NewTripModal({ onSave, onClose }: {
  onSave: (trip: Partial<Trip>) => void
  onClose: () => void
}) {
  const [title,     setTitle]     = useState('')
  const [members,   setMembers]   = useState('')
  const [budget,    setBudget]    = useState('')
  const [transport, setTransport] = useState('')

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '9px',
    border: `1px solid ${T.border}`, background: '#13161e',
    color: T.textPri, fontSize: '13px', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
      backdropFilter:'blur(4px)', display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:100, padding:'16px' }}>
      <div style={{ background:T.card, border:`1px solid ${T.border}`,
        borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'440px' }}>

        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'center', marginBottom:'20px' }}>
          <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>
            新しい旅行を作成
          </span>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
        </div>

        <div style={{ marginBottom:'14px' }}>
          <label style={{ display:'block', fontSize:'11px', fontWeight:700,
            color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>
            タイトル *
          </label>
          <input value={title} onChange={e=>setTitle(e.target.value)}
            placeholder="例：伊豆大島 3天2夜" style={inputSt}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:700,
              color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>人数</label>
            <input type="number" value={members}
              onChange={e=>setMembers(e.target.value)}
              placeholder="4" style={inputSt}/>
          </div>
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:700,
              color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>予算</label>
            <input value={budget} onChange={e=>setBudget(e.target.value)}
              placeholder="約6万/人" style={inputSt}/>
          </div>
        </div>

        <div style={{ marginBottom:'20px' }}>
          <label style={{ display:'block', fontSize:'11px', fontWeight:700,
            color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>交通手段</label>
          <input value={transport} onChange={e=>setTransport(e.target.value)}
            placeholder="例：竹芝⇄大島（高速船）" style={inputSt}/>
        </div>

        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 18px',
            borderRadius:'10px', border:`1px solid ${T.border}`,
            background:'none', cursor:'pointer', fontSize:'13px',
            color:T.textSec }}>キャンセル</button>
          <button
            onClick={() => title.trim() && onSave({
              title: title.trim(),
              members: members ? parseInt(members) : null,
              budget: budget.trim() || null,
              transport: transport.trim() || null,
            })}
            disabled={!title.trim()}
            style={{ padding:'9px 20px', borderRadius:'10px', border:'none',
              background: title.trim() ? T.accent : T.textDim+'44',
              color:'#fff', cursor: title.trim() ? 'pointer' : 'default',
              fontSize:'13px', fontWeight:600 }}>
            作成
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Trip Card ──────────────────────────────────────────────────
function TripCard({ trip, onClick, onDelete }: {
  trip: Trip
  onClick: () => void
  onDelete: () => void
}) {
  const [hov, setHov] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(true)
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
    onDelete()
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
  }

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConfirmDelete(false) }}
      style={{ background: hov ? T.cardHov : T.card,
        border: `1px solid ${hov ? T.accent+'55' : T.border}`,
        borderRadius:'16px', padding:'18px 20px', cursor:'pointer',
        marginBottom:'12px', transition:'all .18s', position:'relative',
        boxShadow: hov ? `0 4px 24px rgba(108,142,245,.12)` : 'none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'16px', fontWeight:700, color:T.textPri,
            marginBottom:'4px' }}>{trip.title}</div>
          <div style={{ fontSize:'12px', color:T.textSec }}>
            {trip.members ? `${trip.members}名` : ''}
            {trip.budget ? ` · ${trip.budget}` : ''}
            {trip.transport ? ` · ${trip.transport}` : ''}
          </div>
        </div>
        {!confirmDelete ? (
          <button
            onClick={handleDeleteClick}
            style={{ flexShrink:0, marginLeft:'12px', padding:'4px 8px',
              borderRadius:'8px', border:`1px solid transparent`,
              background:'none', color:T.textDim, cursor:'pointer',
              fontSize:'18px', lineHeight:1, opacity: hov ? 1 : 0,
              transition:'opacity .15s, color .15s, background .15s' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = '#f06292'
              ;(e.currentTarget as HTMLButtonElement).style.background = '#f0629218'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#f0629244'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = T.textDim
              ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
            }}
            title="削除"
          >×</button>
        ) : (
          <div onClick={e => e.stopPropagation()}
            style={{ flexShrink:0, display:'flex', alignItems:'center',
              gap:'6px', marginLeft:'12px' }}>
            <span style={{ fontSize:'11px', color:T.textSec }}>削除しますか？</span>
            <button onClick={handleConfirm}
              style={{ padding:'4px 10px', borderRadius:'7px', border:'none',
                background:'#f06292', color:'#fff', cursor:'pointer',
                fontSize:'11px', fontWeight:600 }}>削除</button>
            <button onClick={handleCancel}
              style={{ padding:'4px 10px', borderRadius:'7px',
                border:`1px solid ${T.border}`, background:'none',
                color:T.textSec, cursor:'pointer', fontSize:'11px' }}>取消</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Home Client ────────────────────────────────────────────────
export default function HomeClient({ session }: { session: any }) {
  const router = useRouter()
  const [trips, setTrips]     = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    fetch('/api/trips')
      .then(r => r.json())
      .then(setTrips)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/trips/${id}`, { method: 'DELETE' })
      setTrips(p => p.filter(t => t.id !== id))
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreate = async (tripData: Partial<Trip>) => {
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tripData),
      })
      const trip = await res.json()
      setTrips(p => [trip, ...p])
      setShowNew(false)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.textPri,
      fontFamily:"'Inter','Noto Sans JP',sans-serif" }}>

      {/* Header */}
      <div style={{ padding:'36px 20px 24px', display:'flex',
        justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ marginBottom:'8px' }}><TabitomoLogo /></div>
          <h1 style={{ fontSize:'28px', fontWeight:700, color:T.textPri,
            margin:'0 0 4px' }}>旅行プランナー</h1>
          <p style={{ fontSize:'13px', color:T.textSec, margin:0 }}>
            {session?.user?.name} さん
          </p>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ display:'flex', alignItems:'center', gap:'6px',
            padding:'8px 14px', borderRadius:'10px',
            border:`1px solid ${T.border}`, background:'none',
            color:T.textSec, cursor:'pointer', fontSize:'12px' }}>
          {Ico.out} ログアウト
        </button>
      </div>

      <div style={{ padding:'0 20px 40px', maxWidth:'600px', margin:'0 auto' }}>

        {/* CTAs */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
          gap:'10px', marginBottom:'28px' }}>
          <div onClick={() => router.push('/import')} style={{
            display:'flex', flexDirection:'column', gap:'10px',
            padding:'18px 16px', borderRadius:'16px',
            background:`linear-gradient(135deg, ${T.accent}22, ${T.teal}11)`,
            border:`1px solid ${T.accent}44`, cursor:'pointer' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'10px',
              background:T.accentDim, display:'flex', alignItems:'center',
              justifyContent:'center', color:T.accent }}>{Ico.spark}</div>
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:T.textPri,
                marginBottom:'2px' }}>AIインポート</div>
              <div style={{ fontSize:'11px', color:T.textSec }}>
                テキストを貼り付けて自動変換
              </div>
            </div>
          </div>

          <div onClick={() => setShowNew(true)} style={{
            display:'flex', flexDirection:'column', gap:'10px',
            padding:'18px 16px', borderRadius:'16px',
            background:`linear-gradient(135deg, ${T.teal}18, ${T.accent}08)`,
            border:`1px solid ${T.teal}44`, cursor:'pointer' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'10px',
              background:T.teal+'22', display:'flex', alignItems:'center',
              justifyContent:'center', color:T.teal }}>{Ico.plus}</div>
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:T.textPri,
                marginBottom:'2px' }}>手動作成</div>
              <div style={{ fontSize:'11px', color:T.textSec }}>
                ゼロから行程を組み立てる
              </div>
            </div>
          </div>
        </div>

        {/* Trip list */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'48px 0', color:T.textDim }}>
            読み込み中...
          </div>
        ) : trips.length === 0 ? (
          <div style={{ background:T.card, border:`1px solid ${T.border}`,
            borderRadius:'16px', padding:'48px 20px', textAlign:'center' }}>
            <div style={{ fontSize:'36px', marginBottom:'12px' }}>✈️</div>
            <div style={{ fontSize:'14px', color:T.textSec }}>
              まだ行程がありません
            </div>
            <div style={{ fontSize:'12px', color:T.textDim, marginTop:'4px' }}>
              上のボタンから追加してください
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:'10px', fontWeight:700, color:T.textDim,
              letterSpacing:'.1em', marginBottom:'14px' }}>保存された行程</div>
            {trips.map(trip => (
              <TripCard key={trip.id} trip={trip}
                onClick={() => window.location.href = `/trips/${trip.id}`}
                onDelete={() => handleDelete(trip.id)}/>
            ))}
          </>
        )}
      </div>

      {showNew && (
        <NewTripModal onSave={handleCreate} onClose={() => setShowNew(false)}/>
      )}
    </div>
  )
}

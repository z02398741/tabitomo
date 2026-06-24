'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import TabitomoLogo from '@/components/logo/TabitomoLogo'
// write operations go through API routes (lib/trips uses server-only env vars)
async function apiAddEvent(body: object) {
  const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiUpdateEvent(id: string, body: object) {
  const res = await fetch(`/api/events/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiDeleteEvent(id: string) {
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}
async function apiAddDay(body: object) {
  const res = await fetch('/api/days', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function apiDeleteDay(id: string) {
  const res = await fetch(`/api/days/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}
async function apiReorderDays(ids: string[]) {
  const res = await fetch('/api/days/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
  if (!res.ok) throw new Error(await res.text())
}
import type { Trip, TripDay, Event } from '@/types'

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
  amber:    '#f5a623',
  rose:     '#f06292',
  green:    '#66bb6a',
  textPri:  '#edf0f7',
  textSec:  '#8b93b0',
  textDim:  '#4a5170',
}

const DAY_ACCENTS = ['#6c8ef5','#4ecdc4','#f5a623','#f06292','#a78bfa']

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  transport: { label:'移動', color:'#6c8ef5', icon:'🚢' },
  gather:    { label:'集合', color:'#f5a623', icon:'📍' },
  activity:  { label:'活動', color:'#4ecdc4', icon:'🤿' },
  meal:      { label:'食事', color:'#f06292', icon:'🍽' },
  stay:      { label:'宿泊', color:'#a78bfa', icon:'🏨' },
  free:      { label:'自由', color:'#8b93b0', icon:'🌊' },
}

const ALERT_OPTIONS = [
  { value:0,   label:'通知なし' },
  { value:15,  label:'15分前' },
  { value:30,  label:'30分前' },
  { value:60,  label:'1時間前' },
  { value:120, label:'2時間前' },
]

const inputSt: React.CSSProperties = {
  width:'100%', padding:'10px 12px', borderRadius:'9px',
  border:`1px solid ${T.border}`, background:'#13161e',
  color:T.textPri, fontSize:'13px', fontFamily:'inherit',
  boxSizing:'border-box', outline:'none',
}

const Ico = {
  back:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>,
  out:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>,
  cal:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  export:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  copy:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>,
  bell:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  grip:  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>,
}

// ── Modal ──────────────────────────────────────────────────────
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
      backdropFilter:'blur(4px)', display:'flex', alignItems:'center',
      justifyContent:'center', zIndex:100, padding:'16px' }}>
      <div style={{ background:T.card, border:`1px solid ${T.border}`,
        borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'460px',
        boxShadow:'0 32px 80px rgba(0,0,0,.5)', maxHeight:'90vh', overflowY:'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────
function Badge({ type }: { type: string }) {
  const m = TYPE_META[type] || TYPE_META.free
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px',
      padding:'2px 8px', borderRadius:'20px', fontSize:'9px', fontWeight:700,
      background:m.color+'20', color:m.color, border:`1px solid ${m.color}30` }}>
      {m.icon} {m.label}
    </span>
  )
}

// ── Event Form Modal ───────────────────────────────────────────
function EventFormModal({ event, dayId, onSave, onClose }: {
  event?: Event
  dayId: string
  onSave: (ev: Event) => void
  onClose: () => void
}) {
  const [time,      setTime]      = useState(event?.time     || '09:00')
  const [title,     setTitle]     = useState(event?.title    || '')
  const [type,      setType]      = useState<Event['type']>(event?.type || 'activity')
  const [note,      setNote]      = useState(event?.note     || '')
  const [alertMin,  setAlertMin]  = useState(event?.alert_min ?? 0)
  const [saving,    setSaving]    = useState(false)
  const [tickets,   setTickets]   = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (event?.id) {
      fetch(`/api/tickets?event_id=${event.id}`)
        .then(r => r.json())
        .then(setTickets)
    }
  }, [event?.id])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !event?.id) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('event_id', event.id)
      fd.append('name', file.name)
      const res = await fetch('/api/tickets', { method: 'POST', body: fd })
      const ticket = await res.json()
      setTickets(p => [...p, ticket])
    } finally {
      setUploading(false)
    }
  }

  const openTicket = async (ticketId: string) => {
    const res = await fetch(`/api/tickets/${ticketId}/url`)
    const { url } = await res.json()
    window.open(url, '_blank')
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      let saved
      if (event?.id) {
        saved = await apiUpdateEvent(event.id, { time, title, type, note, alert_min: alertMin })
      } else {
        saved = await apiAddEvent({ day_id: dayId, time, title, type, note, alert_min: alertMin })
      }
      onSave({ ...saved, tickets })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'20px' }}>
        <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>
          {event ? 'イベントを編集' : 'イベントを追加'}
        </span>
        <button onClick={onClose} style={{ background:'none', border:'none',
          color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
        <div>
          <label style={{ display:'block', fontSize:'11px', fontWeight:700,
            color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>時間 *</label>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={inputSt}/>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'11px', fontWeight:700,
            color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>種類</label>
          <select value={type} onChange={e=>setType(e.target.value as Event['type'])} style={inputSt}>
            {Object.entries(TYPE_META).map(([k,v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom:'14px' }}>
        <label style={{ display:'block', fontSize:'11px', fontWeight:700,
          color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>タイトル *</label>
        <input value={title} onChange={e=>setTitle(e.target.value)}
          placeholder="例：竹芝ターミナル 集合" style={inputSt}/>
      </div>

      <div style={{ marginBottom:'14px' }}>
        <label style={{ display:'block', fontSize:'11px', fontWeight:700,
          color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>メモ</label>
        <textarea value={note} onChange={e=>setNote(e.target.value)}
          rows={2} placeholder="持ち物、注意事項など"
          style={{ ...inputSt, resize:'vertical' }}/>
      </div>

      <div style={{ marginBottom:'20px' }}>
        <label style={{ display:'block', fontSize:'11px', fontWeight:700,
          color:T.textDim, letterSpacing:'.06em', marginBottom:'8px' }}>通知タイミング</label>
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {ALERT_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setAlertMin(o.value)} style={{
              padding:'6px 12px', borderRadius:'20px',
              border:`1px solid ${alertMin===o.value ? T.accent : T.border}`,
              background: alertMin===o.value ? T.accentDim : 'none',
              color: alertMin===o.value ? T.accentLt : T.textSec,
              cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {event?.id && (
        <div style={{ marginBottom:'20px' }}>
          <label style={{ display:'block', fontSize:'11px', fontWeight:700,
            color:T.textDim, letterSpacing:'.06em', marginBottom:'8px' }}>
            🎫 チケット・票券
          </label>
          {tickets.map(t => (
            <div key={t.id} onClick={() => openTicket(t.id)} style={{
              display:'flex', alignItems:'center', gap:'8px',
              padding:'8px 12px', borderRadius:'8px', marginBottom:'6px',
              background:'#13161e', border:`1px solid ${T.border}`,
              cursor:'pointer',
            }}>
              <span style={{ fontSize:'14px' }}>🎫</span>
              <span style={{ fontSize:'13px', color:T.accentLt, flex:1 }}>{t.name}</span>
              <span style={{ fontSize:'11px', color:T.textDim }}>開く →</span>
            </div>
          ))}
          <label style={{
            display:'flex', alignItems:'center', gap:'8px',
            padding:'9px 14px', borderRadius:'8px',
            border:`1.5px dashed ${T.border}`, cursor:'pointer',
            color:T.textDim, fontSize:'13px',
          }}>
            <span>{uploading ? 'アップロード中...' : '+ PDF・画像を添付'}</span>
            <input type="file" accept=".pdf,image/*" onChange={handleUpload}
              style={{ display:'none' }} disabled={uploading}/>
          </label>
        </div>
      )}

      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:'10px',
          border:`1px solid ${T.border}`, background:'none', cursor:'pointer',
          fontSize:'13px', color:T.textSec }}>キャンセル</button>
        <button onClick={save} disabled={!title.trim() || saving} style={{
          padding:'9px 20px', borderRadius:'10px', border:'none',
          background: title.trim() && !saving ? T.accent : T.textDim+'44',
          color:'#fff', cursor: title.trim() && !saving ? 'pointer' : 'default',
          fontSize:'13px', fontWeight:600 }}>
          {saving ? '保存中...' : event ? '保存' : '追加'}
        </button>
      </div>
    </Modal>
  )
}

// ── Day Form Modal ─────────────────────────────────────────────
function DayFormModal({ tripId, onSave, onClose }: {
  tripId: string
  onSave: (day: TripDay) => void
  onClose: () => void
}) {
  const [label,  setLabel]  = useState('')
  const [date,   setDate]   = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!label.trim()) return
    setSaving(true)
    try {
      const day = await apiAddDay({
        trip_id: tripId,
        label: label.trim(),
        date: date || null,
        position: 0,
      })
      onSave(day)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'20px' }}>
        <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>日程を追加</span>
        <button onClick={onClose} style={{ background:'none', border:'none',
          color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
      </div>

      <div style={{ marginBottom:'14px' }}>
        <label style={{ display:'block', fontSize:'11px', fontWeight:700,
          color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>ラベル *</label>
        <input value={label} onChange={e=>setLabel(e.target.value)}
          placeholder="例：Day1｜7/18（五）" style={inputSt}/>
      </div>

      <div style={{ marginBottom:'20px' }}>
        <label style={{ display:'block', fontSize:'11px', fontWeight:700,
          color:T.textDim, letterSpacing:'.06em', marginBottom:'6px' }}>日付</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputSt}/>
      </div>

      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:'10px',
          border:`1px solid ${T.border}`, background:'none', cursor:'pointer',
          fontSize:'13px', color:T.textSec }}>キャンセル</button>
        <button onClick={save} disabled={!label.trim() || saving} style={{
          padding:'9px 20px', borderRadius:'10px', border:'none',
          background: label.trim() && !saving ? T.accent : T.textDim+'44',
          color:'#fff', cursor: label.trim() && !saving ? 'pointer' : 'default',
          fontSize:'13px', fontWeight:600 }}>
          {saving ? '追加中...' : '追加'}
        </button>
      </div>
    </Modal>
  )
}

// ── Export Modal ───────────────────────────────────────────────
function ExportModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [mode,   setMode]   = useState<'text'|'line'>('text')
  const [copied, setCopied] = useState(false)

  const toText = () => {
    const lines = [`【${trip.title}】`]
    if (trip.members)   lines.push(`👥 ${trip.members}名`)
    if (trip.budget)    lines.push(`💰 ${trip.budget}`)
    if (trip.transport) lines.push(`🚢 ${trip.transport}`)
    trip.days?.forEach(d => {
      lines.push('', '─'.repeat(26), `■ ${d.label}`)
      d.events?.forEach(e => lines.push(`${e.time}　${e.title}${e.note?`（${e.note}）`:''}`))
    })
    return lines.join('\n')
  }

  const toLine = () => {
    const EI: Record<string, string> = { transport:'🚢', gather:'📍', activity:'🤿', meal:'🍽', stay:'🏨', free:'🌊' }
    const lines = [`📍 *${trip.title}*`, '']
    trip.days?.forEach(d => {
      lines.push(`▶ ${d.label}`)
      d.events?.forEach(e => lines.push(`${EI[e.type]||'•'} ${e.time} ${e.title}`))
      lines.push('')
    })
    lines.push('✅ 詳細はTabitomoで確認！')
    return lines.join('\n')
  }

  const content = mode === 'line' ? toLine() : toText()

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'16px' }}>
        <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>エクスポート</span>
        <button onClick={onClose} style={{ background:'none', border:'none',
          color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
      </div>
      <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
        {([['text','📋 テキスト'],['line','💬 LINE用']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setMode(v)} style={{
            padding:'7px 16px', borderRadius:'20px',
            border:`1.5px solid ${mode===v ? T.accent : T.border}`,
            background: mode===v ? T.accentDim : 'none',
            color: mode===v ? T.accentLt : T.textSec,
            cursor:'pointer', fontSize:'12px', fontWeight:600 }}>{l}</button>
        ))}
      </div>
      <pre style={{ background:'#13161e', border:`1px solid ${T.border}`,
        borderRadius:'12px', padding:'14px', fontSize:'12px', lineHeight:1.7,
        overflowY:'auto', maxHeight:'260px', whiteSpace:'pre-wrap',
        color:T.textSec, margin:'0 0 14px' }}>{content}</pre>
      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:'10px',
          border:`1px solid ${T.border}`, background:'none', cursor:'pointer',
          fontSize:'13px', color:T.textSec }}>閉じる</button>
        <button onClick={copy} style={{ padding:'9px 20px', borderRadius:'10px',
          border:'none', background: copied ? '#4caf8f' : T.accent,
          color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:600,
          display:'flex', alignItems:'center', gap:'6px' }}>
          {copied ? <>{Ico.check} コピー済み</> : <>{Ico.copy} コピー</>}
        </button>
      </div>
    </Modal>
  )
}

// ── Event Row ──────────────────────────────────────────────────
function EventRow({ ev, accent, isLast, onEdit, onDelete }: {
  ev: Event
  accent: string
  isLast: boolean
  onEdit: (ev: Event) => void
  onDelete: (id: string) => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', gap:'12px', alignItems:'flex-start',
        paddingBottom: isLast ? 0 : '14px', marginBottom: isLast ? 0 : '14px',
        borderBottom: isLast ? 'none' : `1px solid ${T.border}` }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        paddingTop:'3px', width:'16px', flexShrink:0 }}>
        <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:accent,
          boxShadow:`0 0 6px ${accent}88`, flexShrink:0 }}/>
        {!isLast && <div style={{ width:'1px', flex:1, minHeight:'20px',
          background:`linear-gradient(${accent}44, transparent)`, marginTop:'4px' }}/>}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px',
          marginBottom:'5px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'12px', fontWeight:700, color:T.textPri }}>{ev.time}</span>
          <Badge type={ev.type} />
          {ev.alert_min > 0 && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:'3px',
              fontSize:'9px', color:T.textDim }}>
              {Ico.bell} {ev.alert_min}分前
            </span>
          )}
          {(ev.tickets?.length ?? 0) > 0 && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:'3px',
              fontSize:'9px', color:'#a78bfa',
              padding:'2px 6px', borderRadius:'20px',
              background:'#a78bfa18', border:'1px solid #a78bfa30' }}>
              🎫 {ev.tickets!.length}
            </span>
          )}
        </div>
        <div style={{ fontSize:'14px', fontWeight:600, color:T.textPri,
          marginBottom: ev.note ? '3px' : 0 }}>{ev.title}</div>
        {ev.note && <div style={{ fontSize:'11px', color:T.textSec }}>{ev.note}</div>}
      </div>
      <div style={{ display:'flex', gap:'4px', flexShrink:0,
        opacity: hov ? 1 : 0, transition:'opacity .15s' }}>
        <button onClick={() => onEdit(ev)} style={{ padding:'5px', borderRadius:'6px',
          border:`1px solid ${T.border}`, background:'#13161e',
          color:T.textSec, cursor:'pointer', display:'flex', alignItems:'center' }}>
          {Ico.edit}
        </button>
        <button onClick={() => onDelete(ev.id)} style={{ padding:'5px', borderRadius:'6px',
          border:`1px solid ${T.border}`, background:'#13161e',
          color:'#f06292', cursor:'pointer', display:'flex', alignItems:'center' }}>
          {Ico.trash}
        </button>
      </div>
    </div>
  )
}

// ── Day Card ───────────────────────────────────────────────────
function DayCard({ day, accent, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onAddEvent, onEditEvent, onDeleteEvent, onDeleteDay }: {
  day: TripDay & { events?: Event[] }
  accent: string
  isDragging: boolean
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
  onAddEvent: (ev: Event) => void
  onEditEvent: (ev: Event) => void
  onDeleteEvent: (id: string) => void
  onDeleteDay: (id: string) => void
}) {
  const [open,          setOpen]          = useState(true)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEvent,  setEditingEvent]  = useState<Event | undefined>()
  const events = [...(day.events ?? [])].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        style={{ background:T.card,
          border:`1px solid ${isDragOver ? T.accent : T.border}`,
          borderRadius:'16px', marginBottom:'12px', overflow:'hidden',
          opacity: isDragging ? 0.4 : 1,
          transition:'opacity .15s, border-color .15s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px',
          padding:'14px 18px',
          borderBottom: open ? `1px solid ${T.border}` : 'none' }}>
          <span style={{ color:T.textDim, cursor:'grab', display:'flex',
            alignItems:'center', flexShrink:0 }}>
            {Ico.grip}
          </span>
          <div onClick={() => setOpen(o=>!o)} style={{ display:'flex',
            alignItems:'center', gap:'12px', flex:1, cursor:'pointer' }}>
            <div style={{ width:'3px', height:'36px', borderRadius:'2px',
              background:accent, flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'13px', fontWeight:700, color:T.textPri,
                marginBottom:'2px' }}>{day.label}</div>
              {day.date && <div style={{ fontSize:'11px', color:T.textDim }}>{day.date}</div>}
            </div>
            <span style={{ fontSize:'10px', color:T.textDim }}>{events.length}件</span>
            <span style={{ color:T.textDim, fontSize:'14px',
              transform: open ? 'rotate(0)' : 'rotate(-90deg)',
              transition:'transform .2s' }}>▾</span>
          </div>
          <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
            <button onClick={() => setShowEventForm(true)} style={{
              padding:'6px 10px', borderRadius:'8px',
              border:`1px solid ${accent}44`, background:accent+'22',
              color:accent, cursor:'pointer', display:'flex',
              alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:700 }}>
              {Ico.plus} 追加
            </button>
            <button onClick={() => onDeleteDay(day.id)} style={{
              padding:'6px', borderRadius:'8px',
              border:`1px solid ${T.border}`, background:'none',
              color:T.textDim, cursor:'pointer', display:'flex', alignItems:'center' }}>
              {Ico.trash}
            </button>
          </div>
        </div>

        {open && (
          <div style={{ padding: events.length > 0 ? '16px 18px' : '12px 18px' }}>
            {events.length === 0 ? (
              <div style={{ textAlign:'center', padding:'16px 0',
                color:T.textDim, fontSize:'12px' }}>
                「追加」からイベントを登録してください
              </div>
            ) : (
              events.map((ev, i) => (
                <EventRow key={ev.id} ev={ev} accent={accent}
                  isLast={i === events.length - 1}
                  onEdit={e => { setEditingEvent(e); setShowEventForm(true) }}
                  onDelete={onDeleteEvent}/>
              ))
            )}
          </div>
        )}
      </div>

      {showEventForm && (
        <EventFormModal
          event={editingEvent}
          dayId={day.id}
          onSave={ev => {
            if (editingEvent) {
              onEditEvent(ev)
            } else {
              onAddEvent(ev)
            }
            setShowEventForm(false)
            setEditingEvent(undefined)
          }}
          onClose={() => {
            setShowEventForm(false)
            setEditingEvent(undefined)
          }}
        />
      )}
    </>
  )
}

// ── Batch Alert Modal ─────────────────────────────────────────
function BatchAlertModal({ trip, onDone, onClose }: {
  trip: Trip
  onDone: (overrides: Record<string, number>) => void
  onClose: () => void
}) {
  // eventId → alert_min の編集状態
  const [overrides, setOverrides] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    trip.days?.forEach(d => d.events?.forEach(e => { init[e.id] = e.alert_min ?? 0 }))
    return init
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      // 変更があったイベントのみ更新
      const allEvents = trip.days?.flatMap(d => d.events || []) || []
      const changed = allEvents.filter(e => overrides[e.id] !== e.alert_min)
      await Promise.all(changed.map(e =>
        fetch(`/api/events/${e.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_min: overrides[e.id] }),
        })
      ))
      onDone(overrides)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display:'flex', justifyContent:'space-between',
        alignItems:'center', marginBottom:'16px' }}>
        <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>
          {Ico.bell} 通知設定
        </span>
        <button onClick={onClose} style={{ background:'none', border:'none',
          color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
      </div>

      <div style={{ maxHeight:'55vh', overflowY:'auto', marginBottom:'16px' }}>
        {(trip.days || []).map(day => (
          <div key={day.id} style={{ marginBottom:'16px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:T.textDim,
              letterSpacing:'.06em', marginBottom:'8px', paddingBottom:'6px',
              borderBottom:`1px solid ${T.border}` }}>
              {day.label}
            </div>
            {(day.events || []).length === 0 && (
              <div style={{ fontSize:'12px', color:T.textDim, paddingLeft:'4px' }}>イベントなし</div>
            )}
            {(day.events || []).map(ev => (
              <div key={ev.id} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', gap:'8px',
                padding:'8px 0', borderBottom:`1px solid ${T.border}22` }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:'12px', fontWeight:600, color:T.textPri }}>
                    {ev.time} {ev.title}
                  </span>
                </div>
                <select
                  value={overrides[ev.id] ?? 0}
                  onChange={e => setOverrides(p => ({ ...p, [ev.id]: Number(e.target.value) }))}
                  style={{ padding:'5px 8px', borderRadius:'8px', fontSize:'12px',
                    border:`1px solid ${overrides[ev.id] !== (ev.alert_min ?? 0) ? T.rose : T.border}`,
                    background:'#13161e', color: overrides[ev.id] > 0 ? T.rose : T.textDim,
                    cursor:'pointer', flexShrink:0 }}>
                  {ALERT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:'10px',
          border:`1px solid ${T.border}`, background:'none', cursor:'pointer',
          fontSize:'13px', color:T.textSec }}>キャンセル</button>
        <button onClick={save} disabled={saving} style={{
          padding:'9px 20px', borderRadius:'10px', border:'none',
          background: saving ? T.textDim+'44' : T.rose,
          color:'#fff', cursor: saving ? 'default' : 'pointer',
          fontSize:'13px', fontWeight:600 }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </Modal>
  )
}

// ── Trip Client ────────────────────────────────────────────────
export default function TripClient({ trip: initialTrip, session }: {
  trip: Trip
  session: any
}) {
  const router = useRouter()
  const currentUserId: string | undefined = (session?.user as { id?: string })?.id
  const [trip,        setTrip]        = useState(() => ({
    ...initialTrip,
    days: (initialTrip.days ?? []).map(d => ({
      ...d,
      events: [...(d.events ?? [])].sort((a, b) => a.time.localeCompare(b.time)),
    })),
  }))
  const [showDayForm,  setShowDayForm]  = useState(false)
  const [showExport,   setShowExport]   = useState(false)
  const [inviteUrl,    setInviteUrl]    = useState<string | null>(null)
  const [showInvite,   setShowInvite]   = useState(false)
  const [members,      setMembers]      = useState<{ userId: string; role: string; name: string | null; image: string | null }[]>([])
  const [memberMax,    setMemberMax]    = useState(20)
  const [linkCopied,   setLinkCopied]   = useState(false)
  const [showLineBind,  setShowLineBind]  = useState(false)
  const [lineCopied,    setLineCopied]    = useState(false)
  const [showBatchAlert, setShowBatchAlert] = useState(false)
  const [dragIdx,     setDragIdx]     = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const updateDays = (days: any[]) => setTrip(t => ({ ...t, days }))

  const handleAddDay = (day: TripDay) => {
    updateDays([...(trip.days || []), { ...day, events: [] }])
    setShowDayForm(false)
  }

  const handleAddEvent = (dayId: string, ev: Event) => {
    updateDays((trip.days || []).map(d =>
      d.id !== dayId ? d : {
        ...d,
        events: [...(d.events || []), ev]
          .sort((a, b) => a.time.localeCompare(b.time))
      }
    ))
  }

  const handleEditEvent = (dayId: string, ev: Event) => {
    updateDays((trip.days || []).map(d =>
      d.id !== dayId ? d : {
        ...d,
        events: (d.events || []).map(e => e.id === ev.id ? ev : e)
          .sort((a, b) => a.time.localeCompare(b.time))
      }
    ))
  }

  const handleDeleteEvent = async (dayId: string, evId: string) => {
    await apiDeleteEvent(evId)
    updateDays((trip.days || []).map(d =>
      d.id !== dayId ? d : {
        ...d,
        events: (d.events || []).filter(e => e.id !== evId)
      }
    ))
  }

  const handleDeleteDay = async (dayId: string) => {
    await apiDeleteDay(dayId)
    updateDays((trip.days || []).filter(d => d.id !== dayId))
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragEnd   = () => { setDragIdx(null); setDragOverIdx(null) }
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx) }
  const handleDrop      = async (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return
    const newDays = [...(trip.days || [])]
    const [moved] = newDays.splice(dragIdx, 1)
    newDays.splice(idx, 0, moved)
    setDragIdx(null)
    setDragOverIdx(null)
    updateDays(newDays)
    await apiReorderDays(newDays.map(d => d.id))
  }

  const handleInvite = async () => {
    const [invRes, memRes] = await Promise.all([
      fetch(`/api/trips/${trip.id}/invite`, { method: 'POST' }),
      fetch(`/api/trips/${trip.id}/members`),
    ])
    const { url } = await invRes.json()
    const { members: m, max } = await memRes.json()
    setInviteUrl(url)
    setMembers(m ?? [])
    setMemberMax(max ?? 20)
    setLinkCopied(false)
    setShowInvite(true)
  }

  const handleRevoke = async () => {
    await fetch(`/api/trips/${trip.id}/invite`, { method: 'DELETE' })
    setInviteUrl(null)
  }

  const handleRemoveMember = async (userId: string) => {
    await fetch(`/api/trips/${trip.id}/members?userId=${userId}`, { method: 'DELETE' })
    setMembers(prev => prev.filter(m => m.userId !== userId))
  }

  return (
    <div style={{ minHeight:'100vh', background:'transparent', color:T.textPri,
      fontFamily:"'Inter','Noto Sans JP',sans-serif" }}>

      {/* Header */}
      <div style={{ padding:'20px 20px 0', marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <button onClick={() => router.push('/')} style={{ display:'flex',
            alignItems:'center', gap:'6px', background:'none', border:'none',
            color:T.textSec, cursor:'pointer', fontSize:'13px', padding:0 }}>
            {Ico.back} 戻る
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ display:'flex',
            alignItems:'center', gap:'6px', padding:'8px 14px', borderRadius:'10px',
            border:`1px solid ${T.border}`, background:'none',
            color:T.textSec, cursor:'pointer', fontSize:'12px' }}>
            {Ico.out} ログアウト
          </button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {/* Title row */}
          <div>
            <div style={{ marginBottom:'6px' }}><TabitomoLogo /></div>
            <h1 style={{ fontSize:'22px', fontWeight:700, color:T.textPri,
              margin:'0 0 6px', lineHeight:1.3 }}>{trip.title}</h1>
            <div style={{ fontSize:'12px', color:T.textSec }}>
              {(trip.days||[]).length}日間
              {trip.members ? ` · ${trip.members}名` : ''}
              {trip.budget  ? ` · ${trip.budget}`   : ''}
            </div>
          </div>
          {/* Action buttons row */}
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            <button onClick={handleInvite} style={{ display:'flex',
              alignItems:'center', gap:'4px', padding:'8px 12px', borderRadius:'10px',
              border:`1px solid ${T.teal}44`, background:T.teal+'22',
              color:T.teal, cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
              👥 招待
            </button>
            <button onClick={() => setShowLineBind(true)} style={{ display:'flex',
              alignItems:'center', gap:'4px', padding:'8px 12px', borderRadius:'10px',
              border:`1px solid ${T.amber}44`, background:T.amber+'22',
              color:T.amber, cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
              💬 LINE
            </button>
            <button onClick={() => setShowBatchAlert(true)} style={{ display:'flex',
              alignItems:'center', gap:'4px', padding:'8px 12px', borderRadius:'10px',
              border:`1px solid ${T.rose}44`, background:T.rose+'22',
              color:T.rose, cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
              {Ico.bell} 通知
            </button>
            <button onClick={() => setShowExport(true)} style={{ display:'flex',
              alignItems:'center', gap:'4px', padding:'8px 12px', borderRadius:'10px',
              border:`1px solid ${T.border}`, background:T.card, color:T.textSec,
              cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
              {Ico.export} 出力
            </button>
          </div>
        </div>

        {trip.transport && (
          <div style={{ marginTop:'14px', display:'inline-flex', alignItems:'center',
            gap:'6px', padding:'6px 12px', borderRadius:'20px', background:T.accentDim,
            border:`1px solid ${T.accent}33`, fontSize:'12px', color:T.accentLt }}>
            🚢 {trip.transport}
          </div>
        )}
      </div>

      {/* Days */}
      <div style={{ padding:'0 20px 40px', maxWidth:'600px', margin:'0 auto' }}>
        {(trip.days || []).length === 0 && (
          <div style={{ background:T.card, border:`1px solid ${T.border}`,
            borderRadius:'16px', padding:'32px 20px', textAlign:'center',
            marginBottom:'12px' }}>
            <div style={{ fontSize:'32px', marginBottom:'10px' }}>📅</div>
            <div style={{ fontSize:'14px', color:T.textSec }}>日程がありません</div>
            <div style={{ fontSize:'12px', color:T.textDim, marginTop:'4px' }}>
              下のボタンから日程を追加してください
            </div>
          </div>
        )}

        {(trip.days || []).map((day, i) => (
          <DayCard key={day.id} day={day}
            accent={DAY_ACCENTS[i % DAY_ACCENTS.length]}
            isDragging={dragIdx === i}
            isDragOver={dragOverIdx === i && dragIdx !== i}
            onDragStart={() => handleDragStart(i)}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            onAddEvent={ev => handleAddEvent(day.id, ev)}
            onEditEvent={ev => handleEditEvent(day.id, ev)}
            onDeleteEvent={id => handleDeleteEvent(day.id, id)}
            onDeleteDay={handleDeleteDay}
          />
        ))}

        {/* Add Day */}
        <button onClick={() => setShowDayForm(true)} style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
          width:'100%', padding:'13px', borderRadius:'12px',
          border:`1.5px dashed ${T.border}`, background:'none',
          color:T.textDim, cursor:'pointer', fontSize:'13px', fontWeight:600,
          transition:'border-color .15s, color .15s' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = T.accent;
            (e.currentTarget as HTMLElement).style.color = T.accent
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
            (e.currentTarget as HTMLElement).style.color = T.textDim
          }}>
          {Ico.cal} 日程を追加
        </button>
      </div>

      {showDayForm && (
        <DayFormModal tripId={trip.id} onSave={handleAddDay}
          onClose={() => setShowDayForm(false)}/>
      )}
      {showExport && (
        <ExportModal trip={trip} onClose={() => setShowExport(false)}/>
      )}
      {showBatchAlert && (
        <BatchAlertModal
          trip={trip}
          onDone={(overrides) => {
            setShowBatchAlert(false)
            updateDays((trip.days || []).map(d => ({
              ...d,
              events: (d.events || []).map(e =>
                overrides[e.id] !== undefined ? { ...e, alert_min: overrides[e.id] } : e
              ),
            })))
          }}
          onClose={() => setShowBatchAlert(false)}
        />
      )}
      {showLineBind && (
        <Modal onClose={() => { setShowLineBind(false); setLineCopied(false) }}>
          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'16px' }}>
            <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>
              💬 LINEグループと連携
            </span>
            <button onClick={() => setShowLineBind(false)} style={{ background:'none',
              border:'none', color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
          </div>
          <div style={{ fontSize:'13px', color:T.textSec, marginBottom:'16px', lineHeight:1.6 }}>
            BOT をグループに追加後、以下のメッセージをグループに送信してください。
          </div>
          <div style={{ background:'#13161e', border:`1px solid ${T.amber}44`,
            borderRadius:'10px', padding:'14px', fontSize:'13px', color:T.amber,
            wordBreak:'break-all', marginBottom:'14px', fontFamily:'monospace' }}>
            @Tabi 連携 {trip.id}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`@Tabi 連携 ${trip.id}`)
              setLineCopied(true)
              setTimeout(() => setLineCopied(false), 2000)
            }}
            style={{ width:'100%', padding:'11px', borderRadius:'10px',
              border:'none', background: lineCopied ? '#4caf8f' : T.amber,
              color:'#fff', cursor:'pointer', fontSize:'14px', fontWeight:600,
              display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {lineCopied ? <>{Ico.check} コピー済み</> : <>{Ico.copy} コマンドをコピー</>}
          </button>
          {trip.line_group_id && (
            <div style={{ marginTop:'12px', padding:'10px 12px', borderRadius:'8px',
              background: T.green+'15', border:`1px solid ${T.green}44`,
              fontSize:'12px', color:T.green, textAlign:'center' }}>
              ✅ 連携済み
            </div>
          )}
        </Modal>
      )}
      {showInvite && (
        <Modal onClose={() => setShowInvite(false)}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'16px' }}>
            <span style={{ fontSize:'16px', fontWeight:700, color:T.textPri }}>
              👥 メンバー管理
            </span>
            <button onClick={() => setShowInvite(false)} style={{ background:'none',
              border:'none', color:T.textDim, cursor:'pointer', fontSize:'20px' }}>×</button>
          </div>

          {/* Member count */}
          <div style={{ fontSize:'12px', color:T.textSec, marginBottom:'12px' }}>
            メンバー {members.length} / {memberMax} 人
            <span style={{ display:'inline-block', marginLeft:'8px',
              width:`${(members.length / memberMax) * 100}%`, maxWidth:'80px',
              height:'4px', background:T.accent+'66', borderRadius:'2px',
              verticalAlign:'middle' }}/>
          </div>

          {/* Member list */}
          <div style={{ maxHeight:'200px', overflowY:'auto', marginBottom:'16px' }}>
            {members.map(m => {
              const isOwner = m.role === 'owner'
              const isSelf  = m.userId === currentUserId
              const canRemove = !isOwner && !isSelf &&
                members.find(x => x.userId === currentUserId)?.role === 'owner'
              return (
                <div key={m.userId} style={{ display:'flex', alignItems:'center',
                  gap:'10px', padding:'8px 0',
                  borderBottom:`1px solid ${T.border}` }}>
                  {m.image
                    ? <div style={{ width:'32px', height:'32px', borderRadius:'50%',
                        backgroundImage:`url(${m.image})`, backgroundSize:'cover',
                        backgroundPosition:'center', flexShrink:0 }}/>
                    : <div style={{ width:'32px', height:'32px', borderRadius:'50%',
                        background:T.accentDim, display:'flex', alignItems:'center',
                        justifyContent:'center', fontSize:'14px', color:T.accent }}>
                        {(m.name ?? '?')[0]}
                      </div>
                  }
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'13px', color:T.textPri, fontWeight:500 }}>
                      {m.name ?? 'ユーザー'}
                      {isSelf && <span style={{ fontSize:'10px', color:T.textDim, marginLeft:'6px' }}>（あなた）</span>}
                    </div>
                    <div style={{ fontSize:'11px', color:T.textDim }}>
                      {isOwner ? 'オーナー' : 'メンバー'}
                    </div>
                  </div>
                  {canRemove && (
                    <button onClick={() => handleRemoveMember(m.userId)}
                      style={{ padding:'4px 10px', borderRadius:'7px', border:'none',
                        background:'#f0629218', color:'#f06292', cursor:'pointer',
                        fontSize:'11px', fontWeight:600 }}>
                      除名
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Invite link */}
          {inviteUrl ? (
            <>
              <div style={{ fontSize:'12px', color:T.textSec, marginBottom:'8px' }}>
                招待リンク（7日間有効 · 何人でも使用可）
              </div>
              <div style={{ background:'#13161e', border:`1px solid ${T.border}`,
                borderRadius:'10px', padding:'10px 12px', fontSize:'11px',
                color:T.accentLt, wordBreak:'break-all', marginBottom:'10px' }}>
                {inviteUrl}
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => {
                  navigator.clipboard.writeText(inviteUrl)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }} style={{ flex:1, padding:'10px', borderRadius:'10px',
                  border:'none', background: linkCopied ? '#4caf8f' : T.accent,
                  color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
                  {linkCopied ? '✓ コピー済み' : 'リンクをコピー'}
                </button>
                <button onClick={handleRevoke}
                  style={{ padding:'10px 14px', borderRadius:'10px',
                    border:`1px solid #f0629244`, background:'#f0629212',
                    color:'#f06292', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
                  無効化
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', padding:'12px 0',
              fontSize:'13px', color:T.textDim }}>
              招待リンクは無効化されています
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

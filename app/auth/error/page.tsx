'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const params = useSearchParams()
  const error = params.get('error')
  const desc  = params.get('error_description')

  return (
    <div style={{
      minHeight: '100vh', background: '#0d0f14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#edf0f7', fontFamily: 'Inter, sans-serif', padding: '20px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontSize: '16px', marginBottom: '8px' }}>認証に失敗しました</div>
        {error && <div style={{ fontSize: '12px', color: '#f06292', marginBottom: '4px' }}>{error}</div>}
        {desc  && <div style={{ fontSize: '12px', color: '#8b93b0', marginBottom: '16px' }}>{desc}</div>}
        <a href="/" style={{ color: '#6c8ef5', fontSize: '14px' }}>トップに戻る</a>
      </div>
    </div>
  )
}

export default function AuthError() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  )
}

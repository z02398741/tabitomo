import { Suspense } from 'react'
import LoginButton from '@/components/LoginButton'

function LoginContent() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d0f14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6c8ef5',
            letterSpacing: '.2em', marginBottom: '12px' }}>TABITOMO</div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#edf0f7',
            margin: '0 0 8px' }}>旅行プランナー</h1>
          <p style={{ fontSize: '14px', color: '#8b93b0', margin: 0 }}>
            仲間と旅行行程を管理・共有する
          </p>
        </div>
        <LoginButton />
        <p style={{ textAlign: 'center', fontSize: '12px', color: '#4a5170',
          marginTop: '20px' }}>
          ログインすることで利用規約に同意したものとみなします
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

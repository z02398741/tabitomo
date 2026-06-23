'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

export default function LoginButton() {
  const searchParams = useSearchParams()

  const next =
    searchParams.get('next') || '/'

  const callbackUrl =
    `${window.location.origin}${next}`

  return (
    <button
      onClick={() =>
        signIn('line', {
          callbackUrl,
        })
      }
    >
      LINE でログイン
    </button>
  )
}
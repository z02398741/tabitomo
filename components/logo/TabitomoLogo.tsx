'use client'
import './logo.css'

interface Props {
  className?: string
}

export default function TabitomoLogo({ className = '' }: Props) {
  return (
    <div className={`tabitomo-logo flex items-center gap-2 select-none ${className}`}>
      {/* ── Bird SVG ── */}
      <svg
        className="w-9 h-9 md:w-10 md:h-10 flex-shrink-0"
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Glow — visible only when .thinking */}
        <circle className="bird-glow" cx="22" cy="24" r="18" fill="#6c8ef5" />

        {/* Body (static, gray) */}
        <ellipse cx="22" cy="40" rx="11" ry="6" fill="#4b5563" />
        <ellipse cx="22" cy="43" rx="5" ry="2.5" fill="#374151" />

        {/* Head group (animated) */}
        <g className="bird-head">
          {/* Black head */}
          <circle cx="22" cy="22" r="13" fill="#111827" />

          {/* Subtle tech sheen */}
          <ellipse cx="16" cy="14" rx="5" ry="2.8" fill="white" opacity="0.06" />

          {/* White cheeks */}
          <ellipse cx="12" cy="25" rx="5.5" ry="4.5" fill="#f8fafc" />
          <ellipse cx="32" cy="25" rx="5.5" ry="4.5" fill="#f8fafc" />

          {/* Left eye */}
          <circle cx="17" cy="19" r="3.8" fill="white" />
          <circle cx="18" cy="19" r="2.1" fill="#0f172a" />
          <circle cx="16.8" cy="17.8" r="0.85" fill="white" />

          {/* Right eye */}
          <circle cx="27" cy="19" r="3.8" fill="white" />
          <circle cx="28" cy="19" r="2.1" fill="#0f172a" />
          <circle cx="26.8" cy="17.8" r="0.85" fill="white" />

          {/* Pink beak */}
          <path
            d="M19.5 27 Q22 31.5 24.5 27 Q22 29.5 19.5 27Z"
            fill="#f9a8d4"
          />
        </g>
      </svg>

      {/* ── Logotype ── */}
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.35em',
          color: '#7DA8FF',
          fontFamily: "'Inter','Noto Sans JP',sans-serif",
        }}
      >
        TABITOMO
      </span>
    </div>
  )
}

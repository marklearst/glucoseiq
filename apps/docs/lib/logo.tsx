import { useId, type JSX } from 'react'

/** GlucoseIQ drop and glucose-zone ring. */
export function LogoMark(props: {
  size?: number
  motion?: boolean
  variant?: 'full' | 'drop'
}): JSX.Element {
  const id = useId().replaceAll(':', '')
  const gradientId = `giq-ring-${id}`
  const ringRevealId = `giq-ring-reveal-${id}`
  const s = props.size ?? 28
  const showRing = props.variant !== 'drop'
  return (
    <svg
      aria-hidden="true"
      data-logo-motion={props.motion ? 'true' : undefined}
      fill="none"
      height={s}
      viewBox="0 0 64 84"
      width={s}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1="32"
          x2="32"
          y1="37"
          y2="67"
        >
          <stop offset="0" stopColor="#30D158" />
          <stop offset="0.34" stopColor="#9BE22D" />
          <stop offset="0.58" stopColor="#FFD60A" />
          <stop offset="0.82" stopColor="#FF9F0A" />
          <stop offset="1" stopColor="#FF6B3D" />
        </linearGradient>
        <mask
          height="84"
          id={ringRevealId}
          maskUnits="userSpaceOnUse"
          width="64"
          x="0"
          y="0"
        >
          <circle
            cx="32"
            cy="52"
            data-logo-part="ring-reveal"
            fill="none"
            pathLength="1"
            r="11.5"
            stroke="white"
            strokeDasharray="1"
            strokeDashoffset="0"
            strokeLinecap="round"
            strokeWidth="8"
            transform="rotate(-90 32 52)"
          />
        </mask>
      </defs>
      <path
        data-logo-part="drop"
        d="M32 7C32 7 9 36.5 9 52a23 23 0 0 0 46 0C55 36.5 32 7 32 7Z"
        stroke="#FF453A"
        strokeWidth="7.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showRing ? (
        <path
          clipRule="evenodd"
          d="M32 37a15 15 0 1 1 0 30 15 15 0 1 1 0-30ZM32 44a8 8 0 1 0 0 16 8 8 0 1 0 0-16Z"
          data-logo-part="ring"
          fill={`url(#${gradientId})`}
          fillRule="evenodd"
          mask={props.motion ? `url(#${ringRevealId})` : undefined}
        />
      ) : null}
    </svg>
  )
}

/** Mark + wordmark lockup. */
export function LogoLockup(props: { size?: number }): JSX.Element {
  const s = props.size ?? 24
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(s * 0.42) }}>
      <LogoMark size={s} variant="drop" />
      <span
        style={{
          fontWeight: 700,
          fontSize: s * 0.82,
          letterSpacing: '-0.02em',
          color: 'currentColor',
          lineHeight: 1,
        }}
      >
        GlucoseIQ
      </span>
    </span>
  )
}

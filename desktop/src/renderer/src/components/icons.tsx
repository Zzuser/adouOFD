import type { ReactNode } from 'react'

type IconProps = {
  size?: number
  className?: string
}

export function BrandMark({ size = 44, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="14" fill="#2F7A4F" />
      <path
        d="M31.4 10.2c6.6 3.9 8.9 12.3 5.1 19.3-3.7 7-12.9 9.9-19.4 6.1-6.4-3.8-8.1-12.5-3.6-18.6 4.1-5.6 11.6-7.9 17.9-6.8Z"
        fill="#F6F4EC"
      />
      <path
        d="M17 32.5c3.1-5.4 7.5-8.7 14.2-10.4"
        stroke="#2F7A4F"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M27 12.5c.5-2.6 2.3-4.4 4.8-5"
        stroke="#E4B54B"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
    </Svg>
  )
}

export function IconView(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  )
}

export function IconSwap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </Svg>
  )
}

export function IconMerge(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13" width="7" height="7" rx="1.5" />
      <path d="M10.5 7.5h4a2 2 0 0 1 2 2v3.5" />
      <path d="M13.5 16.5h-4a2 2 0 0 1-2-2v-3.5" />
    </Svg>
  )
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5" />
      <path d="M9 13h6M9 16h4" />
    </Svg>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Z" />
    </Svg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6l7-2.5Z" />
      <path d="m9.3 12.2 1.9 1.9 3.6-3.8" />
    </Svg>
  )
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m14.5 6-6 6 6 6" />
    </Svg>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  )
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </Svg>
  )
}

export function IconLocation(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </Svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  )
}

export function IconMinus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  )
}

export function IconPages(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="7" width="12" height="14" rx="1.8" />
      <path d="M8 4.5h9A2.5 2.5 0 0 1 19.5 7v11" />
      <path d="M7.5 11h5M7.5 14h5" />
    </Svg>
  )
}

export function IconFitWidth(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6v12M20 6v12" />
      <path d="M7 12h10M7 12l2.5-2.5M7 12l2.5 2.5M17 12l-2.5-2.5M17 12l-2.5 2.5" />
    </Svg>
  )
}

export function IconFitPage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h3M8 8v3M16 8h-3M16 8v3M8 16h3M8 16v-3M16 16h-3M16 16v-3" />
    </Svg>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5v5M12 7.6v.1" />
    </Svg>
  )
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 5h6v6" />
      <path d="M19 5 10 14" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Svg>
  )
}

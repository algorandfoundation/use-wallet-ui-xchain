import type { CSSProperties, ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}

function StrokeIcon({
  size = 24,
  className,
  style,
  strokeWidth = 2,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

function FilledIcon({
  size = 20,
  className,
  style,
  children,
}: Omit<IconProps, 'strokeWidth'> & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

// -- Stroke icons (viewBox 0 0 24 24) --

export function ChevronLeft(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m15 18-6-6 6-6" />
    </StrokeIcon>
  )
}

export function ChevronRight(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <polyline points="9 18 15 12 9 6" />
    </StrokeIcon>
  )
}

export function ChevronDown(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </StrokeIcon>
  )
}

export function ChevronsUpDown(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m17 10-5-5-5 5" />
      <path d="m17 14-5 5-5-5" />
    </StrokeIcon>
  )
}

export function RefreshCw(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </StrokeIcon>
  )
}

export function ArrowUpRight(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </StrokeIcon>
  )
}

export function ArrowDownLeft(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M17 7 7 17" />
      <path d="M17 17H7V7" />
    </StrokeIcon>
  )
}

export function ArrowsExchange(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M8 3l4 4-4 4" />
      <path d="M16 3l-4 4 4 4" />
      <path d="M12 7H4" />
      <path d="M12 7h8" />
      <path d="M8 21l4-4-4-4" />
      <path d="M16 21l-4-4 4-4" />
      <path d="M12 17H4" />
      <path d="M12 17h8" />
    </StrokeIcon>
  )
}

export function ArrowsUpDown(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </StrokeIcon>
  )
}

export function Search(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </StrokeIcon>
  )
}

export function Check(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </StrokeIcon>
  )
}

export function Clipboard(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </StrokeIcon>
  )
}

export function List(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </StrokeIcon>
  )
}

export function Eye(props: IconProps) {
  return (
    <StrokeIcon {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </StrokeIcon>
  )
}

export function VerifiedBadge({ size = 14, className = 'inline-block ml-1 -mt-0.5' }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--wui-color-primary)"
      className={className}
    >
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

export function SuspiciousBadge({ size = 14, className = 'inline-block ml-1 -mt-0.5' }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--wui-color-danger-text, #ef4444)"
      className={className}
      aria-label="Suspicious asset"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  )
}

// -- Filled icons (viewBox 0 0 20 20) --

export function CheckCircleFilled(props: Omit<IconProps, 'strokeWidth'>) {
  return (
    <FilledIcon {...props}>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </FilledIcon>
  )
}

export function XCircleFilled(props: Omit<IconProps, 'strokeWidth'>) {
  return (
    <FilledIcon {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </FilledIcon>
  )
}

export function XFilled(props: Omit<IconProps, 'strokeWidth'>) {
  return (
    <FilledIcon {...props}>
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </FilledIcon>
  )
}

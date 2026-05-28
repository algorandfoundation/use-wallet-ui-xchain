import { ChevronLeft } from './icons'

export interface BackButtonProps {
  onClick: () => void
  disabled?: boolean
  title?: string
  'aria-label'?: string
  className?: string
  /** 'panel' = square corners (panel headers). 'round' = circular (TransactionDetail). */
  variant?: 'panel' | 'round'
}

export function BackButton({
  onClick,
  disabled,
  title,
  'aria-label': ariaLabel,
  className,
  variant = 'panel',
}: BackButtonProps) {
  if (variant === 'round') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={
          className ??
          'shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--wui-color-bg-tertiary)] transition-colors text-[var(--wui-color-text-secondary)] disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wui-color-primary)] focus-visible:ring-offset-1'
        }
        aria-label={ariaLabel ?? title ?? 'Back'}
      >
        <ChevronLeft size={16} />
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        className ??
        'wui-panel-back -ml-1 p-1 rounded-lg hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-[var(--wui-color-text-secondary)] flex items-center justify-center disabled:opacity-40'
      }
      title={title ?? 'Back'}
      aria-label={ariaLabel}
    >
      <ChevronLeft size={20} />
    </button>
  )
}

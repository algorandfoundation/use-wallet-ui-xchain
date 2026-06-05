import { FloatingPortal } from '@floating-ui/react'
import type { TransactionDanger } from '@d13co/algo-x-evm-ui'
import { useWalletUI } from '../providers/WalletUIProvider'

interface ExtensionSignIndicatorProps {
  transactionCount: number
  dangerous: TransactionDanger
  onReject: () => void
}

export function ExtensionSignIndicator({
  transactionCount,
  dangerous,
  onReject,
}: ExtensionSignIndicatorProps) {
  const { theme } = useWalletUI()
  const dataTheme = theme === 'system' ? undefined : theme

  return (
    <FloatingPortal id="wallet-extension-indicator-portal">
      <div data-wallet-theme data-wallet-ui data-theme={dataTheme}>
        <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-2xl bg-[var(--wui-color-bg)] shadow-lg border border-[var(--wui-color-border)] px-4 py-3 max-w-sm">
          {/* Spinner */}
          <svg
            className="animate-spin h-5 w-5 text-[var(--wui-color-primary)] flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>

          <div className="flex flex-col min-w-0">
            <span className={`text-sm font-medium ${dangerous ? 'text-[var(--wui-color-danger-text)]' : 'text-[var(--wui-color-text)]'}`}>
              Review {transactionCount > 1 ? `${transactionCount} transactions` : 'transaction'} in extension
              {dangerous && ' (dangerous)'}
            </span>
            <span className="text-xs text-[var(--wui-color-text-tertiary)]">
              Open the Liquid Wallet Companion popup
            </span>
          </div>

          <button
            onClick={onReject}
            className="ml-auto flex-shrink-0 text-xs px-2.5 py-1 rounded-lg bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </FloatingPortal>
  )
}

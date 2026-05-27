import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useId,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { BridgePanel, Disclaimer } from '@d13co/algo-x-evm-ui'
import { useNetwork, NetworkId } from '@txnlab/use-wallet-react'
import { useState, useEffect, useCallback } from 'react'

import { useBridgeDialog } from '../providers/BridgeDialogProvider'
import { useWalletUI } from '../providers/WalletUIProvider'
import { mapBridgeToPanelProps } from '../utils/bridgePropsMapper'

// Statuses that indicate bridge is actively processing
const PROCESSING_STATUSES = new Set([
  'permit-signing',
  'approving',
  'bundling',
  'signing',
  'sending',
  'opting-in',
  'waiting',
  'watching-funding',
  'opt-in-sent',
])

/**
 * Compute which signing step we're on and how many total.
 * Wallet interactions: opt-in (if needed) -> approval -> bridge send.
 */
function getSigningProgress(status: string, optInNeeded: boolean): { current: number; total: number } | null {
  // Total = bridge send (always 1) + approval (always 1) + opt-in (if needed)
  const total = optInNeeded ? 3 : 2

  switch (status) {
    case 'opting-in':
      return { current: 1, total }
    case 'permit-signing':
    case 'approving':
    case 'bundling':
      return { current: optInNeeded ? 2 : 1, total }
    case 'signing':
      return { current: total, total }
    default:
      return null
  }
}

function getMinimizedTitle(
  status: string,
  remainingMs: number | null,
  optInNeeded: boolean,
  error: string | null,
  receivedAmount: string | null,
  destinationTokenSymbol: string | null,
  sourceChainSymbol: string | null,
): string {
  const signing = getSigningProgress(status, optInNeeded)
  if (signing) {
    return `Bridge: Signing ${signing.current}/${signing.total}`
  }

  switch (status) {
    case 'quoting':
      return 'Bridge: Quoting'
    case 'sending':
      return 'Bridge: Sending'
    case 'waiting': {
      if (remainingMs != null && remainingMs > 0) {
        if (remainingMs < 60_000) {
          const seconds = Math.ceil(remainingMs / 1_000)
          return `Bridge: ETA ~${seconds}s`
        }
        const minutes = Math.ceil(remainingMs / 60_000)
        return `Bridge: ETA ~${minutes}m`
      }
      return 'Bridge: Waiting'
    }
    case 'watching-funding': {
      if (remainingMs != null && remainingMs > 0) {
        if (remainingMs < 60_000) {
          const seconds = Math.ceil(remainingMs / 1_000)
          return `Bridge: ETA ~${seconds}s`
        }
        const minutes = Math.ceil(remainingMs / 60_000)
        return `Bridge: ETA ~${minutes}m`
      }
      return 'Bridge: Awaiting funding'
    }
    case 'opt-in-sent':
      return 'Bridge: Opting in'
    case 'success': {
      if (receivedAmount && destinationTokenSymbol) {
        const verb = sourceChainSymbol === 'ALG' ? 'Sent' : 'Received'
        return `${verb} ${receivedAmount} ${destinationTokenSymbol}`
      }
      return 'Bridge: Complete!'
    }
    case 'error':
      return `Bridging failed: ${error || 'Unknown error'}`
    default:
      return 'Bridge'
  }
}

// Bridge icon SVG used in both modes
function BridgeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3l4 4-4 4" />
      <path d="M16 3l-4 4 4 4" />
      <path d="M12 7H4" />
      <path d="M12 7h8" />
      <path d="M8 21l4-4-4-4" />
      <path d="M16 21l-4-4 4-4" />
      <path d="M12 17H4" />
      <path d="M12 17h8" />
    </svg>
  )
}

function ExpandedBridgeDialog() {
  const { bridge, closeBridge, minimizeBridge } = useBridgeDialog()
  const { theme } = useWalletUI()
  const { activeNetwork } = useNetwork()
  const [animationState, setAnimationState] = useState<'starting' | 'entered' | 'exiting' | null>('starting')

  const isMainnet = activeNetwork === NetworkId.MAINNET
  const isProcessing = PROCESSING_STATUSES.has(bridge.status)
  const isSuccess = bridge.status === 'success'
  const dataTheme = theme === 'system' ? undefined : theme

  const handleClose = useCallback(() => {
    setAnimationState('exiting')
    setTimeout(() => closeBridge(), 150)
  }, [closeBridge])

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) {
        if (isProcessing) {
          minimizeBridge()
        } else {
          setAnimationState('exiting')
          setTimeout(() => closeBridge(), 150)
        }
      }
    },
  })

  // Disable clickaway dismiss when success (user must explicitly close)
  const dismiss = useDismiss(context, {
    outsidePressEvent: 'mousedown',
    enabled: !isSuccess,
  })
  const role = useRole(context, { role: 'dialog' })
  const { getFloatingProps } = useInteractions([dismiss, role])

  const labelId = useId()

  // Trigger enter animation
  if (animationState === 'starting') {
    requestAnimationFrame(() => setAnimationState('entered'))
  }

  const bridgeProps = { ...mapBridgeToPanelProps(bridge), onReset: handleClose }

  return (
    <FloatingPortal id="wallet-bridge-dialog-portal">
      <div data-wallet-theme data-wallet-ui data-theme={dataTheme}>
        <FloatingOverlay
          className="grid place-items-center px-4 z-[98] transition-opacity duration-150 ease-in-out bg-[var(--wui-color-overlay)] data-[state=starting]:opacity-0 data-[state=exiting]:opacity-0 data-[state=entered]:opacity-100"
          data-state={animationState}
          lockScroll
        >
          <FloatingFocusManager context={context} modal={true} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              {...getFloatingProps({
                'aria-labelledby': labelId,
              })}
              role="dialog"
              data-state={animationState}
              className="w-full max-w-md rounded-3xl bg-[var(--wui-color-bg)] shadow-xl transform transition-all duration-150 ease-in-out data-[state=starting]:opacity-0 data-[state=starting]:scale-90 data-[state=exiting]:opacity-0 data-[state=exiting]:scale-90 data-[state=entered]:opacity-100 data-[state=entered]:scale-100"
              style={{ marginTop: '-0.5rem' }}
            >
              {/* Header with title, refresh, and minimize/close button */}
              <div className="flex items-center justify-between px-4 pt-4 pb-0">
                <h3 className="text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">Bridge</h3>
                <div className="flex items-center gap-1">
                {!isProcessing && (
                  <button
                    onClick={() => bridge.refreshBalances()}
                    disabled={bridge.balancesLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh balances"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={bridge.balancesLoading ? 'animate-spin' : ''}
                    >
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                )}
                {isProcessing ? (
                  <button
                    onClick={minimizeBridge}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all"
                    aria-label="Minimize bridge dialog"
                    title="Minimize"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={handleClose}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all"
                    aria-label="Close bridge dialog"
                    title="Close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
                </div>
              </div>
              <div className="p-4 pt-2">
                {isMainnet ? (
                  <Disclaimer id="bridge">
                    <BridgePanel {...bridgeProps} hideHeader autoFocusAmount />
                  </Disclaimer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 text-[var(--wui-color-text-tertiary)] mb-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4" />
                      <path d="M12 16h.01" />
                    </svg>
                    <p className="text-base font-medium text-[var(--wui-color-text)] mb-1">
                      Bridging is only available on Mainnet
                    </p>
                    <p className="text-sm text-[var(--wui-color-text-secondary)]">
                      Please switch to Mainnet to use the bridge.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingOverlay>
      </div>
    </FloatingPortal>
  )
}

function MinimizedBridgeWidget() {
  const { bridge, restoreBridge, closeBridge } = useBridgeDialog()
  const { theme } = useWalletUI()
  const [animationState, setAnimationState] = useState<'starting' | 'entered'>('starting')
  const [now, setNow] = useState(() => Date.now())

  // Tick every second while waiting (any waiting-related status) so ETA stays current
  const isWaiting =
    bridge.status === 'waiting' || bridge.status === 'watching-funding' || bridge.status === 'opt-in-sent'
  useEffect(() => {
    if (!isWaiting) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [isWaiting])

  const remainingMs =
    isWaiting && bridge.estimatedTimeMs != null && bridge.waitingSince != null
      ? Math.max(0, bridge.estimatedTimeMs - (now - bridge.waitingSince))
      : null

  const dataTheme = theme === 'system' ? undefined : theme
  const title = getMinimizedTitle(
    bridge.status,
    remainingMs,
    bridge.optInNeeded,
    bridge.error,
    bridge.receivedAmount,
    bridge.destinationToken?.symbol ?? null,
    bridge.sourceChain?.chainSymbol ?? null,
  )

  // Determine status dot color
  const isProcessing = PROCESSING_STATUSES.has(bridge.status)
  const isSuccess = bridge.status === 'success'
  const isError = bridge.status === 'error'

  // Trigger enter animation
  useEffect(() => {
    requestAnimationFrame(() => setAnimationState('entered'))
  }, [])

  return (
    <FloatingPortal id="wallet-bridge-widget-portal">
      <div data-wallet-theme data-wallet-ui data-theme={dataTheme}>
        <div
          data-state={animationState}
          className="fixed bottom-0 right-4 z-[98] flex items-center gap-2.5 rounded-t-2xl bg-[var(--wui-color-bg)] shadow-xl border border-b-0 border-[var(--wui-color-border)] px-4 py-3 transition-all duration-150 ease-in-out data-[state=starting]:opacity-0 data-[state=starting]:translate-y-4 data-[state=entered]:opacity-100 data-[state=entered]:translate-y-0 max-w-[90vw] min-w-0"
        >
          <button
            onClick={restoreBridge}
            className="flex items-center gap-2.5 cursor-pointer hover:brightness-95 transition-all min-w-0"
            title="Show bridge dialog"
          >
            <div className="relative">
              <BridgeIcon className="h-5 w-5 text-[var(--wui-color-text)]" />
              {/* Status indicator dot */}
              <span
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                  isSuccess
                    ? 'bg-green-500'
                    : isError
                      ? 'bg-red-500'
                      : isProcessing
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-[var(--wui-color-text-tertiary)]'
                }`}
              />
            </div>
            <span className="text-sm font-medium text-[var(--wui-color-text)] truncate">{title}</span>
          </button>
          {/* Close button for success/error/idle states */}
          {!isProcessing && (
            <button
              onClick={closeBridge}
              className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--wui-color-text-tertiary)] hover:text-[var(--wui-color-text-secondary)] transition-colors"
              aria-label="Close"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </FloatingPortal>
  )
}

export function BridgeDialog() {
  const { isOpen, isMinimized } = useBridgeDialog()

  if (!isOpen) return null

  if (isMinimized) {
    return <MinimizedBridgeWidget />
  }

  return <ExpandedBridgeDialog />
}

import { CopyButton } from './CopyButton'
import { XFilled } from './icons'
import { DOCS_PORTAL_URL } from '../constants'

export interface WelcomeContentProps {
  algorandAddress: string
  evmAddress: string
  onClose: () => void
  labelId?: string
  descriptionId?: string
  bridgeAvailable?: boolean
  onBridgeClick?: () => void
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`
}

export function WelcomeContent({
  algorandAddress,
  evmAddress,
  onClose,
  labelId,
  descriptionId,
  bridgeAvailable,
  onBridgeClick,
}: WelcomeContentProps) {
  const shortAlgorandAddress = shortAddress(algorandAddress)
  const shortEvmAddress = shortAddress(evmAddress)

  return (
    <>
      {/* Header */}
      <div className="relative flex items-center px-6 pt-5 pb-4">
        <h2 id={labelId} className="text-xl font-bold text-[var(--wui-color-text)] wallet-custom-font">
          Welcome to Algorand
        </h2>
        <button
          onClick={onClose}
          className="absolute right-4 top-5 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all"
          aria-label="Close dialog"
        >
          <XFilled className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div id={descriptionId} className="px-6 pb-4 space-y-4">
        <p className="text-sm text-[var(--wui-color-text)]">
          You can use Algorand with your very own "xChain Account". This wraps your EVM private key, preserving full
          self-custodial control.{' '}
          <a
            className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
            rel="noopener noreferrer"
            target="_blank"
            href={`${DOCS_PORTAL_URL}/what-is-algo-x-evm`}
          >
            Learn more.
          </a>
        </p>

        <div className="!my-4 rounded-xl border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] p-3 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--wui-color-text)]">Your EVM address</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--wui-color-text)] font-mono">{shortEvmAddress}</span>
              <CopyButton text={evmAddress} variant="icon" title="Copy EVM address" />
            </span>
          </div>
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="text-[var(--wui-color-text)]">Your xChain EVM address</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--wui-color-text)] font-mono">{shortAlgorandAddress}</span>
              <CopyButton text={algorandAddress} variant="icon" title="Copy Algorand address" />
            </span>
          </div>
        </div>

        {bridgeAvailable ? (
          <p className="text-sm text-[var(--wui-color-text)]">
            To get started, you can bridge USDC without leaving this site, or you can fund your new Algorand account via{' '}
            <a
              className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
              rel="noopener noreferrer"
              target="_blank"
              href="https://algorand.co/ecosystem/directory?tags=CEX"
            >
              CEX, Card onramps
            </a>{' '}
            and many other methods.
          </p>
        ) : (
          <p className="text-sm text-[var(--wui-color-text)]">
            To get started, fund your new Algorand account via{' '}
            <a
              className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
              rel="noopener noreferrer"
              target="_blank"
              href="https://algorand.co/ecosystem/directory?tags=CEX"
            >
              CEX, Card onramps
            </a>{' '}
            and many other methods.
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-6 py-4 border-t border-[var(--wui-color-border)] flex flex gap-2">
        {bridgeAvailable ? (
          <button
            onClick={() => {
              onClose()
              onBridgeClick?.()
            }}
            className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
          >
            Bridge USDC
          </button>
        ) : (
          <button
            onClick={() => {
              onClose()
              window.open('https://algorand.co/algorand-start-here#hs_cos_wrapper_widget_1769533007886')
            }}
            className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
          >
            Get Started
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
        >
          Close
        </button>
      </div>
    </>
  )
}

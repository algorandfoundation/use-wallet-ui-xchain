import { useEffect, useMemo, useState } from 'react'
import { useNoticeConfig } from '../notices/NoticeProvider'
import { AlgoSymbol } from './AlgoSymbol'
import { AssetSelect } from './AssetSelect'
import { BackButton } from './BackButton'
import { CopyButton } from './CopyButton'
import { ExternalLinkIcon } from './ExternalLinkIcon'
import { CheckCircleFilled, XCircleFilled, RefreshCw } from './icons'
import { SecondaryButton } from './SecondaryButton'
import { Spinner } from './Spinner'

export interface BridgeChainDisplay {
  chainSymbol: string
  chainName: string
  tokens: BridgeTokenDisplay[]
}

export interface BridgeTokenDisplay {
  symbol: string
  name: string
  decimals?: number
  chainSymbol: string
  chainName: string
  /** Raw balance in smallest token units (decimal string). Undefined while loading. */
  balance?: string
}

export type BridgeStatusValue =
  | 'idle'
  | 'loading-chains'
  | 'quoting'
  | 'permit-signing'
  | 'approving'
  | 'bundling'
  | 'signing'
  | 'sending'
  | 'opting-in'
  | 'waiting'
  | 'watching-funding'
  | 'opt-in-sent'
  | 'success'
  | 'error'

export interface BridgePanelProps {
  // Chain/token selection
  chains: BridgeChainDisplay[]
  chainsLoading: boolean
  balancesLoading?: boolean
  /**
   * When provided, the form is hidden (and a spinner shown) until this flips
   * true — ensuring the source-chain select renders with its final balance-
   * inclusive label on first paint. When omitted, falls back to legacy
   * behavior of showing the form as soon as chains are loaded.
   */
  initialLoadComplete?: boolean
  sourceChainSymbol: string | null
  onSourceChainChange: (symbol: string) => void
  sourceTokenSymbol: string | null
  onSourceTokenChange: (symbol: string) => void
  destinationChains?: BridgeChainDisplay[]
  destinationChainSymbol?: string | null
  onDestinationChainChange?: (symbol: string) => void
  sourceIsAlgorand?: boolean
  destinationTokenSymbol: string | null
  destinationTokens: BridgeTokenDisplay[]
  onDestinationTokenChange: (symbol: string) => void

  // Amount
  amount: string
  onAmountChange: (v: string) => void
  receivedAmount: string | null
  quoteLoading: boolean

  // Fee
  /** Allbridge's relayer fee */
  gasFee: string | null
  gasFeeLoading: boolean
  gasFeeUnit: string | null
  /** Approximate ALGO the user will receive from extra gas (e.g. "~0.123 ALGO") */
  extraGasAlgo: string | null
  /** Effective fee the user will pay for the complete bridge operation: relayer fee + liquidity provider fee. */
  totalFee: string | null

  // Addresses
  evmAddress: string | null
  algorandAddress: string | null

  // Transfer tracking
  estimatedTimeMs: number | null
  waitingSince: number | null
  transferStatus: BridgeTransferStatus | null

  // Opt-in tracking
  optInNeeded: boolean
  optInSigned: boolean
  watchingForFunding: boolean
  optInConfirmed: boolean

  // Status
  status: BridgeStatusValue
  error: string | null
  sourceTxId: string | null
  destinationTxId?: string | null

  // Actions
  onBridge: () => void
  onReset: () => void
  onRetry: () => void
  onBack?: () => void

  /** Hide the built-in header (useful when the parent provides its own) */
  hideHeader?: boolean

  /** Auto-focus the source chain dropdown when mounted */
  autoFocusAmount?: boolean

  /** Called when the user clicks the refresh button */
  onRefresh?: () => void
  /** True while a balance refresh is ongoing - spins the refresh icon */
  isRefreshing?: boolean
}

export interface BridgeTransferStatus {
  sendConfirmations: number
  sendConfirmationsNeeded: number
  signaturesCount: number
  signaturesNeeded: number
  receiveConfirmations: number | null
  receiveConfirmationsNeeded: number | null
}

const EMPTY_CHAINS: BridgeChainDisplay[] = []

function formatShortAddr(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`
}

/** Displays a transaction ID with a copy button */
function TxLine({ label, txId }: { label: string; txId: string }) {
  return (
    <p className="text-xs text-[var(--wui-color-text-secondary)] flex items-center justify-center">
      <span className="inline-flex items-baseline gap-1">
        <span>{label}:</span>
        <span className="font-mono">{formatShortAddr(txId)}</span>
      </span>
      <CopyButton text={txId} variant="icon" title={`Copy ${label.toLowerCase()}`} />
    </p>
  )
}

/** Allbridge Explorer link for an address */
function AllbridgeExplorerLink({ address, children, muted }: { address: string; children: string; muted?: boolean }) {
  return (
    <a
      href={`https://core.allbridge.io/explorer/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        muted
          ? 'inline-flex items-center gap-1 rounded text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text-secondary)] transition-colors'
          : 'text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)] inline-flex items-center gap-1'
      }
    >
      {children} <ExternalLinkIcon />
    </a>
  )
}

/** Icon for a multi-step progress row: check when done, spinner when active, empty circle when pending */
function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done) return <CheckCircleFilled className="h-3.5 w-3.5 text-green-500 shrink-0" />
  if (active) return <Spinner className="h-3.5 w-3.5 shrink-0" />
  return <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--wui-color-border)]" />
}

/** Centered spinner with a status message */
function StatusSpinner({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-sm text-[var(--wui-color-text-secondary)]">
      <Spinner className="h-4 w-4 mr-2" />
      {message}
    </div>
  )
}

/** Format a raw balance string (smallest units) to a human-readable number with up to 2 decimal places */
function formatTokenBalance(rawBalance: string, decimals: number): string {
  if (decimals === 0) return rawBalance
  const padded = rawBalance.padStart(decimals + 1, '0')
  const whole = padded.slice(0, -decimals) || '0'
  const frac = padded.slice(-decimals).slice(0, 2).replace(/0+$/, '')
  const formatted = frac ? `${whole}.${frac}` : whole
  // Add thousands separators to the whole part
  const [w, f] = formatted.split('.')
  const withCommas = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return f ? `${withCommas}.${f}` : withCommas
}

/** Format a decimal fee string to a human-readable number with up to 6 decimal places */
function formatFeeDisplay(fee: string | null): string | null {
  if (fee == null) return null
  const value = parseFloat(fee)
  if (isNaN(value)) return fee
  const [, decimals = ''] = fee.split('.')
  if (decimals.length <= 6) return fee.includes('.') ? fee.replace(/\.?0+$/, '') : fee
  const formatted = value.toFixed(6).replace(/\.?0+$/, '')
  return value > 0 && formatted === '0' ? '<0.000001' : formatted
}

/** Returns a chain dropdown label display. For the active source chain (`sourceChainSymbol`),
 * shows `sourceTokenSymbol`'s balance; for all other chains shows the highest-balance token. */
function formatChainLabel(chain: BridgeChainDisplay, sourceChainSymbol: string | null, sourceTokenSymbol: string | null): string {
  const selectedTokenSymbol = chain.chainSymbol === sourceChainSymbol ? sourceTokenSymbol : null
  if (selectedTokenSymbol) {
    const t = chain.tokens.find((t) => t.symbol === selectedTokenSymbol)
    if (t && t.decimals != null) {
      const formatted = t.balance && t.balance !== '0' ? formatTokenBalance(t.balance, t.decimals) : '0'
      return `${chain.chainName} (${formatted} ${t.symbol})`
    }
  }
  let preferredToken: BridgeTokenDisplay | null = null
  let amountDisplay = ''
  let amountNormalized = 0n
  for (const t of chain.tokens) {
    if (!t.balance || t.balance === '0' || t.decimals == null) continue
    const f = formatTokenBalance(t.balance, t.decimals)
    if (f === '0') continue // skip dust amounts that round to zero at 2 decimal places
    const n = BigInt(t.balance) * 10n ** BigInt(18 - t.decimals)
    if (n > amountNormalized) {
      preferredToken = t
      amountDisplay = f
      amountNormalized = n
    }
  }
  if (!preferredToken) return chain.chainName
  return `${chain.chainName} (${amountDisplay} ${preferredToken.symbol})`
}

// Well-known token logos (SVG from popular CDNs / data URIs)
const TOKEN_LOGOS: Record<string, string> = {
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  WETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  WBTC: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
  DAI: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png',
  USDe: 'https://assets.coingecko.com/coins/images/33613/small/usde.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
}

// Well-known chain logos
const CHAIN_LOGOS: Record<string, string> = {
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  BSC: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  POL: 'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
  ARB: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  OPT: 'https://assets.coingecko.com/coins/images/25244/small/Optimism_%28OP%29.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  BASE: 'https://assets.coingecko.com/coins/images/31164/small/base.png',
}

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function BridgePanel({
  chains,
  chainsLoading,
  initialLoadComplete,
  sourceChainSymbol,
  onSourceChainChange,
  sourceTokenSymbol,
  onSourceTokenChange,
  destinationChains = EMPTY_CHAINS,
  destinationChainSymbol,
  onDestinationChainChange,
  sourceIsAlgorand = false,
  destinationTokenSymbol,
  destinationTokens,
  onDestinationTokenChange,
  amount,
  onAmountChange,
  receivedAmount,
  quoteLoading,
  gasFee,
  gasFeeLoading,
  gasFeeUnit,
  extraGasAlgo,
  totalFee,
  evmAddress,
  algorandAddress,
  estimatedTimeMs,
  waitingSince,
  transferStatus,
  optInNeeded,
  optInSigned,
  watchingForFunding,
  optInConfirmed,
  status,
  error,
  sourceTxId,
  destinationTxId,
  onBridge,
  onReset,
  onRetry,
  // balancesLoading is available via props for consumers who want loading indicators
  onBack,
  hideHeader,
  autoFocusAmount,
  onRefresh,
  isRefreshing,
}: BridgePanelProps) {
  const bridgeFooterConfig = useNoticeConfig('bridgeFooter')
  const bridgeFooter = bridgeFooterConfig?.kind === 'footer' ? bridgeFooterConfig.text : null
  const bridgeSignConfig = useNoticeConfig('bridgeSign')
  const bridgeSignNotice = bridgeSignConfig?.kind === 'info' ? bridgeSignConfig : null
  const [bridgeSignPending, setBridgeSignPending] = useState(false)
  const sourceChain = chains.find((c) => c.chainSymbol === sourceChainSymbol) ?? null
  const sourceTokens = sourceChain?.tokens ?? []
  const selectedSourceToken = sourceTokens.find((t) => t.symbol === sourceTokenSymbol) ?? null

  // Compute human-readable balance for the selected source token
  const sourceBalanceFloat =
    selectedSourceToken?.balance != null && selectedSourceToken.decimals != null
      ? parseFloat(selectedSourceToken.balance) / 10 ** selectedSourceToken.decimals
      : null

  const parsedAmount = amount ? parseFloat(amount) : 0
  const insufficientFunds = sourceBalanceFloat != null && parsedAmount > 0 && parsedAmount > sourceBalanceFloat
  const formattedTotalFee = formatFeeDisplay(totalFee)
  const formattedGasFee = formatFeeDisplay(gasFee)
  const networkFeeDisplay = formattedTotalFee ?? (formattedGasFee ? `~${formattedGasFee}` : null)

  const isProcessing =
    status === 'permit-signing' ||
    status === 'approving' ||
    status === 'bundling' ||
    status === 'signing' ||
    status === 'sending' ||
    status === 'opting-in' ||
    status === 'waiting' ||
    status === 'watching-funding' ||
    status === 'opt-in-sent'

  const canSubmit =
    status === 'idle' &&
    sourceChainSymbol &&
    sourceTokenSymbol &&
    destinationTokenSymbol &&
    amount &&
    parsedAmount > 0 &&
    !insufficientFunds &&
    !gasFeeLoading &&
    gasFee != null &&
    (sourceIsAlgorand ? algorandAddress : evmAddress && algorandAddress)

  const algoIcon = <AlgoSymbol scale={1} />
  const sourceChainOptions = useMemo(
    () => chains.map((c) => ({
      value: c.chainSymbol,
      label: formatChainLabel(c, sourceChainSymbol, sourceTokenSymbol),
      logo: CHAIN_LOGOS[c.chainSymbol] ?? null,
      icon: c.chainSymbol === 'ALG' ? algoIcon : undefined,
    })),
    [chains, sourceChainSymbol, sourceTokenSymbol],
  )
  const sourceTokenOptions = useMemo(
    () => sourceTokens.map((t) => ({
      value: t.symbol,
      label: t.symbol,
      logo: TOKEN_LOGOS[t.symbol] ?? null,
    })),
    [sourceTokens],
  )
  const destChainOptions = useMemo(
    () => destinationChains.map((c) => ({
      value: c.chainSymbol,
      label: c.chainName,
      logo: CHAIN_LOGOS[c.chainSymbol] ?? null,
      icon: c.chainSymbol === 'ALG' ? algoIcon : undefined,
    })),
    [destinationChains],
  )
  const destTokenOptions = useMemo(
    () => destinationTokens.map((t) => ({
      value: t.symbol,
      label: t.symbol,
      logo: TOKEN_LOGOS[t.symbol] ?? null,
    })),
    [destinationTokens],
  )

  // `initialLoadComplete === false` means the consumer is using the new gated
  // behavior and the first balance fetch hasn't finished yet. Treat `undefined`
  // as loaded for backward compatibility with consumers that don't pass the prop.
  const initialLoading = chainsLoading || initialLoadComplete === false

  return (
    <>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center gap-2 mb-4">
          {onBack && (
            <BackButton onClick={onBack} disabled={isProcessing} />
          )}
          <h3 className="text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">Bridge</h3>
          {onRefresh && status === 'idle' && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="ml-auto w-6 h-6 flex items-center justify-center rounded-full text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text)] hover:bg-[var(--wui-color-bg-tertiary)] transition-all disabled:opacity-50"
              title="Refresh balances"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      )}

      {/* Loading chains / initial balances */}
      {initialLoading && (
        <div className="flex items-center justify-center py-8 text-sm text-[var(--wui-color-text-secondary)]">
          <Spinner className="h-4 w-4 mr-2" />
          Loading bridge routes
        </div>
      )}

      {/* No chains available */}
      {!initialLoading && status === 'idle' && chains.length === 0 && (
        <div className="text-center pt-6">
          <p className="text-sm text-[var(--wui-color-text-secondary)] mb-2">Bridge routes are currently unavailable.</p>
          <SecondaryButton onClick={onRetry}>Try again</SecondaryButton>
        </div>
      )}

      {/* Form (visible in idle state only) */}
      {!initialLoading && status === 'idle' && chains.length > 0 && (
        <>
          <p className="text-sm text-[var(--wui-color-text)] mb-3">
            {sourceIsAlgorand
              ? 'Bridge tokens from Algorand to your EVM accounts using '
              : 'Bridge tokens from your EVM accounts using '}
            <a
              href="https://allbridge.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
            >
              Allbridge
            </a>
          </p>

          {/* Source: Chain + Token selectors */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--wui-color-text-secondary)] mb-1">
              From
              {sourceIsAlgorand
                ? algorandAddress
                  ? ` ${formatShortAddr(algorandAddress)}`
                  : ''
                : evmAddress
                  ? ` ${formatShortAddr(evmAddress)}`
                  : ''}{' '}
              on
            </label>
            <div className="flex gap-2">
              <AssetSelect
                value={sourceChainSymbol ?? ''}
                onChange={onSourceChainChange}
                options={sourceChainOptions}
                className="flex-1"
                hideIcons
              />
              <AssetSelect
                value={sourceTokenSymbol ?? ''}
                onChange={onSourceTokenChange}
                options={sourceTokenOptions}
                className="w-[120px] shrink-0"

              />
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--wui-color-text-secondary)] mb-1">Amount</label>
            <input
              autoFocus={autoFocusAmount}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9.]/g, ''))}
              className={`w-full rounded-lg border bg-[var(--wui-color-bg-secondary)] py-2.5 px-3 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-secondary)] focus:outline-none focus:ring-2 focus:border-transparent ${insufficientFunds ? 'border-red-500 focus:ring-red-500/30' : 'border-[var(--wui-color-border)] focus:ring-[var(--wui-color-primary)]'}`}
            />
            {insufficientFunds && (
              <p className="mt-1 text-xs text-red-500">
                Insufficient balance
                {sourceBalanceFloat != null ? ` (${sourceBalanceFloat.toFixed(2)} ${sourceTokenSymbol ?? ''} available)` : ''}
              </p>
            )}
          </div>

          {/* Destination: chain + token */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--wui-color-text-secondary)] mb-1">
              To
              {!sourceIsAlgorand
                ? algorandAddress
                  ? ` ${formatShortAddr(algorandAddress)}`
                  : ''
                : evmAddress
                  ? ` ${formatShortAddr(evmAddress)}`
                  : ''}{' '}
              on
            </label>
            <div className="flex gap-2 items-center">
              {destinationChains.length > 0 && onDestinationChainChange ? (
                <AssetSelect
                  value={destinationChainSymbol ?? ''}
                  onChange={onDestinationChainChange}
                  options={destChainOptions}
                  className="flex-1"
                  hideIcons
                />
              ) : (
                <div className="flex-1 rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] py-2.5 px-3 text-sm text-[var(--wui-color-text-secondary)]">
                  Algorand
                </div>
              )}
              <AssetSelect
                value={destinationTokenSymbol ?? ''}
                onChange={onDestinationTokenChange}
                options={destTokenOptions}
                className="w-[120px] shrink-0"

              />
            </div>
          </div>

          {/* Estimated receive */}
          <div className="mb-3 rounded-lg bg-[var(--wui-color-bg-secondary)] p-3 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--wui-color-text-secondary)]">You receive</span>
              <span className="text-[var(--wui-color-text-secondary)]">
                {quoteLoading ? (
                  <Spinner className="h-3 w-3 inline" />
                ) : receivedAmount ? (
                  `${receivedAmount} ${destinationTokenSymbol ?? ''}`
                ) : (
                  '--'
                )}
              </span>
            </div>
            {extraGasAlgo && (
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-[var(--wui-color-text-secondary)]">You receive (extra gas)</span>
                <span className="text-[var(--wui-color-text-secondary)]">{extraGasAlgo}</span>
              </div>
            )}
            {(gasFee || totalFee || gasFeeLoading) && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--wui-color-text-secondary)]">Network fee</span>
                <span className="text-[var(--wui-color-text-secondary)]">
                  {gasFeeLoading ? <Spinner className="h-2.5 w-2.5 inline" /> : `${networkFeeDisplay}${gasFeeUnit ? ` ${gasFeeUnit}` : ''}`}
                </span>
              </div>
            )}
            {estimatedTimeMs != null && estimatedTimeMs > 0 && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--wui-color-text-secondary)]">Estimated time</span>
                <span className="text-[var(--wui-color-text-secondary)]">~{formatTimeRemaining(estimatedTimeMs)}</span>
              </div>
            )}
          </div>

          {/* Bridge button (or pre-sign info gate) */}
          {bridgeSignPending && bridgeSignNotice ? (
            <div
              role="dialog"
              className="w-full flex flex-col gap-3 p-4 rounded-xl border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] text-[var(--wui-color-text)]"
            >
              {bridgeSignNotice.title ? (
                <h3 className="text-sm font-semibold">{bridgeSignNotice.title}</h3>
              ) : null}
              <div className="text-sm leading-relaxed">{bridgeSignNotice.body}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBridgeSignPending(false)}
                  className="flex-1 py-2 px-4 bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBridgeSignPending(false)
                    onBridge()
                  }}
                  className="flex-1 py-2 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (bridgeSignNotice) {
                  setBridgeSignPending(true)
                } else {
                  onBridge()
                }
              }}
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Bridge
            </button>
          )}

          {bridgeFooter ? (
            <div className="w-full py-2.5 px-4 text-xs text-[var(--wui-color-text-secondary)]">
              {bridgeFooter}
            </div>
          ) : null}
        </>
      )}

      {/* Processing states */}
      {status === 'permit-signing' && <StatusSpinner message="Signing permit" />}
      {status === 'approving' && <StatusSpinner message="Checking capabilities" />}
      {status === 'bundling' && <StatusSpinner message="Confirm approval + bridge in wallet" />}
      {status === 'signing' && <StatusSpinner message="Confirm in wallet" />}
      {status === 'opting-in' && !sourceIsAlgorand && <StatusSpinner message="Sign USDC opt-in for Algorand" />}
      {status === 'sending' && <StatusSpinner message="Sending bridge transaction" />}

      {/* Waiting / progress */}
      {(status === 'waiting' || status === 'watching-funding' || status === 'opt-in-sent') && (
        <BridgeProgress
          amount={amount}
          sourceTokenSymbol={sourceTokenSymbol}
          sourceChainName={sourceChain?.chainName ?? null}
          destinationChainName={destinationChains.find((c) => c.chainSymbol === destinationChainSymbol)?.chainName ?? null}
          transferStatus={transferStatus}
          estimatedTimeMs={estimatedTimeMs}
          waitingSince={waitingSince}
          optInNeeded={optInNeeded}
          optInSigned={optInSigned}
          watchingForFunding={watchingForFunding}
          optInConfirmed={optInConfirmed}
          sourceTxId={sourceTxId}
          explorerAddress={sourceIsAlgorand ? algorandAddress : evmAddress}
        />
      )}

      {/* Success */}
      {status === 'success' && (
        <div className="text-center pt-4">
          <CheckCircleFilled className="h-8 w-8 mx-auto mb-2 text-green-500" />
          {receivedAmount && destinationTokenSymbol && (
            <p className="mt-1.5 text-sm text-[var(--wui-color-text-secondary)]">
              {sourceChainSymbol === 'ALG' ? 'Sent' : 'Received'}{' '}
              <span className="font-medium text-[var(--wui-color-text)]">
                {receivedAmount} {destinationTokenSymbol}
              </span>
            </p>
          )}
          {sourceTxId && (
            <div className="mt-1.5">
              <TxLine label="Source TX" txId={sourceTxId} />
            </div>
          )}
          {destinationTxId && (
            <p className="mt-1 text-xs text-[var(--wui-color-text-secondary)] flex items-center justify-center">
              <span className="inline-flex items-baseline gap-1">
                <span>Destination TX:</span>
                {destinationChainSymbol === 'ALG' ? (
                  <a
                    href={`https://allo.info/tx/${destinationTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
                  >
                    {formatShortAddr(destinationTxId)}
                  </a>
                ) : (
                  <span className="font-mono">{formatShortAddr(destinationTxId)}</span>
                )}
              </span>
              {destinationChainSymbol !== 'ALG' && (
                <CopyButton text={destinationTxId} variant="icon" title="Copy destination transaction ID" />
              )}
            </p>
          )}

          {(evmAddress || algorandAddress) && (
            <div className="flex items-center justify-center text-xs mt-1">
              <AllbridgeExplorerLink address={(sourceIsAlgorand ? algorandAddress : evmAddress)!} muted>
                Allbridge Explorer
              </AllbridgeExplorerLink>
            </div>
          )}
          <SecondaryButton onClick={onReset} className="mt-3">Close</SecondaryButton>
        </div>
      )}

      {/* Error panel */}
      {status === 'error' && (
        <div className="text-center pt-4">
          <XCircleFilled className="h-8 w-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-[var(--wui-color-text)] mb-1">Bridge failed</p>
          {error && <p className="text-xs text-red-500 break-words mb-1.5">{error}</p>}
          {sourceTxId && <TxLine label="TX" txId={sourceTxId} />}
          <SecondaryButton onClick={onRetry} className="mt-3">Try again</SecondaryButton>
        </div>
      )}
    </>
  )
}

// -- Bridge progress sub-component --

interface BridgeProgressProps {
  amount: string
  sourceTokenSymbol: string | null
  sourceChainName: string | null
  destinationChainName: string | null
  transferStatus: BridgeTransferStatus | null
  estimatedTimeMs: number | null
  waitingSince: number | null
  optInNeeded: boolean
  optInSigned: boolean
  watchingForFunding: boolean
  optInConfirmed: boolean
  sourceTxId: string | null
  explorerAddress: string | null
}

function Countdown({ estimatedTimeMs, waitingSince }: { estimatedTimeMs: number; waitingSince: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const elapsed = now - waitingSince
  const remaining = Math.max(0, estimatedTimeMs - elapsed)

  return (
    <p className="text-center text-xs text-[var(--wui-color-text-secondary)] mt-3">
      {remaining <= 0 ? 'Arriving about now' : `~${formatTimeRemaining(remaining)} remaining`}
    </p>
  )
}

function BridgeProgress({
  amount,
  sourceTokenSymbol,
  sourceChainName,
  destinationChainName,
  transferStatus,
  estimatedTimeMs,
  waitingSince,
  optInNeeded,
  optInSigned,
  watchingForFunding,
  optInConfirmed,
  sourceTxId,
  explorerAddress,
}: BridgeProgressProps) {
  const sendDone =
    transferStatus != null &&
    transferStatus.sendConfirmationsNeeded > 0 &&
    transferStatus.sendConfirmations >= transferStatus.sendConfirmationsNeeded
  const sigsDone =
    transferStatus != null && transferStatus.signaturesNeeded > 0 && transferStatus.signaturesCount >= transferStatus.signaturesNeeded
  const receiveDone =
    transferStatus?.receiveConfirmations != null &&
    transferStatus.receiveConfirmationsNeeded != null &&
    transferStatus.receiveConfirmations >= transferStatus.receiveConfirmationsNeeded

  return (
    <div className="py-4 flex flex-col">
      {/* Header */}
      <p className="text-sm text-[var(--wui-color-text)] text-center mb-2">
        Bridging {amount} {sourceTokenSymbol ?? 'USDC'} from {sourceChainName ?? 'EVM'} to {destinationChainName ?? 'Algorand'} using{' '}
        <a
          href="https://allbridge.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
        >
          Allbridge
        </a>
      </p>

      <p className="text-sm text-[var(--wui-color-text-secondary)] text-center mb-4">
        You can safely minimize this dialog and browse, just stay within the site to ensure your transaction completes as expected.
      </p>

      <div className="inline-flex flex-col gap-3 self-center">
        {/* Source confirmations */}
        <div className="flex items-center gap-2 text-xs">
          <StepIcon done={sendDone} active={true} />
          <span className="text-[var(--wui-color-text-secondary)]">
            Source confirmation
            {transferStatus && !sendDone && (
              <span className="ml-1 text-[var(--wui-color-text-secondary)]">
                {transferStatus.sendConfirmations}/{transferStatus.sendConfirmationsNeeded}
              </span>
            )}
          </span>
        </div>

        {/* Validator signatures */}
        <div className="flex items-center gap-2 text-xs">
          <StepIcon done={sigsDone} active={sendDone} />
          <span className="text-[var(--wui-color-text-secondary)]">
            Validator signatures
            {transferStatus && sendDone && !sigsDone && (
              <span className="ml-1 text-[var(--wui-color-text-secondary)]">
                {transferStatus.signaturesCount}/{transferStatus.signaturesNeeded}
              </span>
            )}
          </span>
        </div>

        {/* Opt-in status (conditional) */}
        {optInNeeded && (
          <div className="flex items-center gap-2 text-xs">
            <StepIcon done={optInConfirmed} active={optInSigned || watchingForFunding} />
            <span className="text-[var(--wui-color-text-secondary)]">
              {optInConfirmed
                ? 'USDC opt-in confirmed'
                : watchingForFunding
                  ? 'Waiting to opt in'
                  : optInSigned
                    ? 'Submitting opt-in'
                    : 'USDC opt-in pending'}
            </span>
          </div>
        )}

        {/* Destination delivery */}
        <div className="flex items-center gap-2 text-xs">
          <StepIcon done={receiveDone} active={sendDone && sigsDone} />
          <span className="text-[var(--wui-color-text-secondary)]">
            Destination delivery
            {transferStatus?.receiveConfirmations != null && transferStatus.receiveConfirmationsNeeded != null && !receiveDone && (
              <span className="ml-1 text-[var(--wui-color-text-secondary)]">
                {transferStatus.receiveConfirmations}/{transferStatus.receiveConfirmationsNeeded}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ETA countdown */}
      {estimatedTimeMs != null && waitingSince != null && !receiveDone && (
        <Countdown estimatedTimeMs={estimatedTimeMs} waitingSince={waitingSince} />
      )}

      {sourceTxId && (
        <div className="mt-3">
          <TxLine label="Source TX" txId={sourceTxId} />
        </div>
      )}

      {explorerAddress && (
        <div className="flex items-center justify-center text-xs mt-3">
          <AllbridgeExplorerLink address={explorerAddress}>
            View on Allbridge
          </AllbridgeExplorerLink>
        </div>
      )}
    </div>
  )
}

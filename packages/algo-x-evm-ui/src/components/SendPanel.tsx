import { useRef, useState, useMemo } from 'react'
import { AlgoSymbol } from './AlgoSymbol'
import { AssetSelect } from './AssetSelect'
import { BackButton } from './BackButton'
import { SecondaryButton } from './SecondaryButton'
import type { AssetHoldingDisplay } from './ManagePanel'
import { Spinner } from './Spinner'
import { TransactionStatus, type TransactionStatusValue } from './TransactionStatus'

const FEE_RESERVE = 0.1
const MIN_TXN_FEE = 0.001
const BASE_MBR = 0.1
const ALGO_ICON = <AlgoSymbol scale={1} />

export interface SendPanelProps {
  activeAddress?: string | null
  sendType: 'algo' | 'asa'
  setSendType: (type: 'algo' | 'asa') => void
  receiver: string
  setReceiver: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  assetIdInput: string
  setAssetIdInput: (v: string) => void
  assetInfo: { name: string; unitName: string; index: number } | null
  assetLookupLoading: boolean
  assetLookupError: string | null
  receiverOptInStatus?: 'idle' | 'checking' | 'opted-in' | 'not-opted-in'
  receiverAddressError?: string | null
  optOut?: boolean
  setOptOut?: (value: boolean) => void
  closeAlgoAccount?: boolean
  setCloseAlgoAccount?: (value: boolean) => void
  txId?: string | null
  explorerUrl?: string | null
  accountAssets?: AssetHoldingDisplay[]
  totalBalance?: number | null
  availableBalance?: number | null
  status: TransactionStatusValue
  error: string | null
  handleSend: () => void
  reset: () => void
  retry: () => void
  onBack: () => void
}

export function SendPanel({
  activeAddress,
  sendType,
  setSendType,
  receiver,
  setReceiver,
  amount,
  setAmount,
  assetIdInput,
  setAssetIdInput,
  assetInfo,
  assetLookupLoading,
  assetLookupError,
  receiverOptInStatus,
  receiverAddressError,
  optOut,
  setOptOut,
  closeAlgoAccount: _closeAlgoAccount,
  setCloseAlgoAccount,
  txId,
  explorerUrl,
  accountAssets,
  totalBalance,
  availableBalance,
  status,
  error,
  handleSend,
  reset: _reset,
  retry,
  onBack,
}: SendPanelProps) {
  const handleAssetChange = (value: string) => {
    if (value === 'algo') {
      setSendType('algo')
      setAssetIdInput('')
    } else {
      setSendType('asa')
      setAssetIdInput(value)
      setShowReserveOption(false)
    }
    setAmount('')
  }

  const selectedValue = sendType === 'algo' ? 'algo' : assetIdInput

  const selectedAsset = accountAssets?.find((a) => String(a.assetId) === assetIdInput)

  const assetOptions = useMemo(() => {
    const opts: { value: string; label: string; logo?: string | null; icon?: React.ReactNode; verificationTier?: AssetHoldingDisplay['verificationTier'] }[] = [{ value: 'algo', label: 'ALGO', icon: ALGO_ICON }]
    if (accountAssets) {
      for (const a of accountAssets) {
        opts.push({
          value: String(a.assetId),
          label: a.unitName || a.name,
          logo: a.logo,
          verificationTier: a.verificationTier,
        })
      }
    }
    return opts
  }, [accountAssets])

  const sendLabel = sendType === 'algo' ? 'ALGO' : assetInfo?.unitName || assetInfo?.name || 'Asset'

  const [reserveFees, setReserveFees] = useState(true)
  const [showReserveOption, setShowReserveOption] = useState(false)
  const receiverInputRef = useRef<HTMLInputElement>(null)

  // Account can close out when MBR is baseline (no asset opt-ins)
  const canCloseOut = totalBalance != null && availableBalance != null && Math.abs(totalBalance - availableBalance - BASE_MBR) < 0.000001

  // When closing out, use total balance; otherwise use available balance
  const isClosingOut = showReserveOption && !reserveFees && canCloseOut



  // Balance label — shows "Total:" when closing out, "Available:" otherwise
  const algoBalanceLabel = (() => {
    if (sendType !== 'algo') return null
    if (isClosingOut && totalBalance != null) {
      return `Total: ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ALGO`
    }
    if (availableBalance != null) {
      return `Available: ${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ALGO`
    }
    return null
  })()

  const availableLabel =
    algoBalanceLabel ??
    (sendType === 'asa' && selectedAsset ? `Available: ${selectedAsset.amount} ${selectedAsset.unitName || selectedAsset.name}` : null)

  const computeAlgoMax = (reserve: boolean) => {
    if (reserve) {
      if (availableBalance == null) return '0'
      const max = Math.max(0, availableBalance - FEE_RESERVE)
      return max.toFixed(6).replace(/\.?0+$/, '') || '0'
    }
    if (canCloseOut && totalBalance != null) {
      const max = Math.max(0, totalBalance - MIN_TXN_FEE)
      return max.toFixed(6).replace(/\.?0+$/, '') || '0'
    }
    if (availableBalance == null) return '0'
    const max = Math.max(0, availableBalance)
    return max.toFixed(6).replace(/\.?0+$/, '') || '0'
  }

  const handleMax = () => {
    if (sendType === 'algo' && availableBalance != null) {
      setShowReserveOption(true)
      setAmount(computeAlgoMax(reserveFees))
      // showReserveOption is now true; sync close-out flag
      setCloseAlgoAccount?.(!reserveFees && canCloseOut)
    } else if (sendType === 'asa' && selectedAsset) {
      setShowReserveOption(false)
      setAmount(selectedAsset.amount)
    }
    receiverInputRef.current?.focus()
  }

  const handleToggleReserve = () => {
    const next = !reserveFees
    setReserveFees(next)
    setAmount(computeAlgoMax(next))
    // Sync close-out flag: closing out when reserve is off and account can close
    setCloseAlgoAccount?.(showReserveOption && !next && canCloseOut)
  }

  // Overspend check — use totalBalance when closing out
  const parsedAmount = amount !== '' ? parseFloat(amount) : NaN
  const algoSpendLimit = isClosingOut ? (totalBalance ?? availableBalance) : availableBalance
  const isOverspend =
    !isNaN(parsedAmount) &&
    parsedAmount > 0 &&
    ((sendType === 'algo' && algoSpendLimit != null && parsedAmount > algoSpendLimit) ||
      (sendType === 'asa' && selectedAsset != null && parsedAmount > parseFloat(selectedAsset.amount)))

  // Full balance ASA send — show opt-out option
  const isZeroAsaBalance = sendType === 'asa' && selectedAsset != null && parseFloat(selectedAsset.amount) === 0
  const isFullAsaAmount = sendType === 'asa' && selectedAsset != null && amount !== '' && amount === selectedAsset.amount

  // When opting out of a zero-balance asset, auto-fill receiver with self and set amount to 0
  const isZeroBalanceOptOut = isZeroAsaBalance && optOut === true

  const optOutLabel = selectedAsset?.unitName || selectedAsset?.name || assetInfo?.unitName || assetInfo?.name || 'this asset'

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BackButton onClick={onBack} />
        <h3 className="text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">Send</h3>
      </div>

      {/* Send controls (hidden during/after transaction) */}
      {status === 'idle' && (
        <>
          {/* Label */}
          <p className="text-sm text-[var(--wui-color-text)] mb-4">Send ALGO or assets to any Algorand address</p>

          {/* Available balance */}
          {availableLabel && <p className="self-end text-xs text-[var(--wui-color-text-secondary)] mb-1">{availableLabel}</p>}

          {/* Amount + asset selector */}
          <div className="mb-3 flex gap-2">
            <div className="flex-1 min-w-0 relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Amount"
                autoFocus={true}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] py-2.5 px-3 pr-12 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleMax}
                className="absolute right-2 inset-y-0 my-auto h-fit text-[10px] font-medium text-[var(--wui-color-primary)] bg-[var(--wui-color-bg-tertiary)] rounded px-1.5 py-0.5 hover:brightness-90 transition-all"
              >
                max
              </button>
            </div>
            <AssetSelect
              value={selectedValue}
              onChange={handleAssetChange}
              className="w-[160px] shrink-0"
              options={assetOptions}
            />
          </div>

          {/* Reserve fees checkbox (shown after clicking MAX on ALGO) */}
          {sendType === 'algo' && showReserveOption && (
            <label className="flex items-center gap-1.5 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reserveFees}
                onChange={handleToggleReserve}
                className="accent-[var(--wui-color-primary)] h-3.5 w-3.5"
              />
              <span className="text-xs text-[var(--wui-color-text-secondary)]">Save some for transaction costs</span>
            </label>
          )}

          {/* Overspend warning */}
          {isOverspend && <p className="mb-3 text-xs text-[var(--wui-color-danger-text)]">Amount exceeds available balance</p>}

          {/* Asset lookup feedback */}
          {sendType === 'asa' && (
            <>
              {assetLookupLoading && (
                <div className="flex items-center mb-3 text-xs text-[var(--wui-color-text-secondary)]">
                  <Spinner className="h-3 w-3 mr-1.5" />
                  Looking up asset
                </div>
              )}
              {assetLookupError && <p className="mb-3 text-xs text-[var(--wui-color-danger-text)] break-words">{assetLookupError}</p>}
            </>
          )}

          {/* Receiver address (hidden for zero-balance opt-out) */}
          {!isZeroBalanceOptOut && (
            <div className="mb-3">
              <input
                ref={receiverInputRef}
                type="text"
                placeholder="Receiver ALGO address"
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                className="w-full rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] py-2.5 px-3 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
              />
            </div>
          )}

          {/* Invalid receiver address */}
          {receiverAddressError && !isZeroBalanceOptOut && (
            <p className="mb-3 text-xs text-[var(--wui-color-danger-text)] break-words">{receiverAddressError}</p>
          )}

          {/* Receiver opt-in check feedback */}
          {sendType === 'asa' && receiverOptInStatus === 'not-opted-in' && !isZeroBalanceOptOut && (
            <p className="mb-3 text-xs text-[var(--wui-color-danger-text)]">Receiver has not opted into this asset</p>
          )}

          {/* Opt-out checkbox (shown when sending full ASA balance or zero-balance asset) */}
          {(isFullAsaAmount || isZeroAsaBalance) && setOptOut && (
            <div className="mb-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={optOut ?? false}
                  onChange={() => {
                    const next = !optOut
                    setOptOut(next)
                    if (next && isZeroAsaBalance && activeAddress) {
                      setReceiver(activeAddress)
                      setAmount('0')
                    }
                  }}
                  className="accent-[var(--wui-color-primary)] h-3.5 w-3.5"
                />
                <span className="text-xs text-[var(--wui-color-text-secondary)]">Opt out of {optOutLabel}</span>
              </label>
              {optOut && (
                <p className="mt-1 ml-5 text-xs text-[var(--wui-color-text-secondary)] leading-relaxed">
                  You will not be able to receive {optOutLabel} until you opt back in. This will reclaim 0.1Ⱥ available balance.
                </p>
              )}
            </div>
          )}

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={
              !receiver ||
              !amount ||
              !!receiverAddressError ||
              isOverspend ||
              (sendType === 'asa' && !assetInfo) ||
              (sendType === 'asa' && receiverOptInStatus !== 'opted-in' && receiverOptInStatus !== 'idle')
            }
            className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendType === 'asa' && receiverOptInStatus === 'checking'
              ? 'Verifying'
              : isZeroBalanceOptOut
                ? `Opt out of ${optOutLabel}`
                : `Send ${sendLabel}`}
          </button>
        </>
      )}

      <TransactionStatus
        status={status}
        error={error}
        successMessage="Sent successfully!"
        onRetry={retry}
        txId={txId}
        explorerUrl={explorerUrl}
      />

      {status === 'success' && (
        <SecondaryButton onClick={onBack} className="mt-3">Back</SecondaryButton>
      )}
    </>
  )
}

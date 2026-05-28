import type { TransactionData, AssetInfo } from '../types'
import { formatAssetAmount, assetLabel } from '../formatters'

const ARROW = <span className="text-[var(--wui-color-text-secondary)] px-2">&rarr;</span>
const DASH = <span className="text-[var(--wui-color-text-secondary)] px-2">&mdash;</span>
const EMPTY_ESCROWS: Record<string, string> = {}
const FLOW_COLS = 'w-full grid grid-cols-[1fr_auto_1fr] items-center text-xs'

export interface TransactionFlowProps {
  txn: TransactionData
  assetInfo?: AssetInfo
  appEscrows?: Record<string, string>
}

export function TransactionFlow({ txn, assetInfo, appEscrows = EMPTY_ESCROWS }: TransactionFlowProps) {
  const resolveAddr = (full: string | undefined, short: string): string => (full && appEscrows[full]) || short

  const isOptIn =
    txn.type === 'axfer' && txn.sender === txn.receiver && (txn.rawAmount === 0n || txn.rawAmount === '0' || txn.rawAmount === undefined)

  const amountDisplay = (): string => {
    if (txn.type === 'pay') return txn.amount || '0 ALGO'
    if (txn.type === 'axfer') {
      return assetInfo ? formatAssetAmount(txn.rawAmount, assetInfo) : `${txn.amount || '0'} ${assetLabel(txn)}`
    }
    return ''
  }

  const hasRekey = !!txn.rekeyToShort
  const hasClose = !!txn.closeRemainderToShort

  /** Summary line per transaction type */
  const renderSummary = () => {
    switch (txn.type) {
      case 'pay':
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} {amountDisplay()} {ARROW}
            </span>
            <span className="text-[var(--wui-color-text-secondary)] truncate text-right">
              {resolveAddr(txn.receiver, txn.receiverShort!)}
            </span>
          </div>
        )

      case 'axfer':
        if (isOptIn) {
          return (
            <div className={FLOW_COLS}>
              <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
              <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
                {DASH} Opt In {ARROW}
              </span>
              <span className="text-[var(--wui-color-text-secondary)] truncate text-right">
                {assetLabel(txn, assetInfo)}
              </span>
            </div>
          )
        }
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} {amountDisplay()} {ARROW}
            </span>
            <span className="text-[var(--wui-color-text-secondary)] truncate text-right">
              {resolveAddr(txn.receiver, txn.receiverShort!)}
            </span>
          </div>
        )

      case 'afrz':
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} {txn.isFreezing ? 'Freeze' : 'Unfreeze'} {assetLabel(txn, assetInfo)} {ARROW}
            </span>
            <span className="text-[var(--wui-color-text-secondary)] truncate text-right">{txn.freezeTargetShort}</span>
          </div>
        )

      case 'acfg':
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} Configure {ARROW}
            </span>
            <span className="text-[var(--wui-color-primary)] font-medium truncate text-right">
              {txn.assetIndex ? assetLabel(txn, assetInfo) : 'New Asset'}
            </span>
          </div>
        )

      case 'appl':
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} App Call {ARROW}
            </span>
            <span className="text-[var(--wui-color-text-secondary)] whitespace-nowrap text-right">
              {txn.appIndex ? `#${txn.appIndex}` : 'New App'}
            </span>
          </div>
        )

      case 'keyreg':
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} Key Reg {ARROW}
            </span>
            <span className="text-[var(--wui-color-text-secondary)] truncate text-right">
              {txn.voteKey ? 'Online' : 'Offline'}
            </span>
          </div>
        )

      default:
        return (
          <div className={FLOW_COLS}>
            <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.senderShort}</span>
            <span className="text-[var(--wui-color-primary)] font-medium whitespace-nowrap text-center">
              {DASH} {txn.typeLabel} {ARROW}
            </span>
            <span />
          </div>
        )
    }
  }

  const renderWarnings = () => {
    if (!hasRekey && !hasClose) return null
    return (
      <div className="flex flex-col gap-1 mt-1.5">
        {hasRekey && (
          <div className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 bg-[var(--wui-color-danger-bg)]">
            <span className="text-[var(--wui-color-danger-text)] font-bold">REKEY</span>
            <span className="text-[var(--wui-color-danger-text)]">
              {txn.senderShort} &rarr; {txn.rekeyToShort}
            </span>
          </div>
        )}
        {hasClose && (
          <div className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 bg-[var(--wui-color-danger-bg)]">
            <span className="text-[var(--wui-color-danger-text)] font-bold">CLOSE</span>
            <span className="text-[var(--wui-color-danger-text)]">Balance Remainder &rarr; {txn.closeRemainderToShort}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Summary row */}
      <div className="flex items-center">{renderSummary()}</div>

      {/* Note */}
      {txn.note && (
        <div className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 mt-1.5 bg-[var(--wui-color-bg-tertiary)] transition-colors group-hover:brightness-95">
          <span className="text-[var(--wui-color-text-secondary)] font-medium">NOTE</span>
          <span className="text-[var(--wui-color-text-secondary)] truncate">{txn.note}</span>
        </div>
      )}

      {/* Warnings (always visible) */}
      {renderWarnings()}
    </div>
  )
}

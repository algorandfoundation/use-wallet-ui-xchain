import { useEffect, useState, type ReactNode } from 'react'
import { TransactionFlow } from './TransactionFlow'
import { TransactionDetail } from './TransactionDetail'
import { ChevronRight, ArrowUpRight, Clipboard, Check, Eye } from './icons'
import { Spinner } from './Spinner'
import { useTransactionData } from '../hooks/useTransactionData'
import type { TransactionData, TransactionDanger, AssetLookupClient } from '../types'
import { DOCS_PORTAL_URL } from '../constants'
import { isWalletInAppBrowser } from '../utils/browserEnv'
import { withReturnHint } from '../utils/verifyTransport'

/** Well-known Algorand network genesis hashes (base64-encoded). */
const GENESIS_HASH_NETWORK: Record<string, string> = {
  'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=': 'MainNet',
  'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=': 'TestNet',
  'mFgazF+2uRS1tMiL9dsj01hJGySEmPN28B/TjjvpVW0=': 'BetaNet',
  'kUt08LxeVAAGHnh4JoAoAMM9ql/hBwSoiFtlnKNeOxA=': 'FNet',
  // LocalNet hashes vary per setup — resolved via genesisID fallback
}

/** LocalNet genesis IDs use "sandnet-*" or "dockernet-*" prefixes. */
function isLocalNetGenesisID(genesisID: string): boolean {
  return genesisID.startsWith('sandnet') || genesisID.startsWith('dockernet')
}

function resolveNetworkName(genesisHash: string | null | undefined, genesisID: string | null | undefined): string | null {
  if (genesisHash) {
    const name = GENESIS_HASH_NETWORK[genesisHash]
    if (name) return name
  }
  if (genesisID && isLocalNetGenesisID(genesisID)) {
    return 'LocalNet'
  }
  return null
}

/**
 * Split a hex id into 4-char groups for chunked display. Strips an optional `0x` prefix. 
 */
function chunkHexId(value: string): string[] {
  const hex = value.startsWith('0x') ? value.slice(2) : value
  return hex.match(/.{1,4}/g) ?? []
}

export interface TransactionReviewProps {
  transactions: TransactionData[]
  message: string
  dangerous: TransactionDanger
  algodClient?: AssetLookupClient
  getApplicationAddress?: (appId: number) => { toString(): string }
  onApprove: () => void
  onReject: () => void
  signing?: boolean
  walletName?: string
  walletIcon?: string
  origin?: string
  headerAction?: ReactNode
  payloadVerified?: boolean | null
  network?: string
  /** Base64-encoded genesis hash from the transaction group */
  genesisHash?: string | null
  /** Genesis ID string from the transaction group (fallback for LocalNet detection) */
  genesisID?: string | null
  /** Read-only mode to display on verify view - suppresses the action footer and more. */
  verifyDisplayMode?: boolean
  /** When provided, renders a Verify button in the footer. */
  verifyUrl?: string
  /** When true, shows a notice that this request was restored after a page reload. */
  restored?: boolean
  /** False for partial signs (e.g. swap) that can't be persisted/restored.  */
  restorable?: boolean
}

export function TransactionReview({
  transactions,
  message,
  dangerous,
  algodClient,
  getApplicationAddress,
  onApprove,
  onReject,
  signing,
  walletName,
  walletIcon,
  origin,
  headerAction,
  payloadVerified,
  network,
  genesisHash,
  genesisID,
  verifyDisplayMode,
  verifyUrl,
  restored,
  restorable,
}: TransactionReviewProps) {
  const { loading, assets, appEscrows } = useTransactionData(transactions, {
    algodClient,
    getApplicationAddress,
    network,
  })

  /** Index into transactions array for detail view, or null for list view */
  const [detailIndex, setDetailIndex] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [chunkTxId, setChunkTxId] = useState(false)

  const embeddedBrowser = isWalletInAppBrowser()
  const verifyBlocked = embeddedBrowser && restorable === false

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  function openVerifyUrl() {
    if (!verifyUrl) return
    if (embeddedBrowser) {
      // Wallet in-app browsers are single-tab webviews, so navigate deliberately with the hint. 
      // The portal shows a "Back to app" button; returning resumes from the persisted-sign restore.
      window.location.assign(withReturnHint(verifyUrl))
    } else {
      // Desktop and regular mobile: a real new tab keeps the app tab (and its pending sign
      // promise) alive while the user reviews on the portal. 
      window.open(verifyUrl, '_blank', 'noopener')
    }
  }

  // Animate on mount and when returning from detail view
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    setEntered(false)
    requestAnimationFrame(() => setEntered(true))
  }, [detailIndex])

  const networkName = resolveNetworkName(genesisHash, genesisID)
  const unknownNetwork = genesisHash != null && !networkName

  // Detail view — replaces entire dialog content
  if (detailIndex !== null) {
    const txn = transactions[detailIndex]
    return (
      <TransactionDetail
        txn={txn}
        assetInfo={txn.assetIndex ? assets[txn.assetIndex.toString()] : undefined}
        position={detailIndex + 1}
        groupSize={transactions.length}
        onBack={() => setDetailIndex(null)}
        onPrev={() => setDetailIndex(detailIndex - 1)}
        onNext={() => setDetailIndex(detailIndex + 1)}
      />
    )
  }

  /** 
   * When only one dangerous transaction, show full text. 
   * When multiple dangerous txs are stacked, show shorter text versions with bullets. 
   */
  function renderDangerText() {
    if (!dangerous) return null
    const closeAssetTxns = transactions.filter((t) => t.closeRemainderTo && t.type === 'axfer')

    if (dangerous.length > 1) {
      const closeAlgoTxn = transactions.find((t) => t.closeRemainderTo && t.type === 'pay')
      return (
        <>
          This group contains multiple dangerous operations:
          <ul className="mt-1 mb-1 pl-2 list-disc list-inside font-normal space-y-0.5">
            {dangerous.includes('rekey') && <li>Rekey: transfer signing authority to a different address.</li>}
            {closeAlgoTxn && <li>Close account: transfer all ALGO balance to another address.</li>}
            {closeAssetTxns.map((t) => {
              const info = t.assetIndex ? assets[t.assetIndex.toString()] : undefined
              const unit = info?.unitName || info?.name
              return <li key={t.index}>Close asset{unit ? ` ${unit}` : ''}: transfer all balance to another address.</li>
            })}
          </ul>
          Confirm that this is what you intended.
        </>
      )
    }

    if (dangerous[0] === 'rekey') {
      return 'This transaction will rekey your account, transferring signing authority to a different address. You will no longer be able to sign transactions with your current key.'
    }

    if (closeAssetTxns[0]) {
      const info = closeAssetTxns[0].assetIndex ? assets[closeAssetTxns[0].assetIndex.toString()] : undefined
      const unit = info?.unitName || info?.name || 'balance'
      return `This transaction will transfer all available ${unit} to another address. Confirm that this is what you intended.`
    }

    return 'This transaction will transfer all ALGO balance to another address. Confirm that this is what you intended.'
  }

  // List view — default
  return (
    <div
      data-state={entered ? 'entered' : 'starting'}
      className="flex flex-col transition-all duration-150 ease-in-out data-[state=starting]:opacity-0 data-[state=entered]:opacity-100"
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-6 ${verifyDisplayMode ? 'pt-4' : 'pt-2'} pb-1`}>
        <div>
          <h2 className={`text-lg font-bold ${dangerous ? 'text-[var(--wui-color-danger-text)]' : 'text-[var(--wui-color-text)]'}`}>
            {dangerous ? 'Review Dangerous ' : 'Review '}
            Transaction{transactions.length > 1 ? 's' : ''}
          </h2>
          {/* Origin */}
          {origin && <div className={`mb-2 mt-0.5 text-xs truncate ${dangerous ? 'text-[var(--wui-color-danger-text)]' : 'text-[var(--wui-color-text)]'}`}>{origin}</div>}
        </div>
        {headerAction}
      </div>

      {/* Danger description */}
      {dangerous && (
        <div className="px-6 pb-3 text-sm font-bold text-[var(--wui-color-danger-text)]">
          {renderDangerText()}{' '}
          <a
            className="underline font-normal text-inherit"
            rel="noopener noreferrer"
            target="_blank"
            href={`${DOCS_PORTAL_URL}/signing-transactions#dangerous-transactions`}
          >Learn more<ArrowUpRight size={12} className="inline-block ml-0.5 -mt-0.5" /></a>
        </div>
      )}

      {/* Signing / verifying description */}
      <div className="px-6 pb-3 text-sm text-[var(--wui-color-text-secondary)]">
        {restored && (
          <div className="mb-2 mt-0.5 text-xs text-[var(--wui-color-text)]">
            Still pending - review and sign, or reject to discard.
          </div>
        )}
        {unknownNetwork && (
          <div className="font-bold text-[var(--wui-color-danger-text)] mb-1">Warning — unknown network genesis hash</div>
        )}
        {verifyDisplayMode ? (
          <>
            {transactions.length === 1 ? (
              networkName ? <>Verifying 1 <strong>{networkName}</strong> transaction.</> : 'Verifying 1 transaction.'
            ) : (
              networkName ? <>Verifying {transactions.length} <strong>{networkName}</strong> transactions.</> : `Verifying ${transactions.length} transactions.`
            )}
          </>
        ) : (
          <>
            {transactions.length === 1 ? (
              networkName ? <>Signing 1 <strong>{networkName}</strong> transaction</> : 'Signing 1 transaction'
            ) : (
              networkName ? <>Signing {transactions.length} <strong>{networkName}</strong> transactions</> : `Signing ${transactions.length} transactions`
            )}.{!dangerous && (
              <>{' '}<a
                className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
                rel="noopener noreferrer"
                target="_blank"
                href={`${DOCS_PORTAL_URL}/signing-transactions`}
              >Learn more<ArrowUpRight size={12} className="inline-block ml-0.5 -mt-0.5" /></a></>
            )}
          </>
        )}
      </div>

      {/* Transaction list */}
      <div className="px-4 pb-4 max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-[var(--wui-color-text-secondary)]">
            <Spinner className="h-4 w-4 mr-2" />
            Loading asset info
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((txn, i) => (
              <button
                key={txn.index}
                type="button"
                onClick={() => setDetailIndex(i)}
                className="group flex w-full text-left rounded-xl border border-[var(--wui-color-primary)] bg-[var(--wui-color-bg-secondary)] cursor-pointer hover:bg-[var(--wui-color-bg-tertiary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wui-color-primary)] focus-visible:ring-offset-1"
                aria-label={`View details for transaction ${i + 1}`}
              >
                <div className="flex-1 min-w-0 p-3">
                  <TransactionFlow
                    txn={txn}
                    assetInfo={txn.assetIndex ? assets[txn.assetIndex.toString()] : undefined}
                    appEscrows={appEscrows}
                  />
                </div>
                <div className="shrink-0 self-stretch flex items-center justify-center w-3.5 m-[3px] bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-primary)] rounded-l-[2px] rounded-r-[calc(var(--radius-xl)-3px)] transition-all group-hover:bg-[var(--wui-color-primary)] group-hover:text-[var(--wui-color-primary-text)]">
                  <ChevronRight size={10} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Payload verification warning */}
      {payloadVerified === false && (
        <div className="px-4 pb-4">
          <div className="text-sm font-bold text-[var(--wui-color-danger-text)] border border-[var(--wui-color-danger-text)] rounded-xl p-3 bg-[var(--wui-color-danger-bg)]">
            Payload verification failed. The provided payload was invalid and has been recalculated from the raw transactions.
          </div>
        </div>
      )}

      {/* Sign payload */}
      <div className="px-4 pb-4">
        <div className="relative text-sm flex items-center gap-2 border border-[var(--wui-color-border)] rounded-xl p-3">
          <div className="flex-1 min-w-0 flex flex-col gap-2 pr-7">
            <span>
              {verifyDisplayMode
                ? transactions.length > 1
                  ? 'Resulting transaction group ID:'
                  : 'Resulting transaction ID:'
                : `Ensure ${walletName ?? 'your wallet'} shows this transaction ID:`}
            </span>
            <div className="font-mono break-all text-[var(--wui-color-danger-text)] select-all">
              {chunkTxId ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,1fr))] gap-x-3 gap-y-1">
                  {chunkHexId(message).map((group, i) => (
                    <span key={i} className={i % 2 === 0 ? 'font-bold' : 'font-normal'}>
                      {group}
                    </span>
                  ))}
                </div>
              ) : (
                message
              )}
            </div>
          </div>
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setChunkTxId((c) => !c)}
              className={`p-1 rounded-md hover:text-[var(--wui-color-text)] hover:bg-[var(--wui-color-bg-tertiary)] transition-colors ${chunkTxId ? 'bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-primary)]' : 'text-[var(--wui-color-text-secondary)]'}`}
              aria-label={chunkTxId ? 'Show as one line' : 'Show in chunks'}
              aria-pressed={chunkTxId}
            >
              <Eye size={14} />
            </button>
            <button
              type="button"
              onClick={copyMessage}
              className="p-1 rounded-md text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text)] hover:bg-[var(--wui-color-bg-tertiary)] transition-colors"
              aria-label="Copy transaction ID"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Clipboard size={14} />}
            </button>
          </div>
          </div>
        </div>

      {/* Footer */}
      {!verifyDisplayMode && (
        signing ? (
          <div className="px-6 py-4 border-t border-[var(--wui-color-border)] flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--wui-color-text-secondary)]">
              <Spinner className="h-4 w-4 flex-shrink-0" />
              Review in {walletName || 'wallet'}
              {walletIcon && <img src={walletIcon} alt="" aria-hidden="true" className="h-4 w-4 rounded-sm flex-shrink-0" />}
            </div>
            {verifyUrl && !embeddedBrowser && (
              <button
                type="button"
                onClick={openVerifyUrl}
                className="w-full py-2.5 px-4 bg-[var(--wui-color-verify)] text-[var(--wui-color-verify-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm flex items-center justify-center gap-1.5"
              >
                Verify
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-[var(--wui-color-border)] flex flex-col gap-2">
            <div className="flex gap-3">
              <button
                onClick={onReject}
                className="flex-1 py-2.5 px-4 bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
              >
                Reject
              </button>
              {verifyUrl && (
                <button
                  type="button"
                  disabled={verifyBlocked}
                  onClick={openVerifyUrl}
                  className={`flex-1 py-2.5 px-4 bg-[var(--wui-color-verify)] text-[var(--wui-color-verify-text)] font-medium rounded-xl transition-all text-sm flex items-center justify-center gap-1.5 ${verifyBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-90'}`}
                >
                  Verify
                </button>
              )}
              <button
                onClick={onApprove}
                className={`flex-1 py-2.5 px-4 font-medium rounded-xl hover:brightness-90 transition-all text-sm flex items-center justify-center gap-2 ${
                  dangerous
                    ? 'bg-[var(--wui-color-danger-text)] text-[var(--wui-color-danger-button-text)]'
                    : 'bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)]'
                }`}
              >
                {walletIcon && <img src={walletIcon} alt="" aria-hidden="true" className="h-4 w-4 rounded-sm flex-shrink-0" />}
                Review
              </button>
            </div>
            {verifyBlocked && (
              <div className="mt-1 rounded-xl border border-[var(--wui-color-danger-text)] bg-[var(--wui-color-danger-bg)] p-3 text-xs font-medium text-[var(--wui-color-danger-text)]">
                Verify isn't available for this transaction in your current browser. To verify, open this app on desktop (recommended) or in a regular mobile browser.
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

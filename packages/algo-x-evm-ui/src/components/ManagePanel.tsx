import { useCallback, useEffect, useRef, useState } from 'react'
import { AddToWalletPanel, type AddToWalletPanelProps } from './AddToWalletPanel'
import { AlgoSymbol } from './AlgoSymbol'
import { BackButton } from './BackButton'
import { BridgePanel, type BridgePanelProps } from './BridgePanel'
import { Disclaimer } from './Disclaimer'
import { ArrowDownLeft, ArrowUpRight, ArrowsExchange, ArrowsUpDown, Check, ChevronsUpDown, Clipboard, List, RefreshCw, Search, VerifiedBadge, SuspiciousBadge } from './icons'
import { ReceivePanel, type ReceivePanelProps } from './ReceivePanel'
import { SendPanel, type SendPanelProps } from './SendPanel'
import { SwapPanel, type SwapPanelProps } from './SwapPanel'

export interface AssetHoldingDisplay {
  assetId: number
  name: string
  unitName: string
  amount: string
  decimals: number
  logo?: string | null
  verificationTier?: 'trusted' | 'verified' | 'suspicious' | 'unverified'
}

export interface ManagePanelProps {
  displayBalance: number | null
  showAvailableBalance: boolean
  onToggleBalance: () => void
  onBack?: () => void
  send?: Omit<SendPanelProps, 'onBack'>
  optIn?: Omit<ReceivePanelProps, 'onBack'>
  bridge?: Omit<BridgePanelProps, 'onBack'>
  swap?: Omit<SwapPanelProps, 'onBack'>
  assets?: AssetHoldingDisplay[]
  totalBalance?: number | null
  availableBalance?: number | null
  onRefresh?: () => void
  isRefreshing?: boolean
  onExplore?: () => void
  /** When provided, the Bridge button calls this instead of navigating to the embedded bridge panel */
  onBridgeClick?: () => void
  /** Called when the user navigates to the embedded bridge panel (e.g. to enable data loading) */
  onBridgeEnter?: () => void
  addToWallet?: Omit<AddToWalletPanelProps, 'onBack'>
  /** Connected wallet info — when provided, shows address, wallet identity, copy & disconnect */
  activeAddress?: string | null
  /** Display name (e.g. NFD) shown instead of truncated address when provided */
  displayName?: string | null
  walletName?: string | null
  walletIcon?: string | null
  onDisconnect?: () => void
  /** List of available accounts for switching */
  accounts?: { address: string; displayName?: string | null; icon?: string | null }[]
  /** Called when user selects a different account */
  onAccountSwitch?: (address: string) => void
  /** EVM controller address — shown between the account switcher and balance */
  evmAddress?: string | null
  /** Enable two-column layout via container query at the given width (default: off) */
  wideBreakpoint?: number
}

const balanceFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const INITIAL_ASSET_COUNT = 3

function formatDisplayAmount(amount: string): string {
  const num = parseFloat(amount)
  if (isNaN(num)) return amount
  // Preserve the original decimal digits but add locale thousand separators
  const [, frac] = amount.split('.')
  return num.toLocaleString(undefined, {
    minimumFractionDigits: frac?.length ?? 0,
    maximumFractionDigits: frac?.length ?? 0,
  })
}

function formatShortAddr(addr: string, prefixLen = 6, suffixLen = 4): string {
  if (addr.length <= prefixLen + suffixLen + 2) return addr
  return `${addr.slice(0, prefixLen)}..${addr.slice(-suffixLen)}`
}

export function ManagePanel({
  displayBalance,
  showAvailableBalance,
  onToggleBalance,
  onBack,
  send,
  optIn,
  bridge,
  swap,
  assets,
  totalBalance,
  availableBalance,
  onRefresh,
  isRefreshing,
  onExplore,
  onBridgeClick,
  onBridgeEnter,
  addToWallet,
  activeAddress,
  displayName,
  walletName,
  walletIcon,
  onDisconnect,
  accounts,
  onAccountSwitch,
  evmAddress,
  wideBreakpoint,
}: ManagePanelProps) {
  type Mode = 'main' | 'send' | 'opt-in' | 'bridge' | 'swap' | 'add-to-wallet'
  const [mode, setMode] = useState<Mode>('main')
  const [showAllAssets, setShowAllAssets] = useState(false)
  const [animDir, setAnimDir] = useState<'forward' | 'back' | 'none'>('none')
  const [isCopied, setIsCopied] = useState(false)
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false)
  const accountSwitcherRef = useRef<HTMLDivElement>(null)
  const hasAccountSwitcher = !!(accounts && accounts.length > 1 && onAccountSwitch)

  const handleCopyAddress = useCallback(() => {
    if (!activeAddress) return
    navigator.clipboard.writeText(activeAddress)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }, [activeAddress])

  const goForward = useCallback((target: 'send' | 'opt-in' | 'bridge' | 'swap' | 'add-to-wallet') => {
    setAnimDir('forward')
    setMode(target)
    if (target === 'bridge') onBridgeEnter?.()
  }, [onBridgeEnter])

  const goBack = useCallback((resetFn?: () => void) => {
    setAnimDir('back')
    setMode('main')
    resetFn?.()
  }, [])

  // Close account switcher on click outside
  useEffect(() => {
    if (!accountSwitcherOpen) return
    const handler = (e: MouseEvent) => {
      if (accountSwitcherRef.current && !accountSwitcherRef.current.contains(e.target as Node)) {
        setAccountSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [accountSwitcherOpen])

  const handleOptOut = send && optIn ? (assetIndex: number) => {
    const asset = assets?.find((a) => a.assetId === assetIndex)
    send.setSendType('asa')
    send.setAssetIdInput(String(assetIndex))
    if (asset) {
      send.setAmount(asset.amount)
    }
    send.setOptOut?.(true)
    goForward('send')
  } : undefined

  /* ── Shared sub-sections ── */

  const headerSection = (
    <div className="wui-header flex items-center gap-2 mb-4">
      {onBack && <BackButton onClick={onBack} />}
      {activeAddress ? (
        <>
          {walletIcon && (
            <div className="wui-header-icon h-5 w-5 overflow-hidden rounded flex items-center justify-center shrink-0">
              <img src={walletIcon} alt={`${walletName || 'Wallet'} icon`} className="max-w-full max-h-full" />
            </div>
          )}
          <div ref={accountSwitcherRef} className="min-w-0 relative">
            <button
              type="button"
              onClick={hasAccountSwitcher ? () => setAccountSwitcherOpen((v) => !v) : handleCopyAddress}
              className="flex items-center gap-1.5 min-w-0 rounded-lg px-1.5 py-1 -mx-1.5 -my-1 hover:bg-[var(--wui-color-bg-secondary)] transition-colors"
              title={hasAccountSwitcher ? 'Switch account' : 'Copy address'}
            >
              <div className="min-w-0 flex flex-col">
                <span className="wui-header-name text-base font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font truncate" title={activeAddress}>
                  {displayName || formatShortAddr(activeAddress)}
                </span>
                {displayName && (
                  <span className="wui-header-sub text-xs text-[var(--wui-color-text-secondary)] truncate mt-0.5">
                    {formatShortAddr(activeAddress)}
                  </span>
                )}
              </div>
              {hasAccountSwitcher ? (
                <ChevronsUpDown size={12} className="shrink-0 text-[var(--wui-color-text-secondary)]" />
              ) : (
                isCopied ? <Check size={12} className="shrink-0 text-green-500" /> : <Clipboard size={12} className="shrink-0 text-[var(--wui-color-text-secondary)]" />
              )}
            </button>
            {hasAccountSwitcher && accountSwitcherOpen && (
              <div className="absolute z-50 mt-1 left-0 min-w-[220px] max-h-[240px] overflow-y-auto rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] shadow-lg">
                {accounts!.map((acct) => (
                  <button
                    key={acct.address}
                    type="button"
                    onClick={() => {
                      onAccountSwitch!(acct.address)
                      setAccountSwitcherOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--wui-color-bg-secondary)] text-left ${
                      acct.address === activeAddress ? 'bg-[var(--wui-color-bg-secondary)] font-medium' : ''
                    } text-[var(--wui-color-text)]`}
                  >
                    {acct.icon && (
                      <img src={acct.icon} alt="" width={16} height={16} className="rounded shrink-0" />
                    )}
                    <span className="truncate">
                      {acct.displayName || formatShortAddr(acct.address)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasAccountSwitcher && (
            <button
              onClick={handleCopyAddress}
              className="p-1.5 rounded-lg hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-[var(--wui-color-text-secondary)] flex items-center justify-center shrink-0"
              title="Copy address"
            >
              {isCopied ? <Check size={14} className="text-green-500" /> : <Clipboard size={14} />}
            </button>
          )}
          <div className="wui-header-actions ml-auto flex items-center gap-1.5 shrink-0">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1.5 rounded-lg hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-[var(--wui-color-text-secondary)] flex items-center justify-center disabled:pointer-events-none"
                title="Refresh"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            )}
            {onDisconnect && (
              <button
                onClick={onDisconnect}
                className="p-1.5 rounded-lg hover:bg-[var(--wui-color-danger-bg)] transition-colors text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-danger-text)] flex items-center justify-center"
                title="Disconnect"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <h3 className="wui-header-name text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">
            Manage xChain Account
          </h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="ml-auto p-1 rounded-lg hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-[var(--wui-color-text-secondary)] flex items-center justify-center disabled:pointer-events-none"
              title="Refresh"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </>
      )}
    </div>
  )

  const evmControllerSection = evmAddress ? (
    <div className="mb-3 bg-[var(--wui-color-bg-secondary)] rounded-lg px-3 py-2">
      <span className="text-xs text-[var(--wui-color-text-secondary)]">EVM Controller</span>
      <code className="text-sm font-medium text-[var(--wui-color-text)] truncate block mt-0.5">{evmAddress}</code>
    </div>
  ) : null

  const balanceNarrow = (
    <div className="wui-balance mb-4 bg-[var(--wui-color-bg-secondary)] rounded-lg p-3">
      <div className="flex justify-between items-center">
        {displayBalance !== null && (
          <span className="wui-balance-amount text-base font-medium text-[var(--wui-color-text)] flex items-center gap-1">
            {balanceFormatter.format(displayBalance)}
            <AlgoSymbol />
          </span>
        )}
        <button
          onClick={onToggleBalance}
          className="wui-balance-toggle flex items-center gap-1 text-sm text-[var(--wui-color-text-secondary)] bg-[var(--wui-color-bg-tertiary)] py-1 pl-2.5 pr-2 rounded-md hover:brightness-90 transition-all focus:outline-none"
          title={showAvailableBalance ? 'Show total balance' : 'Show available balance'}
        >
          {showAvailableBalance ? 'Available' : 'Total'}
          <ChevronsUpDown size={10} className="ml-0.5 opacity-80" />
        </button>
      </div>
    </div>
  )


  const assetsSection = assets && assets.length > 0 ? (
    <div className="mb-4">
      <div className="border-t border-[var(--wui-color-border)] mb-3" />
      <h4 className="text-xs font-medium text-[var(--wui-color-text-secondary)] uppercase tracking-wide mb-1.5">
        Assets
      </h4>
      <div>
        {(showAllAssets ? assets : assets.slice(0, INITIAL_ASSET_COUNT)).map((asset) => (
          <div
            key={asset.assetId}
            className="wui-asset-row flex justify-between items-center py-1.5"
          >
            <span className="wui-asset-name text-sm text-[var(--wui-color-text-secondary)] truncate mr-3 flex items-center gap-2">
              {asset.logo ? (
                <img
                  src={asset.logo}
                  alt={asset.name}
                  width={20}
                  height={20}
                  className="wui-asset-logo rounded-full shrink-0 object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="wui-asset-placeholder w-5 h-5 rounded-full bg-[var(--wui-color-bg-tertiary)] shrink-0 flex items-center justify-center text-[10px] font-medium text-[var(--wui-color-text-secondary)]">
                  {(asset.unitName || asset.name || '?').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="flex items-center gap-1 min-w-0">
                <span className="truncate">{asset.name}</span>
                {asset.verificationTier === 'verified' || asset.verificationTier === 'trusted' ? (
                  <VerifiedBadge size={12} className="wui-asset-badge shrink-0" />
                ) : asset.verificationTier === 'suspicious' ? (
                  <SuspiciousBadge size={12} className="wui-asset-badge shrink-0" />
                ) : null}
              </span>
              {send && (
                <button
                  onClick={() => {
                    send.setSendType('asa')
                    send.setAssetIdInput(String(asset.assetId))
                    goForward('send')
                  }}
                  className="wui-asset-send inline-flex items-center justify-center w-4 h-4 rounded-xs border border-[var(--wui-color-border)] text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text-secondary)] hover:border-[var(--wui-color-text-secondary)] transition-colors shrink-0"
                  title={`Send ${asset.unitName || asset.name}`}
                >
                  <span className="wui-asset-send-label" style={{ display: 'none' }}>SEND</span>
                  <ArrowUpRight size={10} strokeWidth={2.5} className="wui-asset-send-icon" />
                </button>
              )}
            </span>
            <span className="wui-asset-amount text-sm font-medium text-[var(--wui-color-text)] tabular-nums whitespace-nowrap">
              {formatDisplayAmount(asset.amount)}{asset.unitName ? ` ${asset.unitName}` : ''}
            </span>
          </div>
        ))}
      </div>
      {assets.length > INITIAL_ASSET_COUNT && (
        <button
          onClick={() => setShowAllAssets((v) => !v)}
          className="text-xs text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text-secondary)] transition-colors mt-1"
        >
          {showAllAssets ? 'show less' : `+${assets.length - INITIAL_ASSET_COUNT} more`}
        </button>
      )}
    </div>
  ) : null

  const actionBtnClass = "py-2.5 px-4 bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"

  const actionButtons = (vertical: boolean) => (
    <div className={vertical ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
      <button onClick={() => goForward('send')} disabled={!send} className={actionBtnClass}>
        <ArrowUpRight className="h-4 w-4 mr-1.5" />
        Send
      </button>
      <button onClick={() => goForward('opt-in')} disabled={!optIn} className={actionBtnClass}>
        <ArrowDownLeft className="h-4 w-4 mr-1.5" />
        Receive
      </button>
      <button onClick={() => goForward('swap')} disabled={!swap} className={actionBtnClass}>
        <ArrowsUpDown className="h-4 w-4 mr-1.5" />
        Swap
      </button>
      <button onClick={onBridgeClick ?? (() => { onBridgeEnter?.(); goForward('bridge') })} disabled={!bridge && !onBridgeClick} className={actionBtnClass}>
        <ArrowsExchange className="h-4 w-4 mr-1.5" />
        Bridge
      </button>
      <button onClick={onExplore} disabled={!onExplore} className={actionBtnClass}>
        <Search className="h-4 w-4 mr-1.5" />
        Explore
      </button>
      {addToWallet && (
        <button
          onClick={() => goForward('add-to-wallet')}
          className={actionBtnClass}
        >
          <img src={addToWallet.walletIcon} alt={`${addToWallet.walletName} icon`} width={16} height={16} className="mr-1.5 object-contain shrink-0" />
          <span className="truncate">Add to {addToWallet.walletName}</span>
        </button>
      )}
    </div>
  )

  /* ── Panel content (for non-main modes) ── */

  let panelContent: React.ReactNode | null = null
  if (mode === 'send' && send) {
    panelContent = <SendPanel {...send} accountAssets={assets} totalBalance={totalBalance} availableBalance={availableBalance} onBack={() => goBack(send.reset)} />
  } else if (mode === 'opt-in' && optIn) {
    panelContent = <ReceivePanel {...optIn} onOptOut={handleOptOut} onBack={() => goBack(optIn.reset)} />
  } else if (mode === 'bridge' && bridge) {
    panelContent = (
      <Disclaimer id="bridge">
        <BridgePanel {...bridge} onBack={() => goBack(bridge.onReset)} />
      </Disclaimer>
    )
  } else if (mode === 'swap' && swap) {
    panelContent = <SwapPanel {...swap} onBack={() => goBack(swap.reset)} />
  } else if (mode === 'add-to-wallet' && addToWallet) {
    panelContent = <AddToWalletPanel {...addToWallet} onBack={() => goBack()} />
  }

  const animation =
    animDir === 'forward'
      ? 'wui-slide-fwd 180ms ease-out both'
      : animDir === 'back'
        ? 'wui-slide-back 180ms ease-out both'
        : 'none'

  const bp = wideBreakpoint

  /* ── Narrow (default) layout ── */
  if (!bp) {
    const content = panelContent ?? (
      <>
        {headerSection}
        {evmControllerSection}
        {balanceNarrow}
        {assetsSection}
        <div className="border-t border-[var(--wui-color-border)] mb-3" />
        {actionButtons(false)}
      </>
    )

    return (
      <>
        <style>{`
          @keyframes wui-slide-fwd {
            from { opacity: 0; transform: translateX(24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes wui-slide-back {
            from { opacity: 0; transform: translateX(-24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>
        <div key={mode} style={{ animation }}>
          {content}
        </div>
      </>
    )
  }

  /* ── Wide two-column layout (container query) ── */
  const sideActionBtnClass = (m: Mode) =>
    `wui-side-btn w-full py-2.5 px-4 font-medium rounded-xl transition-all text-sm flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none ${
      mode === m
        ? 'bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)]'
        : 'bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] hover:brightness-90'
    }`

  return (
    <>
      <style>{`
        @keyframes wui-slide-fwd {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes wui-slide-back {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @container wui-manage (max-width: ${bp - 1}px) {
          .wui-wide-row { display: none !important; }
          .wui-narrow-only { display: block !important; }
        }
        @container wui-manage (min-width: ${bp}px) {
          .wui-wide-row { display: flex !important; }
          .wui-narrow-only { display: none !important; }
          .wui-header { gap: 0.75rem; margin-bottom: 1.5rem; }
          .wui-header-icon { width: 2rem; height: 2rem; }
          .wui-header-name { font-size: 1.375rem; }
          .wui-header-sub { font-size: 0.875rem; }
          .wui-header-actions { gap: 0.625rem; }
          .wui-header-actions button { padding: 0.625rem; }
          .wui-header-actions svg { width: 1.25rem; height: 1.25rem; }
          .wui-balance { padding: 0.75rem 1rem; margin-bottom: 1.25rem; border-radius: 0.75rem; }
          .wui-balance-amount { font-size: 1.25rem; }
          .wui-balance-toggle { font-size: 0.9375rem; padding: 0.375rem 0.75rem 0.375rem 0.875rem; }
          .wui-asset-row { padding-top: 0.625rem; padding-bottom: 0.625rem; }
          .wui-asset-logo { width: 2rem; height: 2rem; }
          .wui-asset-placeholder { width: 2rem; height: 2rem; font-size: 0.75rem; }
          .wui-asset-name { font-size: 1rem; gap: 0.625rem; }
          .wui-asset-badge { width: 1rem; height: 1rem; }
          .wui-asset-amount { font-size: 1rem; }
          .wui-side-btn { font-size: 1rem; padding: 0.875rem 1.25rem; }
          .wui-side-btn svg { width: 1.25rem; height: 1.25rem; }
          .wui-asset-send {
            width: auto !important;
            height: auto !important;
            padding: 0.25rem 0.625rem !important;
            border-radius: 0.375rem !important;
            font-size: 0.75rem !important;
            font-weight: 500 !important;
            gap: 0.25rem !important;
          }
          .wui-asset-send-icon { width: 0.75rem !important; height: 0.75rem !important; }
          .wui-asset-send-label { display: inline !important; }
          .wui-panel-wide .wui-panel-back { display: none !important; }
        }
      `}</style>
      <div style={{ containerName: 'wui-manage', containerType: 'inline-size' }}>
        {headerSection}
        {evmControllerSection}

        {/* ── Narrow layout (below breakpoint) ── */}
        <div className="wui-narrow-only" style={{ display: 'block' }}>
          {panelContent ? (
            <div key={mode} style={{ animation }}>
              {panelContent}
            </div>
          ) : (
            <>
              {balanceNarrow}
              {assetsSection}
              <div className="border-t border-[var(--wui-color-border)] mb-3" />
              {actionButtons(false)}
            </>
          )}
        </div>

        {/* ── Wide layout (at or above breakpoint) ── */}
        <div className="wui-wide-row gap-6" style={{ display: 'none', alignItems: 'flex-start' }}>
          {/* Left sidebar — actions */}
          <div className="shrink-0" style={{ width: '180px' }}>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setAnimDir('none'); setMode('main') }} className={sideActionBtnClass('main')}>
                <List className="h-4 w-4 mr-1.5" />
                Overview
              </button>
              <button onClick={() => goForward('send')} disabled={!send} className={sideActionBtnClass('send')}>
                <ArrowUpRight className="h-4 w-4 mr-1.5" />
                Send
              </button>
              <button onClick={() => goForward('opt-in')} disabled={!optIn} className={sideActionBtnClass('opt-in')}>
                <ArrowDownLeft className="h-4 w-4 mr-1.5" />
                Receive
              </button>
              <button onClick={() => goForward('swap')} disabled={!swap} className={sideActionBtnClass('swap')}>
                <ArrowsUpDown className="h-4 w-4 mr-1.5" />
                Swap
              </button>
              <button onClick={onBridgeClick ?? (() => { onBridgeEnter?.(); goForward('bridge') })} disabled={!bridge && !onBridgeClick} className={sideActionBtnClass('bridge')}>
                <ArrowsExchange className="h-4 w-4 mr-1.5" />
                Bridge
              </button>
              <button onClick={onExplore} disabled={!onExplore} className={`wui-side-btn w-full py-2.5 px-4 font-medium rounded-xl transition-all text-sm flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] hover:brightness-90`}>
                <Search className="h-4 w-4 mr-1.5" />
                Explore
              </button>
              {addToWallet && (
                <button onClick={() => goForward('add-to-wallet')} className={sideActionBtnClass('add-to-wallet')}>
                  <img src={addToWallet.walletIcon} alt={`${addToWallet.walletName} icon`} width={16} height={16} className="mr-1.5 object-contain" />
                  Add to {addToWallet.walletName}
                </button>
              )}
            </div>
          </div>

          {/* Right main content */}
          <div className="flex-1 min-w-0">
            <div key={mode} style={{ animation }} className={panelContent ? 'wui-panel-wide' : undefined}>
              {panelContent ?? (
                <>
                  {balanceNarrow}
                  {assetsSection}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

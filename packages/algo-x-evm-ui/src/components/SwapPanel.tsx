import { useEffect, useMemo, useState } from 'react'
import type { CachedAsset } from '../cache/assetCache'
import type { PeraAssetData } from '../services/peraApi'
import { AlgoSymbol } from './AlgoSymbol'
import { AssetSelect } from './AssetSelect'
import { BackButton } from './BackButton'
import { SecondaryButton } from './SecondaryButton'
import type { AssetHoldingDisplay } from './ManagePanel'
import { Spinner } from './Spinner'
import { TransactionStatus } from './TransactionStatus'
import type { AssetLookupInfo } from '../hooks/useAssetLookup'
import type { SwapAsset, SwapStatusValue } from '../hooks/useSwapPanel'
import { ArrowsUpDown, Search, SuspiciousBadge, VerifiedBadge } from './icons'
import type { SwapQuoteDisplay } from '../hooks/useSwapPanel'

export interface SwapPanelProps {
  activeAddress?: string | null
  fromAssetId: string
  setFromAssetId: (id: string) => void
  toAssetId: string
  setToAssetId: (id: string) => void
  amount: string
  setAmount: (v: string) => void
  slippage: string
  setSlippage: (v: string) => void
  quote: SwapQuoteDisplay | null
  quoteLoading: boolean
  quoteError: string | null
  accountAssets?: AssetHoldingDisplay[]
  totalBalance?: number | null
  availableBalance?: number | null
  status: SwapStatusValue
  error: string | null
  txId?: string | null
  explorerUrl?: string | null
  swapDirection: () => void
  handleSwap: () => void
  reset: () => void
  retry: () => void
  onBack: () => void
  // Asset search (optional, for swapping into assets the wallet doesn't hold)
  searchInput?: string
  setSearchInput?: (v: string) => void
  searchLookupInfo?: AssetLookupInfo | null
  searchLookupLoading?: boolean
  searchLookupError?: string | null
  searchNameResults?: CachedAsset[]
  searchNameLoading?: boolean
  registryLoading?: boolean
  isNameMode?: boolean
  discoveredAssets?: SwapAsset[]
  pickDiscoveredAsset?: (asset: SwapAsset) => void
  clearSearch?: () => void
  /** Pera asset data map for logos and verification tiers */
  peraData?: Map<number, PeraAssetData>
  /** Callback to fetch Pera data for a batch of asset IDs (e.g. search results) */
  fetchPeraData?: (assetIds: number[]) => void
}

const ALGO_ICON = <AlgoSymbol scale={1} />

function formatOutputAmount(quote: SwapQuoteDisplay, decimals: number): string {
  const amount = Number(quote.quote) / 10 ** decimals
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.min(decimals, 6),
  })
}

export function SwapPanel({
  fromAssetId,
  setFromAssetId,
  toAssetId,
  setToAssetId,
  amount,
  setAmount,
  slippage,
  setSlippage,
  quote,
  quoteLoading,
  quoteError,
  accountAssets,
  availableBalance,
  status,
  error,
  txId,
  explorerUrl,
  swapDirection,
  handleSwap,
  reset: _reset,
  retry,
  onBack,
  searchInput,
  setSearchInput,
  searchLookupInfo,
  searchLookupLoading,
  searchLookupError,
  searchNameResults,
  searchNameLoading,
  registryLoading,
  isNameMode,
  discoveredAssets,
  pickDiscoveredAsset,
  clearSearch,
  peraData,
  fetchPeraData,
}: SwapPanelProps) {
  // Fetch Pera data for search results as they appear
  useEffect(() => {
    if (!fetchPeraData || !searchNameResults || searchNameResults.length === 0) return
    const ids = searchNameResults.map((a) => a.index).filter((id) => !peraData?.has(id))
    if (ids.length > 0) fetchPeraData(ids)
  }, [searchNameResults, fetchPeraData, peraData])

  // Fetch Pera data for ID-mode lookup result
  useEffect(() => {
    if (!fetchPeraData || !searchLookupInfo || peraData?.has(searchLookupInfo.index)) return
    fetchPeraData([searchLookupInfo.index])
  }, [searchLookupInfo, fetchPeraData, peraData])

  const [searchOpen, setSearchOpen] = useState(false)
  const searchEnabled = !!setSearchInput && !!pickDiscoveredAsset

  const handlePickAsset = (asset: SwapAsset) => {
    pickDiscoveredAsset?.(asset)
    setSearchOpen(false)
  }

  const fromOptions = useMemo(() => {
    const opts: { value: string; label: string; logo?: string | null; icon?: React.ReactNode; verificationTier?: AssetHoldingDisplay['verificationTier'] }[] = [
      { value: '0', label: 'ALGO', icon: ALGO_ICON },
    ]
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

  // "To" options include held assets + discovered assets (from search)
  const toOptions = useMemo(() => {
    const opts = [...fromOptions]
    if (discoveredAssets) {
      for (const a of discoveredAssets) {
        if (opts.some((o) => o.value === String(a.assetId))) continue
        opts.push({
          value: String(a.assetId),
          label: a.unitName || a.name,
          logo: a.logo,
          verificationTier: a.verificationTier,
        })
      }
    }
    return opts
  }, [fromOptions, discoveredAssets])

  const assetOptions = fromOptions

  const fromAsset = fromAssetId === '0'
    ? { unitName: 'ALGO', decimals: 6 }
    : accountAssets?.find((a) => String(a.assetId) === fromAssetId)

  const toAsset = toAssetId === '0'
    ? { unitName: 'ALGO', decimals: 6 }
    : (accountAssets?.find((a) => String(a.assetId) === toAssetId)
        ?? discoveredAssets?.find((a) => String(a.assetId) === toAssetId))

  const fromLabel = fromAsset && 'unitName' in fromAsset ? fromAsset.unitName : 'Asset'
  const toLabel = toAsset && 'unitName' in toAsset ? toAsset.unitName : 'Asset'
  const toDecimals = toAsset && 'decimals' in toAsset ? toAsset.decimals : 6

  // Available balance for selected "from" asset
  const fromAvailable = fromAssetId === '0'
    ? (availableBalance != null ? `${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ALGO` : null)
    : (() => {
      const asset = accountAssets?.find((a) => String(a.assetId) === fromAssetId)
      return asset ? `${asset.amount} ${asset.unitName || asset.name}` : null
    })()

  const handleFromChange = (value: string) => {
    if (value === toAssetId) {
      swapDirection()
    } else {
      setFromAssetId(value)
      setAmount('')
    }
  }

  const handleToChange = (value: string) => {
    if (value === fromAssetId) {
      swapDirection()
    } else {
      setToAssetId(value)
    }
  }

  const handleMax = () => {
    if (fromAssetId === '0' && availableBalance != null) {
      const max = Math.max(0, availableBalance - 0.1) // Reserve for fees
      setAmount(max.toFixed(6).replace(/\.?0+$/, '') || '0')
    } else {
      const asset = accountAssets?.find((a) => String(a.assetId) === fromAssetId)
      if (asset) setAmount(asset.amount)
    }
  }

  const parsedAmount = amount !== '' ? parseFloat(amount) : NaN
  const isOverspend = !isNaN(parsedAmount) && parsedAmount > 0 && fromAssetId === '0'
    ? (availableBalance != null && parsedAmount > availableBalance)
    : (() => {
      const asset = accountAssets?.find((a) => String(a.assetId) === fromAssetId)
      return asset ? parsedAmount > parseFloat(asset.amount) : false
    })()

  const canSwap =
    status === 'idle' &&
    fromAssetId &&
    toAssetId &&
    fromAssetId !== toAssetId &&
    amount &&
    !isNaN(parsedAmount) &&
    parsedAmount > 0 &&
    !isOverspend &&
    quote &&
    !quoteLoading

  // Compute exchange rate from quote
  const rateDisplay = quote && fromAsset && toAsset
    ? (() => {
      const fromDecimals = 'decimals' in fromAsset ? fromAsset.decimals : 6
      const inputHuman = Number(quote.amount) / 10 ** fromDecimals
      const outputHuman = Number(quote.quote) / 10 ** toDecimals
      if (inputHuman === 0) return null
      const rate = outputHuman / inputHuman
      return `1 ${fromLabel} = ${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${toLabel}`
    })()
    : null

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BackButton onClick={onBack} />
        <h3 className="text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">Swap</h3>
      </div>

      {/* Swap form (hidden during/after transaction) */}
      {status === 'idle' && (
        <>
          <p className="text-sm text-[var(--wui-color-text)] mb-2">
            Swap tokens at the best rate across Algorand DEXes using{' '}
            <a
              href="https://txnlab.gitbook.io/haystack-router"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--wui-color-link)] hover:text-[var(--wui-color-link-hover)]"
            >
              Haystack router
            </a>
          </p>

          {/* You pay */}
          <div className="mb-1">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[var(--wui-color-text-secondary)]">You pay</label>
              {fromAvailable && (
                <span className="text-xs text-[var(--wui-color-text-secondary)]">Available: {fromAvailable}</span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  inputMode="decimal"
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
                value={fromAssetId}
                onChange={handleFromChange}
                className="w-[140px] shrink-0"
                options={assetOptions}
              />
            </div>
          </div>

          {/* Overspend warning */}
          {isOverspend && <p className="mb-1 text-xs text-[var(--wui-color-danger-text)]">Amount exceeds available balance</p>}

          {/* Swap direction toggle */}
          <div className="flex justify-center mt-3 mb-1">
            <button
              type="button"
              onClick={swapDirection}
              style={{ width: 32, height: 32, padding: 0, lineHeight: 0 }}
              className="shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] hover:bg-[var(--wui-color-bg-tertiary)] transition-colors text-[var(--wui-color-text-secondary)]"
              title="Swap direction"
            >
              <ArrowsUpDown size={14} />
            </button>
          </div>

          {/* You receive */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[var(--wui-color-text-secondary)]">You receive</label>
              {searchEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((v) => !v)
                    if (searchOpen) clearSearch?.()
                  }}
                  className="flex items-center gap-1 text-xs text-[var(--wui-color-primary)] hover:brightness-90 transition-all"
                >
                  <Search size={12} />
                  {searchOpen ? 'Cancel' : 'Find asset'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <div className="w-full rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] py-2.5 px-3 text-sm text-[var(--wui-color-text)] min-h-[40px] flex items-center">
                  {quoteLoading ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : quote ? (
                    <span className="tabular-nums">{formatOutputAmount(quote, toDecimals)}</span>
                  ) : (
                    <span className="text-[var(--wui-color-text-secondary)]">--</span>
                  )}
                </div>
              </div>
              <AssetSelect
                value={toAssetId}
                onChange={handleToChange}
                className="w-[140px] shrink-0"
                options={toOptions}
              />
            </div>
          </div>

          {/* Asset search (expandable) */}
          {searchEnabled && searchOpen && (
            <div className="mb-3 rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Search by name or asset ID"
                  value={searchInput ?? ''}
                  onChange={(e) => setSearchInput?.(e.target.value)}
                  autoFocus
                  className="flex-1 rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] py-2 px-3 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
                />
                {registryLoading && <Spinner className="h-3 w-3 text-[var(--wui-color-text-secondary)]" />}
              </div>

              {/* ID lookup loading */}
              {!isNameMode && searchLookupLoading && (
                <div className="flex items-center justify-center py-3 text-xs text-[var(--wui-color-text-secondary)]">
                  <Spinner className="h-3 w-3 mr-2" />
                  Looking up asset
                </div>
              )}

              {/* ID lookup error */}
              {!isNameMode && searchLookupError && (
                <p className="py-2 text-center text-xs text-[var(--wui-color-danger-text)] break-words">{searchLookupError}</p>
              )}

              {/* ID lookup result */}
              {!isNameMode && searchLookupInfo && (() => {
                const pera = peraData?.get(searchLookupInfo.index)
                const tier = pera?.verificationTier
                return (
                  <button
                    type="button"
                    onClick={() => handlePickAsset({
                      assetId: searchLookupInfo.index,
                      name: searchLookupInfo.name,
                      unitName: searchLookupInfo.unitName,
                      decimals: searchLookupInfo.decimals,
                      logo: pera?.logo,
                      verificationTier: tier,
                    })}
                    className="w-full flex items-center justify-between rounded-lg bg-[var(--wui-color-bg)] hover:bg-[var(--wui-color-bg-tertiary)] transition-colors p-2.5 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {pera?.logo ? (
                        <img src={pera.logo} alt={searchLookupInfo.name} width={24} height={24} className="rounded-full shrink-0 object-cover" loading="lazy" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-[var(--wui-color-bg-tertiary)] shrink-0 flex items-center justify-center text-[10px] font-medium text-[var(--wui-color-text-secondary)]">
                          {(searchLookupInfo.unitName || searchLookupInfo.name || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--wui-color-text)] truncate flex items-center gap-1">
                          {searchLookupInfo.name}
                          {(tier === 'verified' || tier === 'trusted') && <VerifiedBadge size={11} />}
                          {tier === 'suspicious' && <SuspiciousBadge size={11} />}
                        </p>
                        {searchLookupInfo.unitName && <p className="text-xs text-[var(--wui-color-text-secondary)] truncate">{searchLookupInfo.unitName}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--wui-color-text-secondary)] shrink-0 ml-2">ID: {searchLookupInfo.index}</span>
                  </button>
                )
              })()}

              {/* Name search loading */}
              {isNameMode && searchNameLoading && (
                <div className="flex items-center justify-center py-3 text-xs text-[var(--wui-color-text-secondary)]">
                  <Spinner className="h-3 w-3 mr-2" />
                  Searching
                </div>
              )}

              {/* Name search results */}
              {isNameMode && !searchNameLoading && searchNameResults && searchNameResults.length > 0 && (
                <div className="max-h-[180px] overflow-y-auto rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)]">
                  {searchNameResults.map((asset) => {
                    const pera = peraData?.get(asset.index)
                    const tier = pera?.verificationTier
                    return (
                      <button
                        key={asset.index}
                        type="button"
                        onClick={() => handlePickAsset({
                          assetId: asset.index,
                          name: asset.name,
                          unitName: asset.unitName,
                          decimals: asset.decimals,
                          logo: pera?.logo,
                          verificationTier: tier,
                        })}
                        className="w-full flex items-center justify-between p-2 text-left hover:bg-[var(--wui-color-bg-secondary)] transition-colors border-b border-[var(--wui-color-border)] last:border-b-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {pera?.logo ? (
                            <img src={pera.logo} alt={asset.name} width={24} height={24} className="rounded-full shrink-0 object-cover" loading="lazy" />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-[var(--wui-color-bg-tertiary)] shrink-0 flex items-center justify-center text-[10px] font-medium text-[var(--wui-color-text-secondary)]">
                              {(asset.unitName || asset.name || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--wui-color-text)] truncate flex items-center gap-1">
                              {asset.name}
                              {(tier === 'verified' || tier === 'trusted') && <VerifiedBadge size={11} />}
                              {tier === 'suspicious' && <SuspiciousBadge size={11} />}
                              {!tier && asset.peraVerified && <VerifiedBadge size={11} />}
                            </p>
                            {asset.unitName && <p className="text-xs text-[var(--wui-color-text-secondary)] truncate">{asset.unitName}</p>}
                          </div>
                        </div>
                        <span className="text-xs text-[var(--wui-color-text-secondary)] shrink-0 ml-2">ID: {asset.index}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* No results */}
              {isNameMode && !searchNameLoading && searchNameResults && searchNameResults.length === 0 && searchInput && searchInput.trim().length > 0 && (
                <p className="py-2 text-center text-xs text-[var(--wui-color-text-secondary)]">No assets found</p>
              )}
            </div>
          )}

          {/* Quote error */}
          {quoteError && <p className="mb-3 text-xs text-[var(--wui-color-danger-text)] break-words">{quoteError}</p>}

          {/* Quote details */}
          {quote && (
            <div className="mb-3 rounded-lg bg-[var(--wui-color-bg-secondary)] p-3 space-y-1.5">
              {rateDisplay && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--wui-color-text-secondary)]">Rate</span>
                  <span className="text-[var(--wui-color-text-secondary)]">{rateDisplay}</span>
                </div>
              )}
              {quote.userPriceImpact !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--wui-color-text-secondary)]">Price impact</span>
                  <span className={
                    quote.userPriceImpact > 5 ? 'text-[var(--wui-color-danger-text)] font-medium'
                    : quote.userPriceImpact > 3 ? 'text-orange-500'
                    : quote.userPriceImpact > 1 ? 'text-yellow-500'
                    : 'text-green-500'
                  }>
                    {quote.userPriceImpact.toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--wui-color-text-secondary)] mr-2">Route</span>
                <span className="text-[var(--wui-color-text-secondary)]">
                  {Object.entries(quote.flattenedRoute)
                    .map(([protocol, pct]) => `${protocol}: ${pct.toFixed(2)}%`)
                    .join(', ')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--wui-color-text-secondary)]">Slippage</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-10 text-right rounded border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] px-1 py-0.5 text-xs text-[var(--wui-color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--wui-color-primary)]"
                  />
                  <span className="text-[var(--wui-color-text-secondary)]">%</span>
                </div>
              </div>
              {quote.usdIn > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--wui-color-text-secondary)]">USD value</span>
                  <span className="text-[var(--wui-color-text-secondary)]">
                    ${quote.usdIn.toFixed(2)} → ${quote.usdOut.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Swap button */}
          <button
            onClick={handleSwap}
            disabled={!canSwap}
            className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {quoteLoading ? 'Getting quote...' : `Swap ${fromLabel} for ${toLabel}`}
          </button>
        </>
      )}

      <TransactionStatus
        status={status === 'quoting' ? 'idle' : status}
        error={error}
        successMessage="Swap completed!"
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

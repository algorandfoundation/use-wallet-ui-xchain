import algosdk from 'algosdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BridgeWalletAdapter } from '../types'

import {
  getOrCreateSdk,
  fetchChainDetailsMap,
  getQuote,
  getGasFees,
  getEstimatedTime,
  getExtraGasMaxLimits,
  getTransferStatus,
  fetchEvmTokenBalances,
  getEvmBalanceCache,
  setEvmBalanceCache,
  clearAllEvmBalanceCaches,
  DEFAULT_RPC_URLS,
  type AllbridgeCoreSdk,
  type ChainDetailsWithTokens,
  type TokenWithChainDetails,
  type TransferStatusResponse,
  type NodeRpcUrls,
  type TokenBalanceMap,
} from '../services/bridgeSdk'

import { switchToEvmChain } from '../services/evmChainSwitch'
import {
  detectEip2612,
  buildPermitSignature,
  encodePermitCalldata,
  extractSpenderFromApproveTx,
} from '../services/evmPermit'

// -- Public types for the bridge panel --

/** Slimmed-down transfer status exposed by the hook (subset of TransferStatusResponse). */
export interface BridgeTransferStatus {
  send: { confirmations: number; confirmationsNeeded: number } | null
  signaturesCount: number
  signaturesNeeded: number
  receive: { confirmations: number; confirmationsNeeded: number; txId?: string } | null
}

export interface BridgeChain {
  chainSymbol: string
  chainName: string
  chainId?: string
  tokens: BridgeToken[]
}

export interface BridgeToken {
  symbol: string
  name: string
  decimals: number
  chainSymbol: string
  chainName: string
  /** Raw balance in smallest token units (decimal string). Undefined while loading. */
  balance?: string
}

export type BridgeStatus =
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

export interface UseBridgeOptions {
  nodeRpcUrls?: NodeRpcUrls
  /** When false, defers all network operations (chain init, balances, fees). Default: true. */
  enabled?: boolean
}

export interface UseBridgePanelReturn {
  // Availability
  isAvailable: boolean

  // Chain/token selection
  chains: BridgeChain[]
  chainsLoading: boolean
  balancesLoading: boolean
  /**
   * True once chains are loaded and - if a wallet is connected - the initial
   * balance fetch has settled. Gate the form on this instead of `chainsLoading`, so
   * chain labels (which include the balances) are complete on first paint.
   */
  initialLoadComplete: boolean
  sourceChain: BridgeChain | null
  setSourceChain: (symbol: string) => void
  sourceToken: BridgeToken | null
  setSourceToken: (symbol: string) => void
  destinationChains: BridgeChain[]
  destinationChain: BridgeChain | null
  setDestinationChain: (symbol: string) => void
  destinationToken: BridgeToken | null
  setDestinationToken: (symbol: string) => void
  sourceIsAlgorand: boolean

  // Amount
  amount: string
  setAmount: (v: string) => void
  receivedAmount: string | null
  quoteLoading: boolean

  // Fee
  /** Allbridge's relayer fee */
  gasFee: string | null
  gasFeeLoading: boolean
  gasFeeUnit: string | null
  /** Approximate ALGO the user will receive from extra gas conversion (e.g. "~0.123 ALGO") */
  extraGasAlgo: string | null
  /** Effective fee of the bridge operation: relayer fee + liquidity provider fee. */
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

  // Transaction status
  status: BridgeStatus
  error: string | null
  sourceTxId: string | null

  // Actions
  handleBridge: () => Promise<void>
  reset: () => void
  retry: () => void
  refreshBalances: () => Promise<void>
}

// Minimum available balance in microAlgos to perform an opt-in (0.1 MBR + 0.001 fee)
const OPT_IN_COST_MICRO = 101_000

// Available balance threshold (in microAlgos) below which extra gas is requested
// on the destination chain so the user receives ALGO for future transactions.
const LOW_BALANCE_THRESHOLD_MICRO = 100_000

// When the account is below the threshold, request this much extra gas (in USD)
// to be converted to ALGO on the destination chain.
const MAX_EXTRA_GAS_USD = 1

// DFX service URL for deferred transaction execution
const DFX_API_URL = 'https://dfx-api.algorand.co'

// localStorage key for persisting bridge state across page reloads
export const BRIDGE_PERSIST_KEY = '__wui_bridge_state__'

/** Minimal bridge state persisted to localStorage for reload recovery. */
interface PersistedBridgeState {
  status: BridgeStatus
  sourceTxId: string
  sourceChainSymbol: string
  sourceTokenSymbol: string
  destChainSymbol: string | null
  destTokenSymbol: string | null
  amount: string
  waitingSince: number
  estimatedTimeMs: number | null
  optInNeeded: boolean
  optInSigned: boolean
  persistedAt: number
}

/** Read persisted bridge state from localStorage, or null if absent/stale/corrupt. */
function getPersistedState(): PersistedBridgeState | null {
  try {
    const raw = localStorage.getItem(BRIDGE_PERSIST_KEY)
    if (!raw) {
      return null
    }
    const p = JSON.parse(raw) as PersistedBridgeState
    const ageMs = Date.now() - p.persistedAt
    // Ignore state older than 1 hour
    if (ageMs > 3_600_000) {
      localStorage.removeItem(BRIDGE_PERSIST_KEY)
      return null
    }
    return p
  } catch {
    return null
  }
}

// Convert a float amount string to integer (smallest token units) for ERC-20 approve.
// Avoids floating-point by splitting at the decimal point and padding.
function floatToSmallestUnit(amount: string, decimals: number): string {
  const [whole = '0', frac = ''] = amount.split('.')
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole + paddedFrac).toString()
}

// Extract a human-readable message from any thrown value.
// Handles standard Errors, MetaMask EthereumProviderErrors (cross-realm, not
// instanceof Error), and plain objects with a message property.
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err !== null && typeof err === 'object' && 'message' in err) {
    return String((err as Record<string, unknown>).message)
  }
  return 'Bridge failed'
}

/** Returns the chain and token with the highest non-dust balance, or null if all are dust/zero. */
function preferredChainAndToken(
  balances: TokenBalanceMap,
  chains: ChainDetailsWithTokens[],
): { chain: ChainDetailsWithTokens; token: TokenWithChainDetails } | null {
  let preferredChain: ChainDetailsWithTokens | null = null
  let preferredToken: TokenWithChainDetails | null = null
  let balanceDisplay = 0
  for (const c of chains) {
    for (const t of c.tokens) {
      const bal = balances[`${c.chainSymbol}:${t.symbol}`] ?? 0n
      const d = Number(bal) / 10 ** t.decimals
      if (Math.floor(d * 100) === 0) continue // skip dust
      if (d > balanceDisplay) {
        balanceDisplay = d
        preferredChain = c
        preferredToken = t
      }
    }
  }
  return balanceDisplay > 0 ? { chain: preferredChain!, token: preferredToken! } : null
}

// Map Allbridge chain symbols to their native currency ticker for fee display
export function useBridgePanel(wallet: BridgeWalletAdapter, options: UseBridgeOptions = {}): UseBridgePanelReturn {
  const { activeAddress, algodClient, signTransactions, onTransactionSuccess, evmAddress, isAlgoXEvm, getEvmProvider, algorandAccountInfo, algorandAccountInfoFetched, onRefreshAlgorandBalance } = wallet
  const enabled = options.enabled ?? true

  // Persisted bridge state for reload recovery
  const persistedRef = useRef(getPersistedState())

  // SDK state
  const sdkRef = useRef<AllbridgeCoreSdk | null>(null)
  const [sdkAvailable, setSdkAvailable] = useState<boolean | null>(null)
  const [allChains, setAllChains] = useState<ChainDetailsWithTokens[]>([])
  const [chainsLoading, setChainsLoading] = useState(false)

  // Token balance state
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceMap>({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [evmBalancesFetchedOnce, setEvmBalancesFetchedOnce] = useState(false)
  const [algoBalancesFetchedOnce, setAlgoBalancesFetchedOnce] = useState(false)
  const prevEvmAddressRef = useRef<string | null>(evmAddress ?? null)
  const prevAlgorandAddressRef = useRef<string | null>(null)

  // Selection state
  const [selectedSourceChainSymbol, setSelectedSourceChainSymbol] = useState<string | null>(null)
  const [selectedSourceTokenSymbol, setSelectedSourceTokenSymbol] = useState<string | null>(null)
  const [selectedDestChainSymbol, setSelectedDestChainSymbol] = useState<string | null>(null)
  const [selectedDestTokenSymbol, setSelectedDestTokenSymbol] = useState<string | null>(null)

  // Amount state
  const [amount, setAmount] = useState('')
  const [receivedAmount, setReceivedAmount] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  // Fee state
  const [gasFee, setGasFee] = useState<string | null>(null)
  const [gasFeeLoading, setGasFeeLoading] = useState(false)
  // Raw extra gas amount in stablecoin float (e.g. "0.04000000").
  // Mirrored as state (in addition to extraGasRef) so the quote effect can react to changes.
  const [extraGasAmount, setExtraGasAmount] = useState<string | null>(null)
  // Approximate ALGO received from extra gas conversion (e.g. "~0.123 ALGO")
  const [extraGasAlgo, setExtraGasAlgo] = useState<string | null>(null)
  const [totalFee, setTotalFee] = useState<string | null>(null)

  // Transfer state
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sourceTxId, setSourceTxId] = useState<string | null>(null)
  const [estimatedTimeMs, setEstimatedTimeMs] = useState<number | null>(null)
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const [transferStatus, setTransferStatus] = useState<TransferStatusResponse | null>(null)
  // Direct source chain confirmation counts (independent of Allbridge indexing lag)
  const [localSendConfirmations, setLocalSendConfirmations] = useState<number>(0)

  // Opt-in state
  const [optInNeeded, setOptInNeeded] = useState(false)
  const [optInSigned, setOptInSigned] = useState(false)
  const [watchingForFunding, setWatchingForFunding] = useState(false)
  const [optInConfirmed, setOptInConfirmed] = useState(false)
  const signedOptInRef = useRef<Uint8Array | null>(null)
  const optInTxIdRef = useRef<string | null>(null)

  // Pre-computed extra gas in stablecoin (float), set by the gas-fee effect.
  // When non-null, handleBridge switches to WITH_STABLECOIN payment and adds
  // the stablecoin fee + extra gas on top of the user's amount.
  const extraGasRef = useRef<string | null>(null)
  // Stablecoin gas fee (int format) — stored when extra gas is active so
  // handleBridge can add it to the transfer amount.
  const stablecoinFeeRef = useRef<{ int: string; float: string } | null>(null)

  // Tracks whether the user has manually selected a source chain (prevents auto-reselection)
  const userHasSelectedChainRef = useRef(false)

  // Abort ref for cleanup
  const abortRef = useRef<AbortController | null>(null)

  // -- Derived values --

  const algorandAddress = activeAddress ?? null

  // Direction flag: true when bridging FROM Algorand TO an EVM chain
  const sourceIsAlgorand = selectedSourceChainSymbol === 'ALG'

  // Not conditioned on source direction - flags only reset on address changes.
  const balancesFetchedOnce =
    (!evmAddress || evmBalancesFetchedOnce) &&
    (!algorandAddress || algoBalancesFetchedOnce)
  // True once chains are loaded AND - if a wallet is connected - both EVM and ALG
  // balance fetches have settled, so the chain select renders with final labels on first paint.
  const initialLoadComplete = allChains.length > 0 && balancesFetchedOnce

  // Effective destination chain: defaults to ALG for EVM→ALG, or the selected EVM chain for ALG→EVM
  const effectiveDestChainSymbol = selectedDestChainSymbol ?? 'ALG'

  // Fee display unit — always the source token symbol (e.g. USDC) since fees
  // are inclusive and paid in the source token via stablecoin payment.
  const gasFeeUnit = selectedSourceTokenSymbol ?? null

  // Convert SDK chains to BridgeChain format (EVM + ALG as source options)
  // Attach token balances and sort EVM chains by total balance descending
  const chains: BridgeChain[] = useMemo(() => {
    const mapped = allChains
      .filter((c) => c.chainType === 'EVM' || c.chainSymbol === 'ALG')
      .map((c) => {
        const tokens = c.tokens.map((t: TokenWithChainDetails) => {
          const balKey = `${c.chainSymbol}:${t.symbol}`
          const rawBal = tokenBalances[balKey]
          return {
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            chainSymbol: c.chainSymbol,
            chainName: c.name,
            balance: rawBal != null ? rawBal.toString() : undefined,
          }
        })
        return {
          chainSymbol: c.chainSymbol,
          chainName: c.name,
          chainId: c.chainId,
          tokens,
        }
      })

    // Sort EVM chains by total normalized balance; keep ALG at the end
    const hasAnyBalance = Object.keys(tokenBalances).length > 0
    const evmChains = mapped.filter((c) => c.chainSymbol !== 'ALG')
    const algChains = mapped.filter((c) => c.chainSymbol === 'ALG')

    if (hasAnyBalance) {
      evmChains.sort((a, b) => {
        const totalA = a.tokens.reduce((sum, t) => {
          const bal = tokenBalances[`${a.chainSymbol}:${t.symbol}`] ?? 0n
          const normalized = bal * 10n ** BigInt(18 - t.decimals)
          return sum + normalized
        }, 0n)
        const totalB = b.tokens.reduce((sum, t) => {
          const bal = tokenBalances[`${b.chainSymbol}:${t.symbol}`] ?? 0n
          const normalized = bal * 10n ** BigInt(18 - t.decimals)
          return sum + normalized
        }, 0n)
        if (totalB > totalA) return 1
        if (totalB < totalA) return -1
        return 0
      })
    }

    return [...evmChains, ...algChains]
  }, [allChains, tokenBalances])

  // Confirmations required on the source chain (from SDK token metadata)
  const sourceConfirmationsNeeded: number | null = useMemo(() => {
    if (!selectedSourceChainSymbol || !selectedSourceTokenSymbol) return null
    const chain = allChains.find((c) => c.chainSymbol === selectedSourceChainSymbol)
    const token = chain?.tokens.find((t: TokenWithChainDetails) => t.symbol === selectedSourceTokenSymbol)
    return (token as unknown as { confirmations?: number })?.confirmations ?? null
  }, [allChains, selectedSourceChainSymbol, selectedSourceTokenSymbol])

  // Available destination chains: when source is ALG, offer EVM chains; otherwise empty (static ALG)
  const destinationChains: BridgeChain[] = useMemo(() => {
    if (!sourceIsAlgorand) return []
    return chains.filter((c) => c.chainSymbol !== 'ALG')
  }, [chains, sourceIsAlgorand])

  // Resolve selected SDK tokens
  const sourceChain = chains.find((c) => c.chainSymbol === selectedSourceChainSymbol) ?? null
  const sourceToken = sourceChain?.tokens.find((t) => t.symbol === selectedSourceTokenSymbol) ?? null
  const destinationChain = (() => {
    if (sourceIsAlgorand) {
      return destinationChains.find((c) => c.chainSymbol === effectiveDestChainSymbol) ?? destinationChains[0] ?? null
    }
    // EVM→ALG: dest is always the ALG chain entry
    return chains.find((c) => c.chainSymbol === 'ALG') ?? null
  })()
  const destinationToken = (() => {
    const destChainSym = effectiveDestChainSymbol
    const sdkChain = allChains.find((c) => c.chainSymbol === destChainSym)
    if (!sdkChain) return null
    const t = sdkChain.tokens.find((t: TokenWithChainDetails) => t.symbol === selectedDestTokenSymbol) ?? sdkChain.tokens[0]
    if (!t) return null
    return { symbol: t.symbol, name: t.name, decimals: t.decimals, chainSymbol: destChainSym, chainName: sdkChain.name }
  })()

  // Resolve full SDK TokenWithChainDetails for API calls
  const resolveSourceSdkToken = useCallback((): TokenWithChainDetails | null => {
    if (!selectedSourceChainSymbol || !selectedSourceTokenSymbol) return null
    const chain = allChains.find((c) => c.chainSymbol === selectedSourceChainSymbol)
    return chain?.tokens.find((t: TokenWithChainDetails) => t.symbol === selectedSourceTokenSymbol) ?? null
  }, [allChains, selectedSourceChainSymbol, selectedSourceTokenSymbol])

  const resolveDestSdkToken = useCallback((): TokenWithChainDetails | null => {
    const chain = allChains.find((c) => c.chainSymbol === effectiveDestChainSymbol)
    if (!chain) return null
    return chain.tokens.find((t: TokenWithChainDetails) => t.symbol === (selectedDestTokenSymbol ?? '')) ?? chain.tokens[0] ?? null
  }, [allChains, effectiveDestChainSymbol, selectedDestTokenSymbol])

  // -- Initialize SDK and load chains --
  // Runs on mount regardless of `enabled` so chain data is preloaded.
  // Balances, fees, and quotes are still gated on `enabled`.

  useEffect(() => {
    if (sdkRef.current && allChains.length > 0) return // already initialized

    let cancelled = false
    setChainsLoading(true)
    ;(async () => {
      try {
        const sdk = await getOrCreateSdk(options.nodeRpcUrls)
        if (cancelled) return
        sdkRef.current = sdk
        setSdkAvailable(true)
      } catch (err) {
        console.warn('[useBridgePanel] SDK init failed:', err)
        if (!cancelled) setSdkAvailable(false)
      }

      // Fetch chains separately so SDK availability isn't affected by network errors
      const sdk = sdkRef.current
      if (!sdk || cancelled) {
        if (!cancelled) setChainsLoading(false)
        return
      }

      try {
        const chainList = await fetchChainDetailsMap(sdk)
        if (cancelled) return
        setAllChains(chainList)

        // Always default to EVM→ALG direction (users can switch to ALG→EVM manually)
        if (evmAddress) {
          const firstEvm = chainList.find((c) => c.chainType === 'EVM')
          if (firstEvm && firstEvm.tokens.length > 0) {
            setSelectedSourceChainSymbol(firstEvm.chainSymbol)
            setSelectedSourceTokenSymbol(firstEvm.tokens[0].symbol)
          }
          setSelectedDestChainSymbol(null) // null defaults to ALG
          const algChain = chainList.find((c) => c.chainSymbol === 'ALG')
          if (algChain && algChain.tokens.length > 0) {
            setSelectedDestTokenSymbol(algChain.tokens[0].symbol)
          }
        }
      } catch (err) {
        console.warn('[useBridgePanel] Chain fetch failed:', err)
      } finally {
        if (!cancelled) setChainsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Handle account change --
  // Disconnect clears all EVM caches; wallet switch keeps to optimize RPC calls.

  useEffect(() => {
    const prevEvm = prevEvmAddressRef.current
    const nextEvm = evmAddress ?? null
    const prevAlgo = prevAlgorandAddressRef.current
    const nextAlgo = algorandAddress
    prevEvmAddressRef.current = nextEvm
    prevAlgorandAddressRef.current = nextAlgo
    if (prevEvm === nextEvm && prevAlgo === nextAlgo) return
    if (prevEvm && !nextEvm) clearAllEvmBalanceCaches()
    setEvmBalancesFetchedOnce(false)
    setAlgoBalancesFetchedOnce(false)
    setTokenBalances({})
  }, [evmAddress, algorandAddress])

  // -- Fetch EVM token balances (cache-aware) --
  // Cache hit: instant display, zero RPC calls.
  // Cache miss (first visit or post-disconnect): fetch ALL EVM chains so the
  // balance-based chain sort always has complete data.

  useEffect(() => {
    if (!enabled) return
    if (!evmAddress || allChains.length === 0) return

    const cached = getEvmBalanceCache(evmAddress)
    if (cached) {
      setTokenBalances((prev) => ({ ...prev, ...cached }))
      if (!userHasSelectedChainRef.current) {
        const p = preferredChainAndToken(cached, allChains.filter((c) => c.chainType === 'EVM'))
        if (p) {
          setSelectedSourceChainSymbol(p.chain.chainSymbol)
          setSelectedSourceTokenSymbol(p.token.symbol)
        }
      }
      setEvmBalancesFetchedOnce(true)
      return
    }

    let cancelled = false
    setBalancesLoading(true)
    ;(async () => {
      try {
        const balances = await fetchEvmTokenBalances(evmAddress, allChains, options.nodeRpcUrls)
        if (cancelled) return
        setEvmBalanceCache(evmAddress, balances)
        setTokenBalances((prev) => ({ ...prev, ...balances }))

        if (!userHasSelectedChainRef.current) {
          const p = preferredChainAndToken(balances, allChains.filter((c) => c.chainType === 'EVM'))
          if (p) {
            setSelectedSourceChainSymbol(p.chain.chainSymbol)
            setSelectedSourceTokenSymbol(p.token.symbol)
          }
        }
      } catch (err) {
        console.warn('[useBridgePanel] EVM balance fetch failed:', err)
      } finally {
        if (!cancelled) {
          setBalancesLoading(false)
          setEvmBalancesFetchedOnce(true)
        }
      }
    })()

    return () => { cancelled = true }
  }, [enabled, evmAddress, allChains, options.nodeRpcUrls])

  // -- Derive Algorand ASA balances from React Query account info --
  // Refreshed automatically on window focus, bridge success, and manual refresh.

  useEffect(() => {
    if (!algorandAddress) return
    const algChain = allChains.find((c) => c.chainSymbol === 'ALG')
    if (algorandAccountInfo && algChain && algChain.tokens.length > 0) {
      const balances: TokenBalanceMap = {}
      for (const token of algChain.tokens) {
        const assetId = Number(token.tokenAddress)
        const holding = algorandAccountInfo.assets?.find(
          (a: { assetId: number | bigint }) => Number(a.assetId) === assetId,
        )
        balances[`ALG:${token.symbol}`] = holding ? BigInt(holding.amount) : 0n
      }
      setTokenBalances((prev) => {
        const withoutAlg = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('ALG:')))
        return { ...withoutAlg, ...balances }
      })
    }
    if (algorandAccountInfoFetched) {
      setAlgoBalancesFetchedOnce(true)
    }
  }, [algorandAccountInfo, algorandAccountInfoFetched, algorandAddress, allChains])

  // -- Fetch gas fees when tokens change --
  // Also checks whether the Algorand account has low balance and pre-computes
  // extra gas (paid in stablecoin, converted to ALGO on the destination chain).

  useEffect(() => {
    if (!enabled) return
    const sdk = sdkRef.current
    const src = resolveSourceSdkToken()
    const dst = resolveDestSdkToken()
    if (!sdk || !src || !dst) {
      setGasFee(null)
      extraGasRef.current = null
      setExtraGasAmount(null)
      setExtraGasAlgo(null)
      return
    }

    // EVM→ALG: block fee calculation until account info resolves - extra gas amount depends on it.
    if (!sourceIsAlgorand && algorandAddress && !algorandAccountInfoFetched) return

    let cancelled = false
    setGasFeeLoading(true)
    ;(async () => {
      try {
        const { Messenger, FeePaymentMethod } = await import('@allbridge/bridge-core-sdk')

        // Fetch bridge gas fees (both native and stablecoin options)
        const fees = await getGasFees(sdk, src, dst, Messenger.ALLBRIDGE)
        if (cancelled) return
        const stableFee = fees[FeePaymentMethod.WITH_STABLECOIN]
        if (stableFee?.float === undefined) {
          throw new Error("Stablecoin fee missing from SDK response, can't proceed with fee calculation")
        }

        // Check whether the Algorand account has low available balance.
        // If below the threshold, include extra gas (paid in stablecoin)
        // so the user receives ALGO for future transactions.
        // Only relevant when destination is Algorand (EVM→ALG direction).
        let extraGasFloat: string | null = null
        let extraGasAlgoValue: string | null = null
        if (!cancelled && !sourceIsAlgorand && algorandAddress) {
          let needsExtraGas = false
          let isZeroBalance = false
          if (algorandAccountInfo) {
            const available = Number(algorandAccountInfo.amount) - Number(algorandAccountInfo.minBalance)
            isZeroBalance = Number(algorandAccountInfo.amount) === 0
            needsExtraGas = available < LOW_BALANCE_THRESHOLD_MICRO
          } else {
            // Fetched but null → account doesn't exist on-chain → bootstrapping from zero
            needsExtraGas = true
            isZeroBalance = true
          }

          if (needsExtraGas) {
            try {
              const limits = await getExtraGasMaxLimits(sdk, src, dst, Messenger.ALLBRIDGE)
              if (cancelled) return
              const stablecoinMax = limits.extraGasMax[FeePaymentMethod.WITH_STABLECOIN]
              const maxFloat = parseFloat(stablecoinMax?.float ?? '0')
              if (maxFloat > 0) {
                // Extra gas in stablecoin terms (≈ USD for USDC/USDT).
                // Cap precision to 8 decimal places to avoid BigInt encoding errors.
                const raw = Math.min(MAX_EXTRA_GAS_USD, maxFloat)
                extraGasFloat = raw.toFixed(8)

                // Estimate ALGO received: proportion of max dest gas based on our request.
                // For zero-balance accounts, add 0.2 ALGO that Allbridge sends to bootstrap
                // the account before the main transfer (covers the initial opt-in funding).
                const gasAmountMaxFloat = parseFloat(limits.destinationChain.gasAmountMax.float ?? '0')
                if (gasAmountMaxFloat > 0) {
                  const algoAmount = (raw / maxFloat) * gasAmountMaxFloat + (isZeroBalance ? 0.2 : 0)
                  extraGasAlgoValue = `~${algoAmount.toFixed(3)} ALGO`
                  // Implicit rate comes entirely from Allbridge's limit endpoints (trust assumption)
                  const implicitAlgoPrice = (maxFloat / gasAmountMaxFloat).toFixed(6)
                  console.log("[useBridgePanel] implicit ALGO/USD price for extra gas:", implicitAlgoPrice)
                }
              }
            } catch (err) {
              console.warn('[useBridgePanel] Could not fetch extra gas limits:', err)
            }
          }
        }

        if (cancelled) return

        extraGasRef.current = extraGasFloat
        // Always store the stablecoin fee so handleBridge can use inclusive
        // stablecoin payment (fee deducted from user's amount, not paid in ETH).
        stablecoinFeeRef.current = { int: stableFee.int, float: stableFee.float }
        setExtraGasAmount(extraGasFloat)
        setExtraGasAlgo(extraGasAlgoValue)
        // Always display the stablecoin fee in source token units for
        // consistency with the inclusive fee model.
        setGasFee(stableFee.float)
      } catch (err) {
        console.error('[useBridgePanel] Fee calculation error:', err)
        if (!cancelled) {
          setGasFee(null)
          extraGasRef.current = null
          stablecoinFeeRef.current = null
          setExtraGasAmount(null)
          setExtraGasAlgo(null)
        }
      } finally {
        if (!cancelled) setGasFeeLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, resolveSourceSdkToken, resolveDestSdkToken, algorandAddress, algorandAccountInfo, algorandAccountInfoFetched, sourceIsAlgorand])

  // -- Compute estimated transfer time when tokens change --

  useEffect(() => {
    if (!enabled) return
    const sdk = sdkRef.current
    const src = resolveSourceSdkToken()
    const dst = resolveDestSdkToken()
    if (!sdk || !src || !dst) {
      setEstimatedTimeMs(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { Messenger } = await import('@allbridge/bridge-core-sdk')
        const eta = getEstimatedTime(sdk, src, dst, Messenger.ALLBRIDGE)
        if (!cancelled) setEstimatedTimeMs(eta)
      } catch {
        if (!cancelled) setEstimatedTimeMs(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, resolveSourceSdkToken, resolveDestSdkToken])

  // -- Debounced quote calculation --
  // Fees are inclusive: the user's input is the total they spend. In stablecoin mode
  // the SDK deducts fee + extra gas from the amount, so the quote must reflect the
  // net amount that actually gets bridged: amount - gasFee - extraGas.

  useEffect(() => {
    const sdk = sdkRef.current
    const src = resolveSourceSdkToken()
    const dst = resolveDestSdkToken()
    if (!sdk || !src || !dst || !amount || parseFloat(amount) <= 0) {
      setReceivedAmount(null)
      setTotalFee(null)
      return
    }

    // Wait for fee calculation to complete before computing the quote.
    // Without this, the quote runs with the full amount (no fee deduction)
    // and displays an inflated "You receive" value.
    if (gasFeeLoading) {
      setReceivedAmount(null)
      setTotalFee(null)
      return
    }

    // Fees are inclusive: always subtract stablecoin fee + extra gas from the
    // input so the quote reflects what the user actually receives.
    // Assumes gasFee is always in source token units (stablecoin fee path).
    let quoteAmount = amount
    if (gasFee) {
      const extra = extraGasAmount ? parseFloat(extraGasAmount) : 0
      const net = parseFloat(amount) - parseFloat(gasFee) - extra
      if (net <= 0) {
        setReceivedAmount(null)
        setTotalFee(null)
        return
      }
      // Cap decimals to source token precision (e.g. 6 for USDC) to avoid
      // Allbridge SDK "decimals cannot be greater than N" errors.
      quoteAmount = parseFloat(net.toFixed(src.decimals)).toString()
    }

    let cancelled = false
    setQuoteLoading(true)

    const timer = setTimeout(async () => {
      try {
        const { Messenger } = await import('@allbridge/bridge-core-sdk')
        const result = await getQuote(sdk, quoteAmount, src, dst, Messenger.ALLBRIDGE)
        if (!cancelled) {
          setReceivedAmount(result)
          // LP fee is not returned separately, it's implicit in getQuote return value.
          // See: https://docs-core.allbridge.io/product/how-does-allbridge-core-work/fees#pool-based-transfers
          const lpFee = parseFloat(quoteAmount) - parseFloat(result)
          const effectiveFee = parseFloat(gasFee ?? '0') + lpFee
          const totalFeeValue = effectiveFee.toFixed(src.decimals)
          setTotalFee(totalFeeValue)
          const feeLog = {
            relayer: gasFee,
            lp: lpFee.toFixed(src.decimals),
            lpPercentage: `${((lpFee / (parseFloat(quoteAmount) + parseFloat(gasFee ?? '0'))) * 100).toFixed(2)}%`,
            total: totalFeeValue,
          }
          console.log('[useBridgePanel] fees', feeLog)
        }
      } catch (err) {
        console.error('[useBridgePanel] Quote calculation error:', err)
        if (!cancelled) {
          setReceivedAmount(null)
          setTotalFee(null)
        }
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [amount, gasFee, gasFeeLoading, extraGasAmount, resolveSourceSdkToken, resolveDestSdkToken])

  // -- Refresh EVM balances after a successful bridge (both directions) --
  // ALG balances refresh via onTransactionSuccess; this refreshes the EVM chain involved.

  useEffect(() => {
    if (status !== 'success' || !evmAddress) return
    const evmChainSymbol = sourceIsAlgorand ? effectiveDestChainSymbol : selectedSourceChainSymbol
    if (!evmChainSymbol) return
    const chainToRefresh = allChains.find((c) => c.chainSymbol === evmChainSymbol)
    if (!chainToRefresh) return
    fetchEvmTokenBalances(evmAddress, [chainToRefresh], options.nodeRpcUrls)
      .then((balances) => {
        setEvmBalanceCache(evmAddress, { ...getEvmBalanceCache(evmAddress) ?? {}, ...balances })
        setTokenBalances((prev) => ({ ...prev, ...balances }))
      })
      .catch(() => {})
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Transfer status polling --

  // Poll interval: 1/12th of estimated bridge time (e.g. 120s bridge → 10s poll), clamped to [3s, 30s]
  const pollIntervalMs = useMemo(() => {
    if (!estimatedTimeMs) return 10_000
    return Math.max(3_000, Math.min(30_000, Math.round(estimatedTimeMs / 12)))
  }, [estimatedTimeMs])

  useEffect(() => {
    console.log('[useBridgePanel] transfer status poll effect: status=%s sourceTxId=%s chain=%s', status, sourceTxId, selectedSourceChainSymbol)
    if (status !== 'waiting' || !sourceTxId || !selectedSourceChainSymbol) return
    const sdk = sdkRef.current
    if (!sdk) return

    console.log('[useBridgePanel] starting transfer status poll for txId=%s chain=%s (interval=%dms)', sourceTxId, selectedSourceChainSymbol, pollIntervalMs)
    const controller = new AbortController()
    abortRef.current = controller

    const poll = async () => {
      while (!controller.signal.aborted) {
        try {
          const st = await getTransferStatus(sdk, selectedSourceChainSymbol, sourceTxId)
          if (controller.signal.aborted) return
          console.log('[Allbridge] transferStatus', JSON.stringify(st, null, 2))
          setTransferStatus(st)

          const isComplete =
            st.send &&
            st.send.confirmations >= st.send.confirmationsNeeded &&
            st.signaturesCount >= st.signaturesNeeded &&
            st.receive &&
            st.receive.confirmations >= st.receive.confirmationsNeeded

          if (isComplete) {
            setStatus('success')
            onTransactionSuccess?.()
            return
          }
        } catch (pollErr) {
          console.warn('[useBridgePanel] transferStatus poll error:', pollErr)
        }

        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, pollIntervalMs)
          controller.signal.addEventListener('abort', () => {
            clearTimeout(t)
            resolve()
          })
        })
      }
    }

    poll()
    return () => controller.abort()
  }, [status, sourceTxId, selectedSourceChainSymbol, pollIntervalMs, sdkAvailable])

  // -- EVM source chain confirmation polling --
  // Tracks EVM block confirmations in parallel with Allbridge API polling.

  useEffect(() => {
    if (status !== 'waiting' || !sourceTxId || !selectedSourceChainSymbol) return
    if (sourceIsAlgorand) return // Algorand confirmations counted inline in handleAlgorandBridge

    const controller = new AbortController()

    const pollEvm = async () => {
      const rpcUrl = DEFAULT_RPC_URLS[selectedSourceChainSymbol]
      if (!rpcUrl) return
      let txBlock: number | null = null
      while (!controller.signal.aborted) {
        try {
          if (txBlock === null) {
            const res = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [sourceTxId] }),
            })
            const json = (await res.json()) as { result?: { blockNumber?: string; status?: string } | null }
            if (json.result?.blockNumber) {
              if (json.result.status === '0x0') {
                setStatus('error')
                setError('EVM transaction reverted')
                controller.abort()
                return
              }
              txBlock = parseInt(json.result.blockNumber, 16)
            }
          }
          if (txBlock !== null) {
            const res = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
            })
            const json = (await res.json()) as { result?: string }
            if (json.result) {
              setLocalSendConfirmations(parseInt(json.result, 16) - txBlock + 1)
            }
          }
        } catch {
          // ignore
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, pollIntervalMs)
          controller.signal.addEventListener('abort', () => {
            clearTimeout(t)
            resolve()
          })
        })
      }
    }

    pollEvm()

    return () => controller.abort()
  }, [status, sourceTxId, sourceIsAlgorand, selectedSourceChainSymbol, pollIntervalMs])

  // -- Cleanup: switch back to Algorand chain on unmount --

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Restore persisted bridge state after chains are loaded --

  useEffect(() => {
    if (!enabled || allChains.length === 0 || !persistedRef.current) return
    const p = persistedRef.current
    persistedRef.current = null

    setStatus(p.status as BridgeStatus)
    setSourceTxId(p.sourceTxId)
    setSelectedSourceChainSymbol(p.sourceChainSymbol)
    setSelectedSourceTokenSymbol(p.sourceTokenSymbol)
    setSelectedDestChainSymbol(p.destChainSymbol)
    setSelectedDestTokenSymbol(p.destTokenSymbol)
    setAmount(p.amount)
    setWaitingSince(p.waitingSince)
    setEstimatedTimeMs(p.estimatedTimeMs)
    setOptInNeeded(p.optInNeeded)
    setOptInSigned(p.optInSigned)
    userHasSelectedChainRef.current = true
  }, [enabled, allChains.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Persist bridge state to localStorage when in long-running states --

  useEffect(() => {
    const shouldPersist =
      (status === 'waiting' || status === 'watching-funding' || status === 'opt-in-sent') &&
      sourceTxId &&
      selectedSourceChainSymbol &&
      selectedSourceTokenSymbol
    if (shouldPersist) {
      try {
        const state: PersistedBridgeState = {
          status: 'waiting', // always restore as 'waiting' — imperative flows (opt-in, funding watch) cannot resume
          sourceTxId,
          sourceChainSymbol: selectedSourceChainSymbol,
          sourceTokenSymbol: selectedSourceTokenSymbol,
          destChainSymbol: selectedDestChainSymbol,
          destTokenSymbol: selectedDestTokenSymbol,
          amount,
          waitingSince: waitingSince ?? Date.now(),
          estimatedTimeMs,
          optInNeeded,
          optInSigned,
          persistedAt: Date.now(),
        }
        localStorage.setItem(BRIDGE_PERSIST_KEY, JSON.stringify(state))
      } catch {}
    } else if (status === 'success' || status === 'error' || status === 'idle') {
      try { localStorage.removeItem(BRIDGE_PERSIST_KEY) } catch {}
    }
  }, [status, sourceTxId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Actions --

  const refreshBalances = useCallback(async () => {
    setBalancesLoading(true)
    try {
      // Refresh EVM balances
      if (evmAddress && allChains.length > 0) {
        const evmChains = allChains.filter((c) => c.chainType === 'EVM')
        const balances = await fetchEvmTokenBalances(evmAddress, evmChains, options.nodeRpcUrls)
        setEvmBalanceCache(evmAddress, balances)
        setTokenBalances((prev) => ({ ...prev, ...balances }))
      }
      // Refresh Algorand balances
      await onRefreshAlgorandBalance?.()
    } catch (err) {
      console.warn('[useBridgePanel] Refresh failed:', err)
    } finally {
      setBalancesLoading(false)
    }
  }, [evmAddress, allChains, onRefreshAlgorandBalance, options.nodeRpcUrls]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    abortRef.current?.abort()
    try { localStorage.removeItem(BRIDGE_PERSIST_KEY) } catch {}
    setAmount('')
    setReceivedAmount(null)
    setTotalFee(null)
    setStatus('idle')
    setError(null)
    setSourceTxId(null)
    setTransferStatus(null)
    setEstimatedTimeMs(null)
    setWaitingSince(null)
    setOptInNeeded(false)
    setOptInSigned(false)
    setWatchingForFunding(false)
    setOptInConfirmed(false)
    signedOptInRef.current = null
    optInTxIdRef.current = null
    extraGasRef.current = null
    stablecoinFeeRef.current = null
    userHasSelectedChainRef.current = false
    setExtraGasAmount(null)
    setExtraGasAlgo(null)
    setLocalSendConfirmations(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  const setSourceChain = useCallback(
    (symbol: string) => {
      userHasSelectedChainRef.current = true
      setSelectedSourceChainSymbol(symbol)
      // Auto-select the highest-balance token - mirrors what formatChainLabel shows in the dropdown label
      const chain = chains.find((c) => c.chainSymbol === symbol)
      if (chain && chain.tokens.length > 0) {
        // Dust amounts (round to 0.00) are skipped; fall back to USDC when all are dust or zero
        const toDisplay = (t: BridgeToken) => (t.balance ? Number(t.balance) / 10 ** t.decimals : 0)
        const defaultToken = chain.tokens.find((t) => t.symbol === 'USDC') ?? chain.tokens[0]
        const winner = chain.tokens.reduce((acc, t) => {
          const d = toDisplay(t)
          return Math.floor(d * 100) > 0 && d > toDisplay(acc) ? t : acc
        }, defaultToken)
        setSelectedSourceTokenSymbol(winner.symbol)
      } else {
        setSelectedSourceTokenSymbol(null)
      }

      // Update destination chain based on direction
      if (symbol === 'ALG') {
        // ALG→EVM: set dest to first EVM chain
        const firstEvm = chains.find((c) => c.chainSymbol !== 'ALG')
        if (firstEvm) {
          setSelectedDestChainSymbol(firstEvm.chainSymbol)
          const destSdkChain = allChains.find((c) => c.chainSymbol === firstEvm.chainSymbol)
          if (destSdkChain && destSdkChain.tokens.length > 0) {
            setSelectedDestTokenSymbol(destSdkChain.tokens[0].symbol)
          }
        }
      } else {
        // EVM→ALG: dest is always ALG
        setSelectedDestChainSymbol(null)
        const algChain = allChains.find((c) => c.chainSymbol === 'ALG')
        if (algChain && algChain.tokens.length > 0) {
          setSelectedDestTokenSymbol(algChain.tokens[0].symbol)
        }
      }

      setReceivedAmount(null)
    },
    [chains, allChains],
  )

  const setDestinationChain = useCallback(
    (symbol: string) => {
      setSelectedDestChainSymbol(symbol)
      // Auto-select first token of the new destination chain
      const sdkChain = allChains.find((c) => c.chainSymbol === symbol)
      if (sdkChain && sdkChain.tokens.length > 0) {
        setSelectedDestTokenSymbol(sdkChain.tokens[0].symbol)
      } else {
        setSelectedDestTokenSymbol(null)
      }
      setReceivedAmount(null)
    },
    [allChains],
  )

  const setSourceTokenBySymbol = useCallback((symbol: string) => {
    setSelectedSourceTokenSymbol(symbol)
    setReceivedAmount(null)
  }, [])

  const setDestinationTokenBySymbol = useCallback((symbol: string) => {
    setSelectedDestTokenSymbol(symbol)
    setReceivedAmount(null)
  }, [])

  // -- Opt-in helpers --

  async function checkAndPrepareOptIn(destSdkToken: TokenWithChainDetails): Promise<{ needed: boolean; canAfford: boolean }> {
    if (!algorandAddress || !algodClient) return { needed: false, canAfford: false }

    const info = algorandAccountInfo ?? await algodClient.accountInformation(algorandAddress).do()
    const assetId = Number(destSdkToken.tokenAddress)
    const isOptedIn = info.assets?.some((a: { assetId: number | bigint }) => Number(a.assetId) === assetId)

    if (isOptedIn) return { needed: false, canAfford: true }

    const available = Number(info.amount) - Number(info.minBalance)
    return { needed: true, canAfford: available >= OPT_IN_COST_MICRO }
  }

  async function buildAndSignOptIn(destSdkToken: TokenWithChainDetails): Promise<void> {
    if (!algorandAddress || !algodClient) throw new Error('Wallet not connected')

    const params = await algodClient.getTransactionParams().do()
    // Max validity window: 1000 rounds
    params.lastValid = params.firstValid + BigInt(1000)

    const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: algorandAddress,
      receiver: algorandAddress,
      amount: 0,
      assetIndex: Number(destSdkToken.tokenAddress),
      suggestedParams: params,
    })

    const signedTxns = await signTransactions([txn.toByte()])
    const signed = signedTxns[0]
    if (!signed) throw new Error('Opt-in transaction was not signed')

    signedOptInRef.current = signed
    optInTxIdRef.current = txn.txID()
    setOptInSigned(true)
  }

  async function submitOptIn(): Promise<void> {
    if (!algodClient || !signedOptInRef.current || !optInTxIdRef.current) {
      throw new Error('No signed opt-in transaction available')
    }

    try {
      await algodClient.sendRawTransaction(signedOptInRef.current).do()
    } catch (err) {
      // DFX may have already submitted this transaction — that's expected.
      // We still wait for confirmation below.
      const msg = getErrorMessage(err)
      if (!/already in ledger/i.test(msg)) throw err
      console.log('[useBridgePanel] opt-in already in ledger (submitted by DFX)')
    }
    await algosdk.waitForConfirmation(algodClient, optInTxIdRef.current, 4)
    setOptInConfirmed(true)
    onTransactionSuccess?.()
  }

  async function watchForFundingAndOptIn(): Promise<void> {
    if (!algorandAddress || !algodClient || !signedOptInRef.current || !optInTxIdRef.current) {
      throw new Error('Missing state for funding watch')
    }

    setWatchingForFunding(true)

    const nodeStatus = await algodClient.status().do()
    let currentRound = BigInt(nodeStatus.lastRound)

    // Watch for up to 1000 rounds (matching our tx validity window)
    const maxRounds = 1000
    for (let i = 0; i < maxRounds; i++) {
      // Wait for next block
      const blockStatus = await algodClient.statusAfterBlock(currentRound).do()
      currentRound = BigInt(blockStatus.lastRound)

      // Check balance
      const info = await algodClient.accountInformation(algorandAddress).do()
      const available = Number(info.amount) - Number(info.minBalance)

      if (available >= OPT_IN_COST_MICRO) {
        // Allbridge has funded the account — submit opt-in
        setWatchingForFunding(false)
        setStatus('opt-in-sent')
        await submitOptIn()
        return
      }
    }

    // If we exhausted the window, the pre-signed tx is expired
    setWatchingForFunding(false)
    throw new Error('Timed out waiting for account funding. Please try again.')
  }

  /** Submit the signed opt-in transaction to DFX for deferred execution.
   *  Falls back to direct submission if DFX rejects (account already funded). */
  async function submitOptInToDfx(): Promise<void> {
    if (!signedOptInRef.current) throw new Error('No signed opt-in transaction')

    const bytes = signedOptInRef.current
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    const b64 = btoa(binary)

    try {
      const res = await fetch(`${DFX_API_URL}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTxns: [b64] }),
      })
      const result = (await res.json()) as { status: string; txId?: string; error?: string }
      console.log('[useBridgePanel] DFX submit response:', result)

      if (result.status === 'deferred') {
        // DFX accepted — it will submit when the account has funds
        return
      }
    } catch (err) {
      console.warn('[useBridgePanel] DFX submission failed, falling back to direct submit:', err)
    }

    // DFX rejected (already valid) or unreachable — submit directly
    await submitOptIn()
  }

  // -- Algorand → EVM bridge handler --

  const handleAlgorandBridge = useCallback(async () => {
    const sdk = sdkRef.current
    const srcSdkToken = resolveSourceSdkToken()
    const dstSdkToken = resolveDestSdkToken()

    if (!sdk || !srcSdkToken || !dstSdkToken || !algorandAddress || !evmAddress || !amount || !algodClient) {
      return
    }

    setStatus('signing')
    setError(null)
    setSourceTxId(null)
    setTransferStatus(null)
    setOptInNeeded(false)
    setOptInSigned(false)
    setOptInConfirmed(false)
    setWatchingForFunding(false)

    setLocalSendConfirmations(0)

    try {
      const { Messenger, FeePaymentMethod } = await import('@allbridge/bridge-core-sdk')

      // Build send params — Algorand has no token approval, no extra gas for ALG→EVM
      const stableFee = stablecoinFeeRef.current
      const useStablecoin = !!stableFee
      const sendParams = {
        amount,
        fromAccountAddress: algorandAddress,
        toAccountAddress: evmAddress,
        sourceToken: srcSdkToken,
        destinationToken: dstSdkToken,
        messenger: Messenger.ALLBRIDGE,
        ...(useStablecoin
          ? {
              gasFeePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
              fee: stableFee.int,
            }
          : {
              gasFeePaymentMethod: FeePaymentMethod.WITH_NATIVE_CURRENCY,
            }),
      }

      console.log('[Allbridge] ALG sendParams', JSON.stringify(sendParams, null, 2))

      // SDK returns hex-encoded unsigned transactions for Algorand
      const rawTxs = (await sdk.bridge.rawTxBuilder.send(sendParams)) as string[]
      console.log('[Allbridge] ALG rawTxs (hex)', rawTxs)

      // Decode hex strings to Uint8Array[]
      const txBytes = rawTxs.map((hex) => {
        const bytes = new Uint8Array(hex.length / 2)
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
        }
        return bytes
      })

      // Find the application call transaction — Allbridge status API
      // tracks by the app call txid, not the asset transfer txid.
      let appCallTxId: string | null = null
      for (const raw of txBytes) {
        try {
          const decoded = algosdk.decodeUnsignedTransaction(raw)
          if (decoded.type === algosdk.TransactionType.appl) {
            appCallTxId = decoded.txID()
            break
          }
        } catch {
          // skip decode errors
        }
      }

      // Sign via Algorand wallet
      const signedTxns = await signTransactions(txBytes)

      // Submit signed transactions
      setStatus('sending')
      const signedBytes = signedTxns.filter((s): s is Uint8Array => s != null)
      if (signedBytes.length === 0) throw new Error('No signed transactions returned')

      const { txid } = await algodClient.sendRawTransaction(signedBytes).do()
      // Wait for initial confirmation using whichever txid we have
      const confirmTxId = appCallTxId ?? txid
      await algosdk.waitForConfirmation(algodClient, confirmTxId, 4)

      // Use the app call txid for status tracking (Allbridge expects it)
      setSourceTxId(confirmTxId)

      // Algorand has instant finality — 1 confirmation is sufficient.
      setLocalSendConfirmations(1)

      setStatus('waiting')
      setWaitingSince(Date.now())

      // Transfer status polling takes over via the useEffect above
    } catch (err) {
      console.error('[useBridgePanel] Algorand bridge failed:', err)
      setStatus('error')
      setError(getErrorMessage(err))
    }
  }, [
    resolveSourceSdkToken,
    resolveDestSdkToken,
    algorandAddress,
    evmAddress,
    amount,
    algodClient,
    signTransactions,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- EVM → Algorand bridge handler --

  const handleEvmBridge = useCallback(async () => {
    const sdk = sdkRef.current
    const srcSdkToken = resolveSourceSdkToken()
    const dstSdkToken = resolveDestSdkToken()

    console.log('[useBridgePanel] handleEvmBridge tokens', {
      src: { chainSymbol: srcSdkToken?.chainSymbol, symbol: srcSdkToken?.symbol, tokenAddress: srcSdkToken?.tokenAddress },
      dst: { chainSymbol: dstSdkToken?.chainSymbol, symbol: dstSdkToken?.symbol, tokenAddress: dstSdkToken?.tokenAddress },
    })

    if (!sdk || !srcSdkToken || !dstSdkToken || !getEvmProvider || !algorandAddress || !evmAddress || !amount) {
      return
    }

    if (!getEvmProvider) {
      setError('Wallet does not support EVM provider access')
      setStatus('error')
      return
    }

    setStatus('signing')
    setError(null)
    setSourceTxId(null)
    setTransferStatus(null)
    setOptInNeeded(false)
    setOptInSigned(false)
    setOptInConfirmed(false)
    setWatchingForFunding(false)

    setLocalSendConfirmations(0)

    try {
      const { Messenger, FeePaymentMethod, AmountFormat } = await import('@allbridge/bridge-core-sdk')

      // 1. Check opt-in status on Algorand
      const optInCheck = await checkAndPrepareOptIn(dstSdkToken)
      setOptInNeeded(optInCheck.needed)

      // Use the pre-computed extra gas (stablecoin, converted to ALGO on destination).
      // Applied whenever the gas-fee effect determined the account has low balance.
      const extraGas = extraGasRef.current ?? undefined

      // 2. Get EVM provider and detect current chain
      const evmProvider = await getEvmProvider()
      const sourceChainData = allChains.find((c) => c.chainSymbol === srcSdkToken.chainSymbol)
      let onSourceEvmChain = false
      if (sourceChainData?.chainId) {
        try {
          const currentChainId = (await evmProvider.request({ method: 'eth_chainId' })) as string
          onSourceEvmChain = BigInt(currentChainId) === BigInt(sourceChainData.chainId)
        } catch {
          // Fall back to assuming we need to switch
        }
      }

      // 3. If opt-in needed, ALWAYS sign it first (before any EVM operations),
      //    then submit to DFX for deferred execution when funds arrive.
      if (optInCheck.needed) {
        setStatus('opting-in')
        await buildAndSignOptIn(dstSdkToken)
        await submitOptInToDfx()
      }

      // 4. Switch to source EVM chain (skip if already there)
      setStatus('approving')
      if (sourceChainData?.chainId && !onSourceEvmChain) {
        await switchToEvmChain(evmProvider, '0x' + BigInt(sourceChainData.chainId).toString(16))
      }

      // 5. Fees are inclusive: the user's input amount is the total they spend.
      //    In stablecoin mode the SDK deducts fee + extra gas from this amount.
      const stableFee = stablecoinFeeRef.current
      const useStablecoin = !!stableFee
      const bridgeAmount = amount

      // 5b. Pre-flight: check if wallet supports wallet_sendCalls on this chain.
      //     We must know this BEFORE deciding approval strategy so we don't sign
      //     an offline EIP-2612 permit only to discover batching isn't supported.
      let canBatch = true
      try {
        const chainIdHexForCaps = sourceChainData?.chainId
          ? '0x' + BigInt(sourceChainData.chainId).toString(16)
          : undefined
        const capsPromise = evmProvider.request({
          method: 'wallet_getCapabilities',
          params: [evmAddress],
        })
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('wallet_getCapabilities timed out after 5s')), 5000)
        )
        const caps = (await Promise.race([capsPromise, timeoutPromise])) as
          | Record<
              string,
              {
                atomicBatch?: { supported?: boolean } // EIP-5792 draft
                atomic?: { status?: string } // MetaMask Mobile (status: "ready" | "supported")
              }
            >
          | undefined
        console.log('[useBridgePanel] wallet_getCapabilities succeeded', JSON.stringify(caps, null, 2))
        if (caps && chainIdHexForCaps) {
          const chainCaps = caps[chainIdHexForCaps] ?? caps[chainIdHexForCaps.toLowerCase()] ?? caps[chainIdHexForCaps.toUpperCase()]
          canBatch =
            chainCaps?.atomicBatch?.supported === true ||
            chainCaps?.atomic?.status === 'ready' ||
            chainCaps?.atomic?.status === 'supported'
        }
      } catch (capsErr) {
        console.log('[useBridgePanel] wallet_getCapabilities not supported, assuming batching available:', capsErr)
        canBatch = true
      }
      console.log('[useBridgePanel] canBatch:', canBatch)

      // 6. Check allowance; build approval calldata if needed (no submission yet).
      //    For EIP-2612 tokens (only when canBatch): sign offline to bundle with bridge tx.
      //    For standard ERC-20 (or when canBatch=false): build approve calldata.
      const hasAllowance = await sdk.bridge.checkAllowance({
        token: srcSdkToken,
        owner: evmAddress,
        amount: bridgeAmount,
      })

      let approvalCall: { to: string; data: string } | null = null

      if (!hasAllowance) {
        // rawTxBuilder.approve expects integer smallest-unit amount.
        const approveAmountInt = floatToSmallestUnit(bridgeAmount, srcSdkToken.decimals)
        const approveTx = (await sdk.bridge.rawTxBuilder.approve({
          token: srcSdkToken,
          owner: evmAddress,
          amount: approveAmountInt,
        })) as { to: string; data: string }

        const spenderAddress = extractSpenderFromApproveTx(approveTx)
        const chainIdBig = sourceChainData?.chainId ? BigInt(sourceChainData.chainId) : undefined

        // EIP-2612 permit requires its own wallet interaction (eth_signTypedData_v4),
        // so it does NOT reduce prompts when canBatch=true — the batch already
        // handles approve+bridge in one prompt with a standard approve calldata.
        // Only attempt permit when canBatch=false (future: permitAndBridge in one tx).
        const permitCheck =
          !canBatch && chainIdBig
            ? await detectEip2612(srcSdkToken.tokenAddress, evmAddress, evmProvider)
            : { supported: false as const }

        if (permitCheck.supported && permitCheck.nonce !== undefined) {
          // EIP-2612: sign offline — calldata will be bundled with the bridge tx
          setStatus('permit-signing')
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 600) // 10 min
          const permitSig = await buildPermitSignature({
            provider: evmProvider,
            tokenAddress: srcSdkToken.tokenAddress,
            ownerAddress: evmAddress,
            spenderAddress,
            value: BigInt(approveAmountInt),
            nonce: permitCheck.nonce,
            deadline,
            chainId: chainIdBig!,
          })
          approvalCall = {
            to: srcSdkToken.tokenAddress,
            data: encodePermitCalldata({
              owner: evmAddress,
              spender: spenderAddress,
              value: BigInt(approveAmountInt),
              deadline,
              ...permitSig,
            }),
          }
        } else {
          approvalCall = { to: approveTx.to, data: approveTx.data }
        }
      }

      // 7. Build bridge transaction
      const sendParams = {
        amount: bridgeAmount,
        fromAccountAddress: evmAddress,
        toAccountAddress: algorandAddress,
        sourceToken: srcSdkToken,
        destinationToken: dstSdkToken,
        messenger: Messenger.ALLBRIDGE,
        ...(useStablecoin
          ? {
              gasFeePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
              fee: stableFee.int,
              ...(extraGas ? { extraGas, extraGasFormat: AmountFormat.FLOAT } : {}),
            }
          : {
              gasFeePaymentMethod: FeePaymentMethod.WITH_NATIVE_CURRENCY,
            }),
      }

      console.log('[Allbridge] EVM sendParams', JSON.stringify(sendParams, null, 2))

      const rawTx = (await sdk.bridge.rawTxBuilder.send(sendParams)) as {
        from?: string
        to?: string
        value?: string
        data?: string
      }
      console.log('[Allbridge] EVM rawTx', JSON.stringify(rawTx, null, 2))

      // Allbridge SDK returns value as decimal string; EIP-1193 expects hex.
      const bridgeTxValue = rawTx.value ? '0x' + BigInt(rawTx.value).toString(16) : '0x0'
      const eip1193Tx = { ...rawTx, value: bridgeTxValue }

      // 8. Submit: bundle approval + bridge via wallet_sendCalls (single popup),
      //    falling back to sequential eth_sendTransaction if canBatch=false or unsupported.
      setStatus(approvalCall ? (canBatch ? 'bundling' : 'approving') : 'signing')
      let txHash: string

      if (approvalCall) {
        let usedBundle = false
        try {
          if (!canBatch) throw Object.assign(new Error('Batching not supported'), { code: 4200 })

          const chainIdHex = sourceChainData?.chainId
            ? '0x' + BigInt(sourceChainData.chainId).toString(16)
            : undefined
          const sendCallsParams = {
            // IMPORTANT: MetaMask requires exactly '2.0.0' — do NOT change to '2.0'.
            // MetaMask rejects '2.0' with "Version not supported: Got 2.0, expected 2.0.0".
            version: '2.0.0',
            from: evmAddress,
            chainId: chainIdHex,
            atomicRequired: false,
            calls: [
              { to: approvalCall.to, data: approvalCall.data },
              { to: eip1193Tx.to, data: eip1193Tx.data, value: bridgeTxValue },
            ],
          }
          console.log('[useBridgePanel] wallet_sendCalls params', JSON.stringify(sendCallsParams, null, 2))

          const bundleIdRaw = await evmProvider.request({
            method: 'wallet_sendCalls',
            params: [sendCallsParams],
          })
          console.log('[useBridgePanel] wallet_sendCalls raw response type=%s value=%s', typeof bundleIdRaw, JSON.stringify(bundleIdRaw))
          // MetaMask returns { id: '0x...' } instead of a bare string per EIP-5792 spec.
          const bundleId =
            bundleIdRaw && typeof bundleIdRaw === 'object' && 'id' in (bundleIdRaw as object)
              ? (bundleIdRaw as { id: string }).id
              : (bundleIdRaw as string)
          usedBundle = true
          console.log('[useBridgePanel] wallet_sendCalls bundleId type=%s value=%s', typeof bundleId, bundleId)

          setStatus('sending')

          // Poll wallet_getCallsStatus until the bundle is mined
          console.log('[useBridgePanel] wallet_getCallsStatus polling with bundleId type=%s value=%s', typeof bundleId, bundleId)
          while (true) {
            const callsStatus = (await evmProvider.request({
              method: 'wallet_getCallsStatus',
              params: [bundleId],
            })) as {
              status: string | number  // EIP-5792 spec: string ('CONFIRMED'/'FAILED'); MetaMask: HTTP number (200/500)
              receipts?: Array<{ transactionHash: string; status: string }>
            }
            console.log('[useBridgePanel] wallet_getCallsStatus', JSON.stringify(callsStatus, null, 2))

            console.log('[useBridgePanel] wallet_getCallsStatus raw status=%s receipts=%s', callsStatus.status, JSON.stringify(callsStatus.receipts))
            // MetaMask returns HTTP-style numeric status (200 = confirmed, 4xx/5xx = failed)
            // EIP-5792 spec uses string 'CONFIRMED'/'FAILED'
            const isConfirmed = callsStatus.status === 'CONFIRMED' || callsStatus.status === 'confirmed' || callsStatus.status === 200
            const isFailed = callsStatus.status === 'FAILED' || callsStatus.status === 'failed' || (typeof callsStatus.status === 'number' && callsStatus.status >= 400)
            if (isConfirmed) {
              const receipts = callsStatus.receipts ?? []
              console.log('[useBridgePanel] bundle CONFIRMED receipts count=%d', receipts.length, JSON.stringify(receipts))
              const bridgeReceipt = receipts[receipts.length - 1]
              if (!bridgeReceipt) throw new Error('Bundle receipts missing')
              if (bridgeReceipt.status === '0x0') throw new Error('Bridge transaction reverted')
              txHash = bridgeReceipt.transactionHash
              console.log('[useBridgePanel] bundle txHash=%s', txHash)
              break
            }
            if (isFailed) throw new Error('Bundle transaction failed')

            await new Promise((r) => setTimeout(r, 2000))
          }
        } catch (bundleErr) {
          const code = (bundleErr as { code?: number }).code
          console.log('[useBridgePanel] wallet_sendCalls failed (usedBundle=%s, code=%s):', usedBundle, code, bundleErr)
          // Do not fall back if: bundle was already submitted, or user explicitly rejected (4001)
          if (usedBundle || code === 4001) throw bundleErr

          // Sequential fallback: submit approval, wait for mining, then bridge
          console.log('[useBridgePanel] sequential fallback: eth_sendTransaction approval params', JSON.stringify({ from: evmAddress, to: approvalCall.to, data: approvalCall.data }))
          const approvalHash = (await evmProvider.request({
            method: 'eth_sendTransaction',
            params: [{ from: evmAddress, to: approvalCall.to, data: approvalCall.data }],
          })) as string

          let approvalReceipt: unknown = null
          while (!approvalReceipt) {
            approvalReceipt = await evmProvider.request({
              method: 'eth_getTransactionReceipt',
              params: [approvalHash],
            })
            if (!approvalReceipt) await new Promise((r) => setTimeout(r, 2000))
          }

          setStatus('signing')
          const gasEstimate = await evmProvider
            .request({ method: 'eth_estimateGas', params: [eip1193Tx] })
            .catch(() => undefined)
          if (gasEstimate) (eip1193Tx as Record<string, unknown>).gas = gasEstimate

          setStatus('sending')
          txHash = (await evmProvider.request({
            method: 'eth_sendTransaction',
            params: [eip1193Tx],
          })) as string
        }
      } else {
        // No approval needed — single bridge tx
        const gasEstimate = await evmProvider
          .request({ method: 'eth_estimateGas', params: [eip1193Tx] })
          .catch(() => undefined)
        if (gasEstimate) (eip1193Tx as Record<string, unknown>).gas = gasEstimate

        setStatus('sending')
        txHash = (await evmProvider.request({
          method: 'eth_sendTransaction',
          params: [eip1193Tx],
        })) as string
      }

      console.log('[useBridgePanel] setSourceTxId:', txHash, 'optInCheck:', JSON.stringify(optInCheck))
      setSourceTxId(txHash)
      setWaitingSince(Date.now())

      // Opt-in was already signed and submitted to DFX in step 3.
      // DFX will submit when the account has funds. As a local backup,
      // also watch for funding and submit directly (submitOptIn handles
      // the "already in ledger" race if DFX executes first).
      if (optInCheck.needed) {
        if (optInCheck.canAfford) {
          setStatus('opt-in-sent')
          await submitOptIn()
          setStatus('waiting')
        } else {
          setStatus('watching-funding')
          await watchForFundingAndOptIn()
          setStatus('waiting')
        }
      } else {
        setStatus('waiting')
      }

      // Transfer status polling takes over via the useEffect above
    } catch (err) {
      console.error('[useBridgePanel] Bridge failed:', err)
      setStatus('error')
      setError(getErrorMessage(err))
    }
  }, [
    resolveSourceSdkToken,
    resolveDestSdkToken,
    getEvmProvider,
    algorandAddress,
    evmAddress,
    amount,
    allChains,
    algodClient,
    signTransactions,
    onTransactionSuccess,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- Main bridge handler: dispatches by direction --

  const handleBridge = useCallback(async () => {
    if (sourceIsAlgorand) {
      await handleAlgorandBridge()
    } else {
      await handleEvmBridge()
    }
  }, [sourceIsAlgorand, handleAlgorandBridge, handleEvmBridge])

  return {
    isAvailable: (isAlgoXEvm || !!activeAddress) && sdkAvailable !== false,
    chains,
    chainsLoading,
    balancesLoading,
    initialLoadComplete,
    sourceChain,
    setSourceChain,
    sourceToken,
    setSourceToken: setSourceTokenBySymbol,
    destinationChains,
    destinationChain,
    setDestinationChain,
    destinationToken,
    setDestinationToken: setDestinationTokenBySymbol,
    sourceIsAlgorand,
    amount,
    setAmount,
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
    transferStatus: transferStatus
      ? {
          send: {
            confirmations: Math.max(transferStatus.send?.confirmations ?? 0, localSendConfirmations),
            confirmationsNeeded: sourceIsAlgorand ? 1 : (transferStatus.send?.confirmationsNeeded ?? sourceConfirmationsNeeded ?? 0),
          },
          signaturesCount: transferStatus.signaturesCount,
          signaturesNeeded: transferStatus.signaturesNeeded,
          receive: transferStatus.receive
            ? {
                confirmations: transferStatus.receive.confirmations,
                confirmationsNeeded: transferStatus.receive.confirmationsNeeded,
                txId: transferStatus.receive.txId,
              }
            : null,
        }
      : localSendConfirmations > 0 && sourceConfirmationsNeeded != null
        ? {
            send: {
              confirmations: localSendConfirmations,
              confirmationsNeeded: sourceIsAlgorand ? 1 : sourceConfirmationsNeeded,
            },
            signaturesCount: 0,
            signaturesNeeded: 0,
            receive: null,
          }
        : null,
    optInNeeded,
    optInSigned,
    watchingForFunding,
    optInConfirmed,
    status,
    error,
    sourceTxId,
    handleBridge,
    reset,
    retry,
    refreshBalances,
  }
}

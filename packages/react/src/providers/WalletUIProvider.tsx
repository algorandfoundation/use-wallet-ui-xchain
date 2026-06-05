import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useWallet, useWalletManager, useNetwork } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { BeforeSignDialog } from '../components/BeforeSignDialog'
import { BridgeDialog } from '../components/BridgeDialog'
import { EvmConnectDisclaimer } from '../components/EvmConnectDisclaimer'
import { ExtensionSignIndicator } from '../components/ExtensionSignIndicator'
import { WelcomeDialog } from '../components/WelcomeDialog'
import { useResolvedTheme, type Theme, type ResolvedTheme } from '../hooks/useResolvedTheme'
import { BridgeDialogProvider } from './BridgeDialogProvider'
import { decodeTransactions, type TransactionData as DecodedTransaction, type TransactionDanger, NoticeProvider, type NoticesConfig } from '@d13co/algo-x-evm-ui'

import type { NfdLookupResponse, NfdView } from '../hooks/useNfd'
import type { UseSwapOptions } from '../hooks/useSwap'
import { buildHaystackSwapOptions, type SwapRouterLike } from '../utils/useHaystackSwapConfig'
import { AlgoXEvmSdk } from 'algo-x-evm-sdk'

// Extension message constants (duplicated from extension package to avoid cross-dependency)
const EXT_MSG = {
  PING: 'LIQUID_WALLET_COMP_EXT_PING',
  PONG: 'LIQUID_WALLET_COMP_EXT_PONG',
  ANNOUNCE: 'LIQUID_WALLET_COMP_EXT_ANNOUNCE',
  SIGN_REQUEST: 'LIQUID_WALLET_COMP_EXT_SIGN_REQUEST',
  SIGN_RESPONSE: 'LIQUID_WALLET_COMP_EXT_SIGN_RESPONSE',
  SIGN_COMPLETE: 'LIQUID_WALLET_COMP_EXT_SIGN_COMPLETE',
} as const

const EXT_SOURCE = {
  PAGE: 'use-wallet-ui',
  CONTENT: 'liquid-wallet-companion-content',
  POPUP: 'liquid-wallet-companion-popup',
} as const

interface SerializableDecodedTransaction {
  index: number
  type: string
  typeLabel: string
  sender: string
  senderShort: string
  receiver?: string
  receiverShort?: string
  amount?: string
  rawAmount?: string
  assetIndex?: number
  appIndex?: number
  rekeyTo?: string
  rekeyToShort?: string
  closeRemainderTo?: string
  closeRemainderToShort?: string
  freezeTarget?: string
  freezeTargetShort?: string
  isFreezing?: boolean
}

function toSerializableTxn(txn: DecodedTransaction): SerializableDecodedTransaction {
  return {
    ...txn,
    rawAmount: txn.rawAmount !== undefined ? txn.rawAmount.toString() : undefined,
  }
}

// CSS custom properties for theming - injected via JavaScript to avoid requiring CSS imports
const THEME_STYLES_ID = 'wallet-ui-theme-styles'

const lightThemeVars = `
  --wui-color-primary: #2d2df1;
  --wui-color-primary-hover: #2929d9;
  --wui-color-primary-text: #ffffff;
  --wui-color-bg: #ffffff;
  --wui-color-bg-secondary: #f9fafb;
  --wui-color-bg-tertiary: #f3f4f6;
  --wui-color-bg-hover: #e9e9fd;
  --wui-color-text: #1f2937;
  --wui-color-text-secondary: #6b7280;
  --wui-color-text-tertiary: #9ca3af;
  --wui-color-border: #e5e7eb;
  --wui-color-link: rgba(45, 45, 241, 0.8);
  --wui-color-link-hover: #2d2df1;
  --wui-color-overlay: rgba(0, 0, 0, 0.3);
  --wui-color-danger-bg: #fee2e2;
  --wui-color-danger-bg-hover: #fecaca;
  --wui-color-danger-text: #b91c1c;
  --wui-color-danger-button-text: #ffffff;
  --wui-color-avatar-bg: #e5e7eb;
  --wui-color-avatar-icon: #9ca3af;
`

const darkThemeVars = `
  --wui-color-primary: #bfbff9;
  --wui-color-primary-hover: #d4d4fa;
  --wui-color-primary-text: #001324;
  --wui-color-bg: #001324;
  --wui-color-bg-secondary: #101b29;
  --wui-color-bg-tertiary: #192a39;
  --wui-color-bg-hover: #192a39;
  --wui-color-text: #e9e9fd;
  --wui-color-text-secondary: #99a1a7;
  --wui-color-text-tertiary: #6b7280;
  --wui-color-border: #192a39;
  --wui-color-link: #6c6cf1;
  --wui-color-link-hover: #8080f3;
  --wui-color-overlay: rgba(0, 0, 0, 0.5);
  --wui-color-danger-bg: rgba(127, 29, 29, 0.4);
  --wui-color-danger-bg-hover: rgba(127, 29, 29, 0.6);
  --wui-color-danger-text: #fca5a5;
  --wui-color-danger-button-text: #450a0a;
  --wui-color-avatar-bg: #192a39;
  --wui-color-avatar-icon: #6b7280;
`

function injectThemeStyles() {
  // Only inject once
  if (document.getElementById(THEME_STYLES_ID)) {
    return
  }

  const styleElement = document.createElement('style')
  styleElement.id = THEME_STYLES_ID
  styleElement.textContent = `
    /* Light mode (default) */
    [data-wallet-theme] {
      ${lightThemeVars}
    }

    /* Dark mode via data-theme attribute (explicit) */
    [data-wallet-theme][data-theme='dark'] {
      ${darkThemeVars}
    }

    /* Dark mode via .dark class on ancestor (Tailwind convention) */
    .dark [data-wallet-theme]:not([data-theme='light']) {
      ${darkThemeVars}
    }

    /* Dark mode via system preference (when theme="system" or no explicit theme) */
    @media (prefers-color-scheme: dark) {
      [data-wallet-theme]:not([data-theme='light']):not([data-theme='dark']) {
        ${darkThemeVars}
      }
    }

    /* Reset global button styles that may leak from the consuming app */
    [data-wallet-ui] button {
      border: none;
      border-radius: unset;
      padding: 0;
      margin: 0;
      background: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
  `
  // Insert at the START of <head> so consumer CSS (loaded later) can override
  document.head.insertBefore(styleElement, document.head.firstChild)
}

interface PendingSignRequest {
  transactions: DecodedTransaction[]
  dangerous: TransactionDanger
  message: string
  genesisHash: string | null
  genesisID: string | null
  resolve: () => void
  reject: (error: Error) => void
}

interface WelcomeAccount {
  algorandAddress: string
  evmAddress: string
}

interface WalletUIContextType {
  queryClient: QueryClient
  theme: Theme
  resolvedTheme: ResolvedTheme
  requestBeforeSign: (txnGroup: algosdk.Transaction[] | Uint8Array[], indexesToSign?: number[]) => Promise<void>
  requestAfterSign: (success: boolean, errorMessage?: string) => void
  requestWelcome: (account: WelcomeAccount) => void
  /**
   * Swap integration options, if provided on the provider. Consumed by
   * <ConnectedWalletMenu> to enable the Swap panel inside the WalletButton menu.
   */
  swap?: UseSwapOptions
}

/**
 * Configuration returned by `createRainbowKitConfig()` from the
 * `@txnlab/use-wallet-ui-react/rainbowkit` entry point.
 *
 * Pass this to WalletUIProvider's `rainbowkit` prop to automatically set up
 * WagmiProvider, RainbowKitProvider, and the bridge component.
 */
export interface RainbowKitUIConfig {
  Provider: React.ComponentType<{
    queryClient: QueryClient
    resolvedTheme: 'light' | 'dark'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletManager: any
    children: React.ReactNode
  }>
  getEvmAccounts: () => Promise<string[]>
}

interface WalletUIProviderProps {
  children: ReactNode
  queryClient?: QueryClient
  /**
   * Whether to automatically prefetch data for all accounts in connected wallets (defaults to true)
   */
  enablePrefetching?: boolean
  /**
   * NFD view type for prefetching (defaults to 'thumbnail')
   */
  prefetchNfdView?: NfdView
  /**
   * Theme setting for wallet UI components.
   * - 'light': Always use light mode
   * - 'dark': Always use dark mode
   * - 'system': Follow the user's OS/browser preference (default)
   *
   * The library also respects the `.dark` class on ancestor elements (Tailwind convention),
   * which will enable dark mode unless explicitly overridden with theme="light".
   */
  theme?: Theme
  /**
   * RainbowKit integration config, created by `createRainbowKitConfig()`.
   * When provided, WalletUIProvider wraps children with WagmiProvider,
   * RainbowKitProvider, and the RainbowKitBridge — no manual setup needed.
   *
   * For a simpler API, pass `wagmiConfig` instead — the provider will create
   * the RainbowKit config automatically.
   */
  rainbowkit?: RainbowKitUIConfig
  /**
   * wagmi Config instance (e.g. from RainbowKit's `getDefaultConfig()`).
   * When provided (and `rainbowkit` is not), WalletUIProvider automatically
   * creates the RainbowKit integration — no `createRainbowKitConfig` needed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wagmiConfig?: any
  /**
   * Per-id disclaimer/info dialog content. If omitted for a given id, the
   * corresponding <Disclaimer>/<InfoDialog> wrapper becomes a no-op and renders
   * its children directly.
   *
   * Well-known ids used internally:
   * - `bridge` (disclaimer): shown before the bridge panel renders
   * - `sign` (info): shown before the first transaction sign review
   * - `evm-connect` (disclaimer): shown after the user first connects an EVM wallet
   *
   * Consumers may add more ids for use with their own `<Disclaimer>`/`<InfoDialog>`
   * wrappers — all acknowledgements share a single localStorage object.
   */
  notices?: NoticesConfig
  /**
   * Swap integration options. When provided, the Swap panel is enabled inside
   * the `<WalletButton />` menu. Typically produced by wiring up a router SDK
   * (e.g. `@txnlab/haystack-router`) to expose `fetchQuote` and `executeSwap`.
   *
   * If omitted, the Swap tab is hidden — unless `swapRouter` is provided, in
   * which case WalletUIProvider builds this internally.
   */
  swap?: UseSwapOptions
  /**
   * Haystack-compatible swap router (e.g. a `RouterClient` instance from
   * `@txnlab/haystack-router`). When provided, WalletUIProvider reads
   * `signTransactions` from the surrounding `<WalletProvider>` and builds the
   * `UseSwapOptions` closure internally — no manual wiring needed. If a `swap`
   * prop is also passed, it takes precedence.
   */
  swapRouter?: SwapRouterLike
}

// Default query client configuration for NFD queries
const createDefaultQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 60 * 60 * 1000, // 1 hour
        refetchOnWindowFocus: true,
        refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
        retry: (failureCount, error) => {
          // Don't retry for 404 errors (not found)
          if (error instanceof Error && error.message.includes('404')) {
            return false
          }
          // For other errors, retry up to 3 times
          return failureCount < 3
        },
      },
    },
  })

const WalletUIContext = createContext<WalletUIContextType | undefined>(undefined)

// Internal function to prefetch all account data when a wallet connects
function WalletAccountsPrefetcher({ enabled, nfdView }: { enabled: boolean; nfdView: NfdView }) {
  const queryClient = useQueryClient()
  const { activeAddress, activeWallet, algodClient } = useWallet()
  const { activeNetwork, activeNetworkConfig } = useNetwork()
  const isLocalnet = activeNetwork === 'localnet'
  const isTestnet = activeNetworkConfig?.isTestnet ?? false

  // Invalidate account queries when the network changes so balances refresh
  const prevNetworkRef = useRef(activeNetwork)
  useEffect(() => {
    if (prevNetworkRef.current !== activeNetwork) {
      prevNetworkRef.current = activeNetwork
      queryClient.invalidateQueries({ queryKey: ['account-info'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
    }
  }, [activeNetwork, queryClient])

  // Previous activeAddress value
  const prevActiveAddressRef = useRef<string | null>(null)

  useEffect(() => {
    // Skip if prefetching is disabled
    if (!enabled) {
      prevActiveAddressRef.current = activeAddress
      return
    }

    // Only prefetch when transitioning from disconnected to connected state
    // (when prevActiveAddress was null but activeAddress is now defined)
    const shouldPrefetch =
      prevActiveAddressRef.current === null &&
      activeAddress !== null &&
      activeWallet !== null &&
      activeWallet.accounts !== undefined &&
      activeWallet.accounts.length > 0 &&
      algodClient !== undefined

    // Always update the previous address ref
    prevActiveAddressRef.current = activeAddress

    // If we don't need to prefetch, exit early
    if (!shouldPrefetch) {
      return
    }

    console.log(`[WalletUI] Prefetching data for all accounts in wallet ${activeWallet!.id}`)

    // Get all addresses from the wallet
    const addresses = activeWallet!.accounts.map((account) => account.address)

    // If we have addresses, fetch NFDs in batches of 20 (skip for localnet)
    if (addresses.length > 0 && !isLocalnet) {
      // Process addresses in batches of 20 (NFD API limit)
      const batchSize = 20
      const addressBatches = []

      for (let i = 0; i < addresses.length; i += batchSize) {
        addressBatches.push(addresses.slice(i, i + batchSize))
      }

      // Process each batch
      addressBatches.forEach(async (batch) => {
        // Determine the API endpoint based on the network
        const apiEndpoint = isTestnet ? 'https://api.testnet.nf.domains' : 'https://api.nf.domains'

        // Build the query URL with multiple address parameters
        const queryParams = new URLSearchParams()
        batch.forEach((address) => {
          queryParams.append('address', address)
        })
        queryParams.append('view', nfdView)

        try {
          // Make a single request for all addresses in the batch
          const response = await fetch(`${apiEndpoint}/nfd/lookup?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          })

          // Handle response
          if (!response.ok && response.status !== 404) {
            throw new Error(`NFD prefetch lookup failed: ${response.statusText}`)
          }

          // If we get a 404 or success, process the response
          // For 404, we'll get an empty object
          const responseData: NfdLookupResponse = response.status === 404 ? {} : await response.json()

          // For each address in the batch, seed the query cache
          batch.forEach((address) => {
            const nfdData = responseData[address] || null

            // Seed the cache with this NFD data
            queryClient.setQueryData(['nfd', address, activeNetwork, nfdView], nfdData)
          })
        } catch (error) {
          console.error('Error prefetching NFD data:', error)
        }
      })
    }

    // For each account in the wallet, prefetch balance data
    addresses.forEach((address) => {
      // Prefetch balance data
      queryClient.prefetchQuery({
        queryKey: ['account-balance', address, activeNetwork],
        queryFn: async () => {
          try {
            const accountInfo = await algodClient!.accountInformation(address).do()
            return Number(accountInfo.amount)
          } catch (error) {
            throw new Error(`Error fetching account balance: ${error}`)
          }
        },
      })
    })
  }, [activeAddress, activeWallet, activeNetwork, nfdView, algodClient, queryClient, enabled])

  // Return null since this is a utility component with no UI
  return null
}

/**
 * Provider that enables wallet UI components to work with TanStack Query.
 * It can use an existing QueryClient from the parent application or create its own.
 * Also creates a QueryClientProvider if none exists in the parent tree.
 *
 * Automatically prefetches data for all accounts in connected wallets for smoother
 * account switching experience.
 *
 * Supports theme configuration via the `theme` prop:
 * - 'light': Always use light mode
 * - 'dark': Always use dark mode
 * - 'system': Follow the user's OS/browser preference (default)
 */
export function WalletUIProvider({
  children,
  queryClient: externalQueryClient,
  enablePrefetching = true,
  prefetchNfdView = 'thumbnail',
  theme = 'system',
  rainbowkit,
  wagmiConfig,
  notices,
  swap,
  swapRouter,
}: WalletUIProviderProps) {
  // Auto-wire swap options from `swapRouter` + wallet signer. Stabilise
  // `signTransactions` via a ref so the built config is stable across renders
  // (only changes when `swapRouter` changes); the ref is read at executeSwap
  // invocation time so the latest signer is always used.
  const { signTransactions } = useWallet()
  const signTransactionsRef = useRef(signTransactions)
  useLayoutEffect(() => {
    signTransactionsRef.current = signTransactions
  }, [signTransactions])
  const autoSwap = useMemo<UseSwapOptions | undefined>(
    () =>
      swapRouter
        ? buildHaystackSwapOptions(swapRouter, ((group, indexes) =>
            signTransactionsRef.current(group, indexes)) as typeof signTransactions)
        : undefined,
    [swapRouter],
  )
  const effectiveSwap = swap ?? autoSwap

  // Auto-create RainbowKit config from wagmiConfig when rainbowkit prop isn't provided.
  // Uses dynamic import so wagmi/@rainbow-me/rainbowkit remain truly optional peer deps.
  const [autoRainbowkit, setAutoRainbowkit] = useState<RainbowKitUIConfig | null>(null)
  useEffect(() => {
    if (rainbowkit || !wagmiConfig) return
    let cancelled = false
    import('../rainbowkit').then(({ createRainbowKitConfig }) => {
      if (!cancelled) setAutoRainbowkit(createRainbowKitConfig({ wagmiConfig }))
    })
    return () => { cancelled = true }
  }, [rainbowkit, wagmiConfig])

  const effectiveRainbowkit = rainbowkit ?? autoRainbowkit

  // Use provided query client or create a default one
  const queryClient = useMemo(() => externalQueryClient || createDefaultQueryClient(), [externalQueryClient])

  // Resolve the theme (handles 'system' preference detection)
  const resolvedTheme = useResolvedTheme(theme)

  // Inject theme CSS variables on mount
  useEffect(() => {
    injectThemeStyles()
  }, [])

  // Extension companion detection
  const [extensionDetected, setExtensionDetected] = useState(false)
  const pendingRequestIdRef = useRef<string | null>(null)

  // Extension detection: ping on mount and listen for pong/announce
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data?.type) return
      const { type, source } = event.data
      if (source !== EXT_SOURCE.CONTENT) return

      if (type === EXT_MSG.PONG || type === EXT_MSG.ANNOUNCE) {
        setExtensionDetected(true)
      }
    }

    window.addEventListener('message', handleMessage)

    // Send ping to detect extension
    window.postMessage({ type: EXT_MSG.PING, source: EXT_SOURCE.PAGE }, '*')

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Before-sign dialog state
  const [pendingSign, setPendingSign] = useState<PendingSignRequest | null>(null)
  const [showSignDialog, setShowSignDialog] = useState(false)
  const [signing, setSigning] = useState(false)

  // Listen for extension sign responses
  useEffect(() => {
    if (!extensionDetected) return

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data?.type) return
      if (event.data.type !== EXT_MSG.SIGN_RESPONSE) return
      // Accept responses from both popup source and content source (relay)
      if (event.data.source !== EXT_SOURCE.POPUP && event.data.source !== EXT_SOURCE.CONTENT) return
      if (!pendingRequestIdRef.current || event.data.requestId !== pendingRequestIdRef.current) return

      if (event.data.approved) {
        // Keep pendingRequestIdRef so requestAfterSign can send SIGN_COMPLETE
        pendingSign?.resolve()
      } else {
        pendingSign?.reject(new Error('User rejected signing from extension'))
        setPendingSign(null)
        pendingRequestIdRef.current = null
      }
      setShowSignDialog(false)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [extensionDetected, pendingSign])

  const networkConfigRef = useRef<typeof activeNetworkConfig>(undefined)

  const requestBeforeSign = useCallback((txnGroup: algosdk.Transaction[] | Uint8Array[]) => {
    return new Promise<void>((resolve, reject) => {
      const { decodedTransactions, transactions, dangerous, genesisHash, genesisID } = decodeTransactions(txnGroup)
      const messageRaw = AlgoXEvmSdk.getSignPayload(transactions)
      const message = `0x${Buffer.from(messageRaw).toString('hex')}`

      const wrappedResolve = () => {
        setSigning(true)
        resolve()
      }

      setPendingSign({ transactions: decodedTransactions, message, dangerous, genesisHash, genesisID, resolve: wrappedResolve, reject })
      setShowSignDialog(true)

      if (extensionDetected) {
        const requestId = crypto.randomUUID()
        pendingRequestIdRef.current = requestId

        // Serialize raw transactions for extension payload verification
        const rawTransactions = transactions.map((txn) => {
          const bytes = txn.toByte()
          let binary = ''
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          return btoa(binary)
        })

        // Extract algod config for extension asset resolution
        const netConfig = networkConfigRef.current
        const algodConfig = netConfig
          ? {
              baseServer: netConfig.algod.baseServer,
              token: typeof netConfig.algod.token === 'string' ? netConfig.algod.token : '',
              port: netConfig.algod.port,
            }
          : undefined

        window.postMessage(
          {
            type: EXT_MSG.SIGN_REQUEST,
            source: EXT_SOURCE.PAGE,
            requestId,
            transactions: decodedTransactions.map(toSerializableTxn),
            message,
            dangerous,
            walletName: walletNameRef.current,
            algodConfig,
            rawTransactions,
          },
          '*',
        )
      }
    })
  }, [extensionDetected])

  const requestAfterSign = useCallback((_success: boolean, _errorMessage?: string) => {
    if (extensionDetected && pendingRequestIdRef.current) {
      window.postMessage(
        {
          type: EXT_MSG.SIGN_COMPLETE,
          source: EXT_SOURCE.PAGE,
          requestId: pendingRequestIdRef.current,
        },
        '*',
      )
      pendingRequestIdRef.current = null
    }
    setSigning(false)
    setPendingSign(null)
    setShowSignDialog(false)
  }, [extensionDetected])

  // Welcome dialog state
  const [pendingWelcome, setPendingWelcome] = useState<WelcomeAccount | null>(null)

  const requestWelcome = useCallback((account: WelcomeAccount) => {
    setPendingWelcome(account)
  }, [])

  // Auto-wire UI hooks to WalletManager
  const manager = useWalletManager()
  const { algodClient, activeWallet } = useWallet()
  const { activeNetwork, activeNetworkConfig } = useNetwork()

  // RainbowKit integration: inject getEvmAccounts into the wallet instance
  useEffect(() => {
    if (effectiveRainbowkit) {
      const rkWallet = manager.wallets.find((w) => w.id === 'rainbowkit')
      if (!rkWallet) return

      if ('setGetEvmAccounts' in rkWallet) {
        ;(rkWallet as { setGetEvmAccounts: (fn: () => Promise<string[]>) => void }).setGetEvmAccounts(
          effectiveRainbowkit.getEvmAccounts,
        )
      } else {
        // Fallback: set the callback directly on the wallet options.
        // Needed when the wallet class predates the public setGetEvmAccounts method.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts = (rkWallet as any).options
        if (opts) {
          opts.getEvmAccounts = effectiveRainbowkit.getEvmAccounts
        }
      }
    } else if (manager.wallets.some((w) => w.id === 'rainbowkit') && !wagmiConfig && !rainbowkit) {
      console.warn(
        '[WalletUI] WalletManager includes a RainbowKit wallet but no `rainbowkit` or `wagmiConfig` prop was passed to WalletUIProvider.\n' +
          'Pass `wagmiConfig` to WalletUIProvider, or import { createRainbowKitConfig } from "@txnlab/use-wallet-ui-react/rainbowkit" and pass the result as the `rainbowkit` prop.',
      )
    }
  }, [manager, effectiveRainbowkit, wagmiConfig, rainbowkit])

  // Keep wallet name and network config in refs so requestBeforeSign doesn't depend on them
  const walletNameRef = useRef<string | undefined>(undefined)
  walletNameRef.current = activeWallet?.metadata?.name
  networkConfigRef.current = activeNetworkConfig

  const onConnect = useCallback(
    (account: { evmAddress: string; algorandAddress: string }) => {
      if (!algodClient) return
      algodClient
        .accountInformation(account.algorandAddress)
        .do()
        .then((info) => {
          if (Number(info.amount) === 0) {
            requestWelcome(account)
          }
        })
        .catch(() => {
          requestWelcome(account)
        })
    },
    [algodClient, requestWelcome],
  )

  useEffect(() => {
    manager.registerUIHook('onBeforeSign', requestBeforeSign)
    manager.registerUIHook('onAfterSign', requestAfterSign)
    manager.registerUIHook('onConnect', onConnect)
    return () => {
      manager.unregisterUIHook('onBeforeSign')
      manager.unregisterUIHook('onAfterSign')
      manager.unregisterUIHook('onConnect')
    }
  }, [manager, requestBeforeSign, requestAfterSign, onConnect])

  const handleApproveSign = useCallback(() => {
    pendingSign?.resolve()
  }, [pendingSign])

  const handleRejectSign = useCallback(() => {
    if (extensionDetected && pendingRequestIdRef.current) {
      window.postMessage(
        {
          type: EXT_MSG.SIGN_COMPLETE,
          source: EXT_SOURCE.PAGE,
          requestId: pendingRequestIdRef.current,
        },
        '*',
      )
      pendingRequestIdRef.current = null
    }
    setShowSignDialog(false)
    pendingSign?.reject(new Error('User rejected signing'))
    setPendingSign(null)
  }, [pendingSign, extensionDetected])

  const contextValue = useMemo(
    () => ({
      queryClient,
      theme,
      resolvedTheme,
      requestBeforeSign,
      requestAfterSign,
      requestWelcome,
      swap: effectiveSwap,
    }),
    [queryClient, theme, resolvedTheme, requestBeforeSign, requestAfterSign, requestWelcome, effectiveSwap],
  )

  // Determine the data-theme attribute value
  // - For explicit 'light' or 'dark', set the attribute to enable CSS variable overrides
  // - For 'system', don't set the attribute so CSS media queries handle it
  const dataTheme = theme === 'system' ? undefined : theme

  const wrappedChildren = effectiveRainbowkit ? (
    <effectiveRainbowkit.Provider queryClient={queryClient} resolvedTheme={resolvedTheme} walletManager={manager}>
      {children}
      <EvmConnectDisclaimer onCancel={() => setPendingWelcome(null)} />
    </effectiveRainbowkit.Provider>
  ) : (
    children
  )

  const content = (
    <WalletUIContext.Provider value={contextValue}>
      <NoticeProvider notices={notices}>
        <BridgeDialogProvider>
          <div data-wallet-theme data-theme={dataTheme}>
            {/* Internal prefetcher component that runs automatically */}
            <WalletAccountsPrefetcher enabled={enablePrefetching} nfdView={prefetchNfdView} />
            {wrappedChildren}
            <BridgeDialog />
            {showSignDialog && extensionDetected && (
              <ExtensionSignIndicator transactionCount={pendingSign!.transactions.length} dangerous={pendingSign!.dangerous} onReject={handleRejectSign} />
            )}
            {showSignDialog && !extensionDetected && (
              <BeforeSignDialog transactions={pendingSign!.transactions} message={pendingSign!.message} dangerous={pendingSign!.dangerous} genesisHash={pendingSign!.genesisHash} genesisID={pendingSign!.genesisID} onApprove={handleApproveSign} onReject={handleRejectSign} signing={signing} walletName={(activeWallet?.activeAccount?.metadata?.connectorName as string | undefined) ?? activeWallet?.metadata?.name} walletIcon={(activeWallet?.activeAccount?.metadata?.connectorIcon as string | undefined) ?? activeWallet?.metadata?.icon} algodClient={algodClient} network={activeNetwork} />
            )}
            {pendingWelcome && (
              <WelcomeDialog algorandAddress={pendingWelcome.algorandAddress} evmAddress={pendingWelcome.evmAddress} onDismiss={() => setPendingWelcome(null)} />
            )}
          </div>
        </BridgeDialogProvider>
      </NoticeProvider>
    </WalletUIContext.Provider>
  )

  // If no external query client was provided, wrap with our own QueryClientProvider
  if (!externalQueryClient) {
    return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
  }

  // Otherwise just return the context provider
  return content
}

/**
 * Hook to access the WalletUI context
 * @throws Error if used outside of WalletUIProvider
 */
export function useWalletUI(): WalletUIContextType {
  const context = useContext(WalletUIContext)
  if (context === undefined) {
    throw new Error('useWalletUI must be used within a WalletUIProvider')
  }
  return context
}

/**
 * Hook that returns the `onBeforeSign` callback for use in wallet uiHooks configuration.
 *
 * @example
 * ```tsx
 * const { onBeforeSign } = useBeforeSignDialog()
 *
 * // Pass to wallet config:
 * uiHooks: { onBeforeSign }
 * ```
 */
export function useBeforeSignDialog() {
  const { requestBeforeSign } = useWalletUI()
  return { onBeforeSign: requestBeforeSign }
}

/**
 * Hook that returns the `onAfterSign` callback for use in wallet uiHooks configuration.
 *
 * @example
 * ```tsx
 * const { onAfterSign } = useAfterSignDialog()
 *
 * // Pass to wallet config:
 * uiHooks: { onAfterSign }
 * ```
 */
export function useAfterSignDialog() {
  const { requestAfterSign } = useWalletUI()
  return { onAfterSign: requestAfterSign }
}

/**
 * Hook that returns the `showWelcome` callback for displaying a welcome dialog.
 *
 * @example
 * ```tsx
 * const { showWelcome } = useWelcomeDialog()
 *
 * // Show welcome dialog for a new account:
 * showWelcome({ algorandAddress: '...', evmAddress: '...' })
 * ```
 */
export function useWelcomeDialog() {
  const { requestWelcome } = useWalletUI()
  return { showWelcome: requestWelcome }
}

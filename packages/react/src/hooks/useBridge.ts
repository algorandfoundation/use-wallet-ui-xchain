import { useWallet } from '@txnlab/use-wallet-react'
import { useQueryClient } from '@tanstack/react-query'
import { useBridgePanel, type UseBridgePanelReturn, type UseBridgeOptions } from '@d13co/algo-x-evm-ui'
import { useCallback, useEffect } from 'react'
import { type EIP1193Provider } from '../services/evmProviderAdapter'
import { useAccountInfo } from './useAccountInfo'

// Re-export types from the shared package for backward compat
export type { UseBridgeOptions, BridgeChain, BridgeToken, BridgeStatus } from '@d13co/algo-x-evm-ui'
export type { BridgeHookTransferStatus as BridgeTransferStatus } from '@d13co/algo-x-evm-ui'
export { BRIDGE_PERSIST_KEY } from '@d13co/algo-x-evm-ui'

export type UseBridgeReturn = UseBridgePanelReturn

/**
 * Convenience wrapper around `useBridgePanel` that pulls wallet context 
 * from `@txnlab/use-wallet-react` and Algorand account info from React Query.
 */
export function useBridge(options: UseBridgeOptions = {}): UseBridgePanelReturn {
  const { activeAddress, activeWallet, algodClient, signTransactions } = useWallet()
  const queryClient = useQueryClient()
  const { data: algorandAccountInfo, isFetched: algorandAccountInfoFetched, refetch: refetchAccountInfo } = useAccountInfo({ enabled: options.enabled ?? true })

  // Ensure account info is fresh when the bridge becomes active.
  useEffect(() => {
    if (options.enabled) {
      refetchAccountInfo()
    }
  }, [options.enabled, refetchAccountInfo])

  const onTransactionSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['account-info'] })
    queryClient.invalidateQueries({ queryKey: ['account-balance'] })
  }, [queryClient])

  // Extract EVM-specific fields from wallet metadata
  // @ts-ignore - metadata exists on AlgoXEvmBaseWallet accounts
  const evmAddress: string | null = (activeWallet?.activeAccount?.metadata?.evmAddress as string) ?? null
  // @ts-ignore - isAlgoXEvm exists on xChain EVM wallet metadata
  const isAlgoXEvm = !!activeWallet?.metadata?.isAlgoXEvm

  const getEvmProvider = (activeWallet as unknown as Record<string, unknown>)?.getEvmProvider as
    | (() => Promise<EIP1193Provider>)
    | undefined

  return useBridgePanel(
    {
      activeAddress: activeAddress ?? null,
      algodClient,
      signTransactions,
      onTransactionSuccess,
      evmAddress,
      isAlgoXEvm,
      getEvmProvider,
      algorandAccountInfo: algorandAccountInfo ?? null,
      algorandAccountInfoFetched,
      onRefreshAlgorandBalance: async () => { await refetchAccountInfo() },
    },
    options,
  )
}

import { useNetwork, useWallet, NetworkId } from '@txnlab/use-wallet-react'
import { useAssetRegistry as useAssetRegistryCore, type UseAssetRegistryReturn } from '@d13co/algo-x-evm-ui'
import algosdk from 'algosdk'
import { useMemo } from 'react'

export type { UseAssetRegistryReturn } from '@d13co/algo-x-evm-ui'

const LOCALNET_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

/**
 * Convenience wrapper that pulls algodClient and activeNetwork from `@txnlab/use-wallet-react`.
 * For direct usage without the wallet context, import `useAssetRegistry` from `@d13co/algo-x-evm-ui`.
 * Also handles setting up an indexerClient for non-mainnet networks to enable asset searching by name/unit.
 */
export function useAssetRegistry(): UseAssetRegistryReturn {
  const { algodClient } = useWallet()
  const { activeNetwork } = useNetwork()

  const indexerClient = useMemo(() => {
    if (activeNetwork === NetworkId.LOCALNET) return new algosdk.Indexer(LOCALNET_TOKEN, 'http://localhost', 8980)
    if (activeNetwork === NetworkId.TESTNET) return new algosdk.Indexer('', 'https://testnet-idx.4160.nodely.dev', '')
    return undefined
  }, [activeNetwork])

  return useAssetRegistryCore(algodClient, activeNetwork, indexerClient)
}

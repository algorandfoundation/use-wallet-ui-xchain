import type algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AbelGhostSDK } from 'abel-ghost-sdk'
import { AssetCache, type CachedAsset } from '../cache/assetCache'
import { useCallback, useEffect, useRef, useState } from 'react'

const MAINNET_REGISTRY_APP_ID = 2914159523n
const MAINNET_GHOST_APP_ID = 3381542955n
const MAINNET_READER_ACCOUNT = 'Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA'
const STALENESS_MS = 24 * 60 * 60 * 1000 // 24 hours
const BATCH_SIZE = 200

// Canonical mainnet asset IDs for known tokens.
// When a search query matches one of these names, only the canonical asset is shown.
const CANONICAL_MAINNET_ASSETS: Record<string, number> = {
  usdc: 31566704,
}

export interface UseAssetRegistryReturn {
  registryLoading: boolean
  registryLoaded: boolean
  registryError: string | null
  searchByName: (query: string, limit?: number) => Promise<CachedAsset[]>
}

/**
 * @param indexerClient Optional indexer client - pass it to support
 * testnet/localnet asset lookup. Not needed for only-mainnet usage.
 */
export function useAssetRegistry(
  algodClient: algosdk.Algodv2 | null | undefined,
  activeNetwork: string | undefined,
  indexerClient?: algosdk.Indexer,
): UseAssetRegistryReturn {
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryLoaded, setRegistryLoaded] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const loadingRef = useRef(false)

  const isMainnet = activeNetwork === 'mainnet'

  useEffect(() => {
    if (!isMainnet || !algodClient || loadingRef.current) return

    let cancelled = false

    const loadRegistry = async () => {
      try {
        const [lastUpdated, hasCachedAssets] = await Promise.all([
          AssetCache.getLastUpdated(),
          AssetCache.hasAny(),
        ])
        if (lastUpdated && Date.now() - lastUpdated < STALENESS_MS && hasCachedAssets) {
          setRegistryLoaded(true)
          return
        }

        loadingRef.current = true
        setRegistryLoading(true)
        setRegistryError(null)

        const algorand = AlgorandClient.fromClients({ algod: algodClient })
        const sdk = new AbelGhostSDK({
          algorand,
          concurrency: 7,
          registryAppId: MAINNET_REGISTRY_APP_ID,
          ghostAppId: MAINNET_GHOST_APP_ID,
          readerAccount: MAINNET_READER_ACCOUNT,
        })

        const allAssetIds = await sdk.getAllAssetIDs()
        if (cancelled) return

        // Fetch in batches
        for (let i = 0; i < allAssetIds.length; i += BATCH_SIZE) {
          if (cancelled) return
          const batch = allAssetIds.slice(i, i + BATCH_SIZE)
          const labels = await sdk.getAssetsTinyLabels(batch)

          const cached: CachedAsset[] = []
          for (const [id, info] of labels) {
            cached.push({
              index: Number(id),
              name: info.name,
              unitName: info.unitName,
              decimals: info.decimals,
              peraVerified: info.labels.includes('pv'),
            })
          }
          await AssetCache.insertMany(cached)
        }

        if (cancelled) return
        await AssetCache.setLastUpdated(Date.now())
        setRegistryLoaded(true)
      } catch (err) {
        console.error('[useAssetRegistry] load error:', err)
        if (!cancelled) {
          setRegistryError(err instanceof Error ? err.message : 'Failed to load asset registry')
        }
      } finally {
        if (!cancelled) {
          setRegistryLoading(false)
          loadingRef.current = false
        }
      }
    }

    loadRegistry()

    return () => {
      cancelled = true
    }
  }, [isMainnet, algodClient])

  const searchByName = useCallback(
    async (query: string, limit?: number) => {
      if (!isMainnet && indexerClient) {
        const [byName, byUnit] = await Promise.all([
          indexerClient.searchForAssets().name(query).limit(limit ?? 20).do().catch(() => ({ assets: [] })),
          indexerClient.searchForAssets().unit(query).limit(limit ?? 20).do().catch(() => ({ assets: [] })),
        ])
        const seen = new Set<number>()
        return [...byName.assets, ...byUnit.assets].flatMap((a) => {
          const id = Number(a.index)
          if (seen.has(id)) return []
          seen.add(id)
          return [{ 
            index: id, 
            name: a.params.name || 'Unnamed Asset', 
            unitName: a.params.unitName || '',
            decimals: a.params.decimals, 
            peraVerified: false
          }]
        })
      }

      const q = query.trim().toLowerCase()
      const canonicalId = isMainnet ? CANONICAL_MAINNET_ASSETS[q] : undefined

      // If searching for a canonical asset, look it up directly by ID first
      if (canonicalId != null) {
        const canonical = await AssetCache.getById(canonicalId)
        if (canonical) return [canonical]
      }

      return AssetCache.searchByName(query, limit)
    },
    [isMainnet, indexerClient],
  )

  return { registryLoading, registryLoaded, registryError, searchByName }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPeraAssets, type PeraAssetData } from '../services/peraApi'

export type { PeraAssetData } from '../services/peraApi'

export interface UsePeraAssetDataReturn {
  peraData: Map<number, PeraAssetData>
  loading: boolean
  /** Manually fetch Pera data for a set of asset IDs (e.g. search results) */
  fetchFor: (assetIds: number[]) => Promise<Map<number, PeraAssetData>>
}

/**
 * Hook that lazily fetches and caches Pera asset data (logos, verification tiers)
 * for a given set of asset IDs.
 */
export function usePeraAssetData(
  assetIds: number[],
  activeNetwork: string | undefined,
): UsePeraAssetDataReturn {
  const [peraData, setPeraData] = useState<Map<number, PeraAssetData>>(new Map())
  const [loading, setLoading] = useState(false)
  const prevKeyRef = useRef('')

  const network = activeNetwork === 'testnet' ? 'testnet' : 'mainnet'
  const isMainnetOrTestnet = activeNetwork === 'mainnet' || activeNetwork === 'testnet'

  useEffect(() => {
    setPeraData(new Map())
    prevKeyRef.current = ''
  }, [activeNetwork])

  useEffect(() => {
    if (!isMainnetOrTestnet || assetIds.length === 0) return

    // Dedupe: don't re-fetch if same set of IDs
    const key = `${network}:${assetIds.slice().sort((a, b) => a - b).join(',')}`
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    let cancelled = false
    setLoading(true)

    fetchPeraAssets(assetIds, network).then((result) => {
      if (!cancelled) {
        if (result.size > 0) setPeraData((prev) => new Map([...prev, ...result]))
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [assetIds, network, isMainnetOrTestnet])

  const fetchFor = useCallback(
    async (ids: number[]): Promise<Map<number, PeraAssetData>> => {
      if (!isMainnetOrTestnet) return new Map()
      const result = await fetchPeraAssets(ids, network)
      if (result.size > 0) setPeraData((prev) => new Map([...prev, ...result]))
      return result
    },
    [isMainnetOrTestnet, network],
  )

  return { peraData, loading, fetchFor }
}

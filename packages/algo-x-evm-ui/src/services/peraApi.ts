const MAINNET_BASE = 'https://mainnet.api.perawallet.app/v1'
const TESTNET_BASE = 'https://testnet.api.perawallet.app/v1'

export interface PeraAssetData {
  assetId: number
  logo: string | null
  logoSvg: string | null
  verificationTier: 'trusted' | 'verified' | 'suspicious' | 'unverified'
}

interface PeraApiResponse {
  asset_id: number
  logo: string | null
  logo_svg: string | null
  verification_tier: string
}

// In-memory cache keyed by `${network}:${assetId}` - null marks a cached 404.
const cache = new Map<string, PeraAssetData | null>()

// In-flight dedup
const inflight = new Map<string, Promise<PeraAssetData | null>>()

function baseUrl(network: 'mainnet' | 'testnet'): string {
  return network === 'testnet' ? TESTNET_BASE : MAINNET_BASE
}

function cacheKey(network: string, assetId: number): string {
  return `${network}:${assetId}`
}

export async function fetchPeraAsset(
  assetId: number,
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<PeraAssetData | null> {
  const key = cacheKey(network, assetId)

  if (cache.has(key)) return cache.get(key) ?? null

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      const res = await fetch(`${baseUrl(network)}/assets/${assetId}/`)
      if (!res.ok) {
        if (res.status === 404) cache.set(key, null)
        return null
      }
      const json = (await res.json()) as PeraApiResponse
      const data: PeraAssetData = {
        assetId: json.asset_id,
        logo: json.logo,
        logoSvg: json.logo_svg,
        verificationTier: json.verification_tier as PeraAssetData['verificationTier'],
      }
      cache.set(key, data)
      return data
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

export async function fetchPeraAssets(
  assetIds: number[],
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<Map<number, PeraAssetData>> {
  const results = new Map<number, PeraAssetData>()
  const toFetch: number[] = []

  for (const id of assetIds) {
    const key = cacheKey(network, id)
    if (cache.has(key)) {
      const cached = cache.get(key)
      if (cached) results.set(id, cached)
    } else {
      toFetch.push(id)
    }
  }

  if (toFetch.length > 0) {
    const fetched = await Promise.all(toFetch.map((id) => fetchPeraAsset(id, network)))
    for (let i = 0; i < toFetch.length; i++) {
      const data = fetched[i]
      if (data) results.set(toFetch[i], data)
    }
  }

  return results
}

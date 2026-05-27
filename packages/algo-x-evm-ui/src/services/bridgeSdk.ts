/**
 * Thin service wrapper around the Allbridge Core SDK.
 * Lazy-loads the SDK via dynamic import() to keep it out of the bundle
 * for consumers who don't use the bridge feature.
 */

// Re-export types that consumers will need — these are type-only so they're erased at runtime
export type {
  AllbridgeCoreSdk,
  ChainDetailsWithTokens,
  TokenWithChainDetails,
  GasFeeOptions,
  ExtraGasMaxLimitResponse,
  TransferStatusResponse,
} from '@allbridge/bridge-core-sdk'

export type NodeRpcUrls = Record<string, string>

export const DEFAULT_RPC_URLS: NodeRpcUrls = {
  ETH: 'https://eth.drpc.org',
  BSC: 'https://bsc.drpc.org',
  POL: 'https://polygon.drpc.org',
  ARB: 'https://arb1.arbitrum.io/rpc',
  OPT: 'https://optimism.drpc.org',
  AVA: 'https://avalanche.drpc.org',
  BAS: 'https://base.drpc.org',
  CEL: 'https://celo.drpc.org',
  SNC: 'https://sonic.drpc.org',
  UNI: 'https://unichain.drpc.org',
  LIN: 'https://linea.drpc.org',
  ALG: 'https://mainnet-api.algonode.cloud',
}

let sdkInstance: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk | null = null

export async function getOrCreateSdk(
  nodeRpcUrls?: NodeRpcUrls,
): Promise<import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk> {
  if (sdkInstance) return sdkInstance
  const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await import('@allbridge/bridge-core-sdk')
  sdkInstance = new AllbridgeCoreSdk({ ...nodeRpcUrlsDefault, ...DEFAULT_RPC_URLS, ...nodeRpcUrls })
  return sdkInstance
}

export function resetSdk(): void {
  sdkInstance = null
}

export async function fetchChainDetailsMap(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
): Promise<import('@allbridge/bridge-core-sdk').ChainDetailsWithTokens[]> {
  const map = await sdk.chainDetailsMap()
  return Object.values(map)
}

export async function getQuote(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
  amount: string,
  sourceToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  destinationToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  messenger: number,
): Promise<string> {
  return sdk.getAmountToBeReceived(amount, sourceToken, destinationToken, messenger)
}

export async function getGasFees(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
  sourceToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  destinationToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  messenger: number,
): Promise<import('@allbridge/bridge-core-sdk').GasFeeOptions> {
  return sdk.getGasFeeOptions(sourceToken, destinationToken, messenger)
}

export function getEstimatedTime(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
  sourceToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  destinationToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  messenger: number,
): number | null {
  return sdk.getAverageTransferTime(sourceToken, destinationToken, messenger)
}

export async function getExtraGasMaxLimits(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
  sourceToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  destinationToken: import('@allbridge/bridge-core-sdk').TokenWithChainDetails,
  messenger: number,
): Promise<import('@allbridge/bridge-core-sdk').ExtraGasMaxLimitResponse> {
  return sdk.getExtraGasMaxLimits(sourceToken, destinationToken, messenger)
}

export async function getTransferStatus(
  sdk: import('@allbridge/bridge-core-sdk').AllbridgeCoreSdk,
  chainSymbol: string,
  txId: string,
): Promise<import('@allbridge/bridge-core-sdk').TransferStatusResponse> {
  return sdk.getTransferStatus(chainSymbol, txId)
}

// -- EVM token balance fetching --

/** Map keyed by `"chainSymbol:tokenSymbol"` → raw balance in smallest units */
export type TokenBalanceMap = Record<string, bigint>

/** Per EVM address balance cache to avoid redundant RPC calls when switching 
 * between accounts. Cleared on wallet disconnect or manually via `refreshBalances`. */
const evmBalanceCache = new Map<string, TokenBalanceMap>()

export function getEvmBalanceCache(address: string): TokenBalanceMap | null {
  return evmBalanceCache.get(address.toLowerCase()) ?? null
}

export function setEvmBalanceCache(address: string, balances: TokenBalanceMap): void {
  evmBalanceCache.set(address.toLowerCase(), balances)
}

export function clearAllEvmBalanceCaches(): void {
  evmBalanceCache.clear()
}

// ERC-20 balanceOf selector: keccak256("balanceOf(address)") first 4 bytes
const BALANCE_OF_SELECTOR = '0x70a08231'

/**
 * Fetch ERC-20 token balances for `evmAddress` across all EVM chains.
 * Uses raw `eth_call` to avoid pulling in ethers/viem/web3.
 * Failures for individual tokens silently default to 0n.
 */
export async function fetchEvmTokenBalances(
  evmAddress: string,
  chains: import('@allbridge/bridge-core-sdk').ChainDetailsWithTokens[],
  nodeRpcUrls?: NodeRpcUrls,
): Promise<TokenBalanceMap> {
  const rpcUrls: NodeRpcUrls = { ...DEFAULT_RPC_URLS, ...nodeRpcUrls }
  const result: TokenBalanceMap = {}

  // Pad address to 32 bytes (remove 0x prefix, left-pad to 64 hex chars)
  const paddedAddress = evmAddress.toLowerCase().replace('0x', '').padStart(64, '0')

  const tasks: { key: string; rpcUrl: string; tokenAddress: string }[] = []

  for (const chain of chains) {
    if (chain.chainType !== 'EVM') continue
    const rpcUrl = rpcUrls[chain.chainSymbol]
    if (!rpcUrl) continue

    for (const token of chain.tokens) {
      const addr = token.tokenAddress
      if (!addr) continue
      tasks.push({
        key: `${chain.chainSymbol}:${token.symbol}`,
        rpcUrl,
        tokenAddress: addr,
      })
    }
  }

  const settled = await Promise.allSettled(
    tasks.map(async ({ key, rpcUrl, tokenAddress }) => {
      const data = BALANCE_OF_SELECTOR + paddedAddress
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: tokenAddress, data }, 'latest'],
      })

      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const json = (await res.json()) as { result?: string; error?: unknown }
      if (json.error || !json.result || json.result === '0x') {
        return { key, balance: 0n }
      }
      return { key, balance: BigInt(json.result) }
    }),
  )

  for (const entry of settled) {
    if (entry.status === 'fulfilled') {
      result[entry.value.key] = entry.value.balance
    }
    // rejected entries silently default to absent (treated as 0n by consumers)
  }

  return result
}

/**
 * Unified transaction data type: flat, serializable and display-friendly. 
 * Used by shared UI components and as a return type of the `decodeTransactions` utility. 
 *
 * `SerializableDecodedTransaction` from the liquid-companion-extension
 * is structurally compatible with this type (string `rawAmount`).
 */
export interface TransactionData {
  index: number
  type: string
  typeLabel: string
  sender: string
  senderShort: string
  receiver?: string
  receiverShort?: string
  amount?: string
  rawAmount?: bigint | string
  assetIndex?: number
  appIndex?: number
  rekeyTo?: string
  rekeyToShort?: string
  closeRemainderTo?: string
  closeRemainderToShort?: string
  freezeTarget?: string
  freezeTargetShort?: string
  isFreezing?: boolean
  // Common fields
  fee?: number | string
  firstValid?: number | string
  lastValid?: number | string
  genesisID?: string
  genesisHash?: string
  group?: string
  lease?: string
  note?: string
  // App call fields
  onComplete?: string
  appArgs?: string[]
  appAccounts?: string[]
  appForeignApps?: string[]
  appForeignAssets?: string[]
  approvalProgram?: string
  clearProgram?: string
  // Key registration fields
  voteKey?: string
  selectionKey?: string
  stateProofKey?: string
  voteFirst?: number | string
  voteLast?: number | string
  voteKeyDilution?: number | string
  nonParticipation?: boolean
  // Asset config fields
  assetTotal?: string
  assetDecimals?: number
  assetDefaultFrozen?: boolean
  assetManager?: string
  assetReserve?: string
  assetFreeze?: string
  assetClawback?: string
  assetUnitName?: string
  assetName?: string
  assetURL?: string
  // Asset transfer fields
  assetSender?: string
}

export type TransactionDanger = ('rekey' | 'closeTo')[] | false

export interface AssetInfo {
  decimals: number
  name: string
  unitName: string
}

/**
 * Minimal interface for algod client asset lookup.
 * Avoids requiring algosdk as a dependency.
 */
export interface AssetLookupClient {
  getAssetByID(id: number): { do(): Promise<{ params: { decimals: number; name?: string; unitName?: string } }> }
}

// ---------------------------------------------------------------------------
// Adapter interfaces for dependency injection
// ---------------------------------------------------------------------------

import type algosdk from 'algosdk'
import type { CachedAsset } from './cache/assetCache'

/**
 * Wallet primitives that consumers inject into panel state hooks.
 * Decouples state management from any specific wallet provider.
 */
export interface WalletAdapter {
  activeAddress: string | null
  algodClient: algosdk.Algodv2 | null
  signTransactions: (txns: Uint8Array[]) => Promise<(Uint8Array | null)[]>
  /** Called after a transaction is confirmed (e.g. to invalidate queries). */
  onTransactionSuccess?: () => void
}

/**
 * Asset name search provider — consumers supply their own registry implementation.
 */
export interface AssetSearchProvider {
  searchByName: (query: string, limit?: number) => Promise<CachedAsset[]>
  registryLoading: boolean
}

import type { EIP1193Provider } from './services/evmProviderAdapter'

/**
 * Extends `WalletAdapter` with EVM-specific fields and Algorand
 * account info needed for cross-chain bridge operations.
 */
export interface BridgeWalletAdapter extends WalletAdapter {
  evmAddress: string | null
  isAlgoXEvm: boolean
  getEvmProvider?: () => Promise<EIP1193Provider>
  /** Algorand account data. If `algorandAccountInfoFetched` is true, can still be null if the account is non-existent. */
  algorandAccountInfo: algosdk.modelsv2.Account | null | undefined
  /** True once the account info has resolved at least once (success or error). */
  algorandAccountInfoFetched: boolean
  /** Called when the user triggers a manual balance refresh. */
  onRefreshAlgorandBalance: () => unknown
}

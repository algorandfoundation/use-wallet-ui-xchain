import algosdk from 'algosdk'
import { useCallback, useState } from 'react'
import type { CachedAsset } from '../cache/assetCache'
import type { AssetSearchProvider, WalletAdapter } from '../types'
import { useAssetLookup } from './useAssetLookup'
import { useAssetNameSearch, type UseAssetNameSearchReturn } from './useAssetNameSearch'

export interface UseReceivePanelReturn {
  activeAddress: string | null
  optedInAssetIds: Set<number>
  assetIdInput: string
  setAssetIdInput: (value: string) => void
  assetInfo: { name: string; unitName: string; index: number; decimals: number } | null
  assetLookupLoading: boolean
  assetLookupError: string | null
  txId: string | null
  status: 'idle' | 'signing' | 'sending' | 'success' | 'error'
  error: string | null
  handleOptIn: () => Promise<void>
  reset: () => void
  retry: () => void
  // Name search fields for ReceivePanel
  nameSearchResults: CachedAsset[]
  nameSearchLoading: boolean
  registryLoading: boolean
  selectedNameAsset: CachedAsset | null
  onSelectNameAsset: (asset: CachedAsset) => void
  isNameMode: boolean
}

function isNumericInput(input: string): boolean {
  return /^\d*$/.test(input)
}

/** No-op name search used when no AssetSearchProvider is given. */
const EMPTY_NAME_SEARCH: UseAssetNameSearchReturn = {
  nameInput: '',
  setNameInput: () => {},
  results: [],
  isSearching: false,
  selectedAsset: null,
  selectAsset: () => {},
  reset: () => {},
}

export function useReceivePanel(
  wallet: WalletAdapter,
  optedInAssetIds: Set<number> = new Set(),
  searchProvider?: AssetSearchProvider,
): UseReceivePanelReturn {
  const { activeAddress, algodClient, signTransactions, onTransactionSuccess } = wallet
  const lookup = useAssetLookup(algodClient)

  // Name search is optional — only active when a provider is given
  const nameSearchReal = useAssetNameSearch(searchProvider ?? { searchByName: async () => [], registryLoading: false })
  const nameSearch = searchProvider ? nameSearchReal : EMPTY_NAME_SEARCH

  const [status, setStatus] = useState<'idle' | 'signing' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  // Track which mode we're in based on the current input
  const [rawInput, setRawInput] = useState('')
  const isNameMode = !isNumericInput(rawInput)

  const reset = useCallback(() => {
    setRawInput('')
    lookup.reset()
    nameSearch.reset()
    setTxId(null)
    setStatus('idle')
    setError(null)
  }, [lookup, nameSearch])

  const retry = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  const setAssetIdInput = useCallback(
    (value: string) => {
      const numeric = isNumericInput(value)
      setRawInput(value)
      if (numeric) {
        lookup.setAssetIdInput(value)
        nameSearch.reset()
      } else {
        lookup.setAssetIdInput('')
        nameSearch.setNameInput(value)
      }
    },
    [lookup, nameSearch],
  )

  const handleOptIn = useCallback(async () => {
    const currentIsNameMode = !isNumericInput(rawInput)
    const assetIndex = currentIsNameMode ? nameSearch.selectedAsset?.index : lookup.assetInfo?.index
    if (!assetIndex || !activeAddress || !algodClient) return

    setStatus('signing')
    setError(null)
    setTxId(null)

    try {
      const suggestedParams = await algodClient.getTransactionParams().do()
      const txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: activeAddress,
        amount: 0,
        assetIndex: assetIndex,
        suggestedParams,
      })

      const signedTxns = await signTransactions([txn.toByte()])
      const signedTxn = signedTxns[0]
      if (!signedTxn) throw new Error('Transaction was not signed')

      setStatus('sending')
      const id = txn.txID()
      await algodClient.sendRawTransaction(signedTxn).do()
      await algosdk.waitForConfirmation(algodClient, id, 8)

      onTransactionSuccess?.()

      setTxId(id)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Opt-in failed')
    }
  }, [rawInput, nameSearch.selectedAsset, lookup.assetInfo, activeAddress, algodClient, signTransactions, onTransactionSuccess])

  return {
    activeAddress: activeAddress ?? null,
    optedInAssetIds,
    assetIdInput: rawInput,
    setAssetIdInput,
    assetInfo: lookup.assetInfo,
    assetLookupLoading: lookup.isLoading,
    assetLookupError: lookup.error,
    txId,
    status,
    error,
    handleOptIn,
    reset,
    retry,
    nameSearchResults: nameSearch.results,
    nameSearchLoading: nameSearch.isSearching,
    registryLoading: searchProvider?.registryLoading ?? false,
    selectedNameAsset: nameSearch.selectedAsset,
    onSelectNameAsset: nameSearch.selectAsset,
    isNameMode,
  }
}

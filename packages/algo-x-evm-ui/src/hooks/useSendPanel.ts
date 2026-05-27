import algosdk from 'algosdk'
import { useCallback, useEffect, useState } from 'react'
import type { WalletAdapter } from '../types'
import { useAssetLookup, type AssetLookupInfo } from './useAssetLookup'

/** Convert a decimal amount string to base units using string math to avoid floating-point errors. */
function toBaseUnits(amount: string, decimals: number): number {
  const [whole = '0', frac = ''] = amount.split('.')
  const truncated = frac.slice(0, decimals).padEnd(decimals, '0')
  const result = parseInt(whole + truncated, 10)
  if (isNaN(result) || result < 0) throw new Error('Invalid amount')
  return result
}

export type ReceiverOptInStatus = 'idle' | 'checking' | 'opted-in' | 'not-opted-in'

export interface UseSendPanelReturn {
  activeAddress: string | null
  sendType: 'algo' | 'asa'
  setSendType: (type: 'algo' | 'asa') => void
  receiver: string
  setReceiver: (value: string) => void
  amount: string
  setAmount: (value: string) => void
  assetIdInput: string
  setAssetIdInput: (value: string) => void
  assetInfo: AssetLookupInfo | null
  assetLookupLoading: boolean
  assetLookupError: string | null
  receiverOptInStatus: ReceiverOptInStatus
  receiverAddressError: string | null
  optOut: boolean
  setOptOut: (value: boolean) => void
  closeAlgoAccount: boolean
  setCloseAlgoAccount: (value: boolean) => void
  txId: string | null
  status: 'idle' | 'signing' | 'sending' | 'success' | 'error'
  error: string | null
  handleSend: () => Promise<void>
  reset: () => void
  retry: () => void
}

export function useSendPanel(wallet: WalletAdapter): UseSendPanelReturn {
  const { activeAddress, algodClient, signTransactions, onTransactionSuccess } = wallet

  const [sendType, setSendType] = useState<'algo' | 'asa'>('algo')
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing' | 'sending' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)

  const lookup = useAssetLookup(algodClient, { enabled: sendType === 'asa' })

  const [receiverOptInStatus, setReceiverOptInStatus] = useState<ReceiverOptInStatus>('idle')
  const [optOut, setOptOut] = useState(false)
  const [closeAlgoAccount, setCloseAlgoAccount] = useState(false)

  const receiverAddressError: string | null =
    receiver.length > 0 && !algosdk.isValidAddress(receiver)
      ? 'Invalid Algorand address'
      : null

  // Check if receiver is opted into the selected asset
  const assetIdInput = lookup.assetIdInput
  useEffect(() => {
    if (sendType !== 'asa' || !assetIdInput || !receiver || !algodClient) {
      setReceiverOptInStatus('idle')
      return
    }

    let valid = false
    try {
      valid = algosdk.isValidAddress(receiver)
    } catch {
      // ignore
    }
    if (!valid) {
      setReceiverOptInStatus('idle')
      return
    }

    setReceiverOptInStatus('checking')
    let cancelled = false

    const timer = setTimeout(async () => {
      try {
        const info = await algodClient.accountInformation(receiver).do()
        if (cancelled) return
        const assetId = Number(assetIdInput)
        const optedIn = info.assets?.some((a: { assetId: number | bigint }) => Number(a.assetId) === assetId)
        setReceiverOptInStatus(optedIn ? 'opted-in' : 'not-opted-in')
      } catch {
        if (!cancelled) setReceiverOptInStatus('idle')
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sendType, assetIdInput, receiver, algodClient])

  const reset = useCallback(() => {
    setSendType('algo')
    setReceiver('')
    setAmount('')
    lookup.reset()
    setReceiverOptInStatus('idle')
    setOptOut(false)
    setCloseAlgoAccount(false)
    setTxId(null)
    setStatus('idle')
    setError(null)
  }, [lookup])

  const retry = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  const handleSend = useCallback(async () => {
    if (!activeAddress || !algodClient || !receiver || amount === '') return

    setStatus('signing')
    setError(null)
    setTxId(null)

    try {
      const suggestedParams = await algodClient.getTransactionParams().do()

      let txn: algosdk.Transaction
      if (sendType === 'algo') {
        const amountMicroAlgos = toBaseUnits(amount, 6)
        txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: activeAddress,
          receiver,
          amount: amountMicroAlgos,
          closeRemainderTo: closeAlgoAccount ? receiver : undefined,
          suggestedParams,
        })
      } else {
        if (!lookup.assetInfo) throw new Error('No asset selected')
        const baseUnits = toBaseUnits(amount, lookup.assetInfo.decimals)
        txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: activeAddress,
          receiver,
          amount: baseUnits,
          assetIndex: lookup.assetInfo.index,
          closeRemainderTo: optOut ? receiver : undefined,
          suggestedParams,
        })
      }

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
      setError(err instanceof Error ? err.message : 'Send failed')
    }
  }, [sendType, amount, receiver, optOut, closeAlgoAccount, lookup.assetInfo, activeAddress, algodClient, signTransactions, onTransactionSuccess])

  return {
    activeAddress: activeAddress ?? null,
    sendType,
    setSendType,
    receiver,
    setReceiver,
    amount,
    setAmount,
    assetIdInput: lookup.assetIdInput,
    setAssetIdInput: lookup.setAssetIdInput,
    assetInfo: lookup.assetInfo,
    assetLookupLoading: lookup.isLoading,
    assetLookupError: lookup.error,
    receiverOptInStatus,
    receiverAddressError,
    optOut,
    setOptOut,
    closeAlgoAccount,
    setCloseAlgoAccount,
    txId,
    status,
    error,
    handleSend,
    reset,
    retry,
  }
}

import algosdk from 'algosdk'
import type { TransactionData, TransactionDanger } from '../types'

/**
 * Extracted utility from `@txnlab/utils-ts` to avoid depending on the entire library.
 */
function formatShortAddress(address: string, prefixLength = 5, suffixLength = 5): string {
  return address.length <= prefixLength + suffixLength
    ? address
    : `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`
}

const TYPE_LABELS: Record<string, string> = {
  pay: 'Payment',
  keyreg: 'Key Registration',
  acfg: 'Asset Config',
  axfer: 'Asset Transfer',
  afrz: 'Asset Freeze',
  appl: 'Application Call',
  stpf: 'State Proof',
  hb: 'Heartbeat',
}

function tryDecodeTxn(bytes: Uint8Array): algosdk.Transaction | null {
  try {
    return algosdk.decodeUnsignedTransaction(bytes)
  } catch {
    try {
      const signed = algosdk.decodeSignedTransaction(bytes)
      return signed.txn
    } catch {
      return null
    }
  }
}

function formatAmount(amountBigInt: bigint, type: string): string {
  if (type === 'pay') {
    const algo = Number(amountBigInt) / 1_000_000
    return `${algo} ALGO`
  }
  return amountBigInt.toString()
}

export function decodeTransactions(
  txnGroup: algosdk.Transaction[] | Uint8Array[],
): { transactions: algosdk.Transaction[]; decodedTransactions: TransactionData[]; dangerous: TransactionDanger; genesisHash: string | null; genesisID: string | null } {
  const result: TransactionData[] = []
  const transactions: algosdk.Transaction[] = []
  const dangerousList: Exclude<TransactionDanger, false> = []
  let genesisHash: string | null = null
  let genesisID: string | null = null

  for (let i = 0; i < txnGroup.length; i++) {
    const item = txnGroup[i]
    let txn: algosdk.Transaction | null = null

    if (item instanceof Uint8Array) {
      txn = tryDecodeTxn(item)
    } else if (item && typeof item === 'object' && 'sender' in item && 'type' in item) {
      txn = item as algosdk.Transaction
    }

    if (txn?.rekeyTo) {
      dangerousList.push('rekey')
    }

    if (!txn) continue

    const senderStr = txn.sender.toString()

    const decoded: TransactionData = {
      index: i,
      type: txn.type,
      typeLabel: TYPE_LABELS[txn.type] || txn.type,
      sender: senderStr,
      senderShort: formatShortAddress(senderStr, 4, 4),
    }

    if (txn.rekeyTo) {
      const rekeyToStr = txn.rekeyTo.toString()
      decoded.rekeyTo = rekeyToStr
      decoded.rekeyToShort = formatShortAddress(rekeyToStr, 4, 4)
    }

    if (txn.payment) {
      const receiverStr = txn.payment.receiver.toString()
      decoded.receiver = receiverStr
      decoded.receiverShort = formatShortAddress(receiverStr, 4, 4)
      decoded.amount = formatAmount(txn.payment.amount, 'pay')
      if (txn.payment.closeRemainderTo) {
        const closeToStr = txn.payment.closeRemainderTo.toString()
        decoded.closeRemainderTo = closeToStr
        decoded.closeRemainderToShort = formatShortAddress(closeToStr, 4, 4)
        dangerousList.push('closeTo')
      }
    }

    if (txn.assetTransfer) {
      const receiverStr = txn.assetTransfer.receiver.toString()
      decoded.receiver = receiverStr
      decoded.receiverShort = formatShortAddress(receiverStr, 4, 4)
      decoded.rawAmount = txn.assetTransfer.amount
      decoded.amount = txn.assetTransfer.amount.toString()
      decoded.assetIndex = Number(txn.assetTransfer.assetIndex)
      if (txn.assetTransfer.closeRemainderTo) {
        const closeToStr = txn.assetTransfer.closeRemainderTo.toString()
        decoded.closeRemainderTo = closeToStr
        decoded.closeRemainderToShort = formatShortAddress(closeToStr, 4, 4)
        dangerousList.push('closeTo')
      }
    }

    if (txn.assetConfig) {
      decoded.assetIndex = Number(txn.assetConfig.assetIndex)
    }

    if (txn.assetFreeze) {
      decoded.assetIndex = Number(txn.assetFreeze.assetIndex)
      const freezeTargetStr = txn.assetFreeze.freezeAccount.toString()
      decoded.freezeTarget = freezeTargetStr
      decoded.freezeTargetShort = formatShortAddress(freezeTargetStr, 4, 4)
      decoded.isFreezing = txn.assetFreeze.frozen
    }

    if (txn.applicationCall) {
      decoded.appIndex = Number(txn.applicationCall.appIndex)
      const OC_LABELS: Record<number, string> = { 0: 'NoOp', 1: 'OptIn', 2: 'CloseOut', 3: 'ClearState', 4: 'UpdateApplication', 5: 'DeleteApplication' }
      decoded.onComplete = OC_LABELS[txn.applicationCall.onComplete] ?? String(txn.applicationCall.onComplete)
      if (txn.applicationCall.appArgs.length > 0) {
        decoded.appArgs = txn.applicationCall.appArgs.map((a) => Buffer.from(a).toString('base64'))
      }
      if (txn.applicationCall.accounts.length > 0) {
        decoded.appAccounts = txn.applicationCall.accounts.map((a) => a.toString())
      }
      if (txn.applicationCall.foreignApps.length > 0) {
        decoded.appForeignApps = txn.applicationCall.foreignApps.map((a) => String(a))
      }
      if (txn.applicationCall.foreignAssets.length > 0) {
        decoded.appForeignAssets = txn.applicationCall.foreignAssets.map((a) => String(a))
      }
      if (txn.applicationCall.approvalProgram.length > 0) {
        decoded.approvalProgram = `${txn.applicationCall.approvalProgram.length} bytes`
      }
      if (txn.applicationCall.clearProgram.length > 0) {
        decoded.clearProgram = `${txn.applicationCall.clearProgram.length} bytes`
      }
    }

    if (txn.keyreg) {
      if (txn.keyreg.voteKey) decoded.voteKey = Buffer.from(txn.keyreg.voteKey).toString('base64')
      if (txn.keyreg.selectionKey) decoded.selectionKey = Buffer.from(txn.keyreg.selectionKey).toString('base64')
      if (txn.keyreg.stateProofKey) decoded.stateProofKey = Buffer.from(txn.keyreg.stateProofKey).toString('base64')
      if (txn.keyreg.voteFirst !== undefined) decoded.voteFirst = Number(txn.keyreg.voteFirst)
      if (txn.keyreg.voteLast !== undefined) decoded.voteLast = Number(txn.keyreg.voteLast)
      if (txn.keyreg.voteKeyDilution !== undefined) decoded.voteKeyDilution = Number(txn.keyreg.voteKeyDilution)
      decoded.nonParticipation = txn.keyreg.nonParticipation
    }

    if (txn.assetConfig) {
      if (txn.assetConfig.total) decoded.assetTotal = String(txn.assetConfig.total)
      if (txn.assetConfig.decimals) decoded.assetDecimals = txn.assetConfig.decimals
      decoded.assetDefaultFrozen = txn.assetConfig.defaultFrozen
      if (txn.assetConfig.manager) decoded.assetManager = txn.assetConfig.manager.toString()
      if (txn.assetConfig.reserve) decoded.assetReserve = txn.assetConfig.reserve.toString()
      if (txn.assetConfig.freeze) decoded.assetFreeze = txn.assetConfig.freeze.toString()
      if (txn.assetConfig.clawback) decoded.assetClawback = txn.assetConfig.clawback.toString()
      if (txn.assetConfig.unitName) decoded.assetUnitName = txn.assetConfig.unitName
      if (txn.assetConfig.assetName) decoded.assetName = txn.assetConfig.assetName
      if (txn.assetConfig.assetURL) decoded.assetURL = txn.assetConfig.assetURL
    }

    if (txn.assetTransfer?.assetSender) {
      decoded.assetSender = txn.assetTransfer.assetSender.toString()
    }

    // Common fields
    decoded.fee = Number(txn.fee)
    decoded.firstValid = Number(txn.firstValid)
    decoded.lastValid = Number(txn.lastValid)
    if (txn.genesisID) decoded.genesisID = txn.genesisID
    if (txn.genesisHash) decoded.genesisHash = Buffer.from(txn.genesisHash).toString('base64')
    if (txn.group) decoded.group = Buffer.from(txn.group).toString('base64')
    if (txn.lease) decoded.lease = Buffer.from(txn.lease).toString('base64')
    if (txn.note && txn.note.length > 0) {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(txn.note)
        decoded.note = text
      } catch {
        decoded.note = Buffer.from(txn.note).toString('base64')
      }
    }

    // Extract genesis hash/ID from first transaction that has them
    if (!genesisHash && txn.genesisHash) {
      genesisHash = Buffer.from(txn.genesisHash).toString('base64')
    }
    if (!genesisID && txn.genesisID) {
      genesisID = txn.genesisID
    }

    result.push(decoded)
    transactions.push(txn)
  }

  const dangerous: TransactionDanger = dangerousList.length > 0 ? dangerousList : false
  return { transactions, decodedTransactions: result, dangerous, genesisHash, genesisID }
}

import type { BridgePanelProps } from '@d13co/algo-x-evm-ui'
import type { UseBridgeReturn } from '../hooks/useBridge'

/**
 * Maps the `useBridge()` return value to the props expected by `<BridgePanel>`.
 * Shared by ConnectedWalletMenu (legacy inline bridge) and BridgeDialog (standalone).
 */
export function mapBridgeToPanelProps(
  bridge: UseBridgeReturn,
  onBack?: () => void,
): BridgePanelProps {
  return {
    chains: bridge.chains.map((c) => ({
      ...c,
      tokens: c.tokens.map((t) => ({
        ...t,
        decimals: t.decimals,
        balance: t.balance,
      })),
    })),
    chainsLoading: bridge.chainsLoading,
    balancesLoading: bridge.balancesLoading,
    initialLoadComplete: bridge.initialLoadComplete,
    sourceChainSymbol: bridge.sourceChain?.chainSymbol ?? null,
    onSourceChainChange: bridge.setSourceChain,
    sourceTokenSymbol: bridge.sourceToken?.symbol ?? null,
    onSourceTokenChange: bridge.setSourceToken,
    destinationChains: bridge.destinationChains.map((c) => ({
      ...c,
      tokens: c.tokens.map((t) => ({
        ...t,
        decimals: t.decimals,
        balance: t.balance,
      })),
    })),
    destinationChainSymbol: bridge.destinationChain?.chainSymbol ?? null,
    onDestinationChainChange: bridge.setDestinationChain,
    sourceIsAlgorand: bridge.sourceIsAlgorand,
    destinationTokenSymbol: bridge.destinationToken?.symbol ?? null,
    destinationTokens: bridge.destinationChain?.tokens ?? (bridge.destinationToken ? [bridge.destinationToken] : []),
    onDestinationTokenChange: bridge.setDestinationToken,
    amount: bridge.amount,
    onAmountChange: bridge.setAmount,
    receivedAmount: bridge.receivedAmount,
    quoteLoading: bridge.quoteLoading,
    gasFee: bridge.gasFee,
    gasFeeLoading: bridge.gasFeeLoading,
    gasFeeUnit: bridge.gasFeeUnit,
    extraGasAlgo: bridge.extraGasAlgo,
    totalFee: bridge.totalFee,
    evmAddress: bridge.evmAddress,
    algorandAddress: bridge.algorandAddress,
    estimatedTimeMs: bridge.estimatedTimeMs,
    waitingSince: bridge.waitingSince,
    transferStatus: bridge.transferStatus
      ? {
          sendConfirmations: bridge.transferStatus.send?.confirmations ?? 0,
          sendConfirmationsNeeded: bridge.transferStatus.send?.confirmationsNeeded ?? 0,
          signaturesCount: bridge.transferStatus.signaturesCount ?? 0,
          signaturesNeeded: bridge.transferStatus.signaturesNeeded ?? 0,
          receiveConfirmations: bridge.transferStatus.receive?.confirmations ?? null,
          receiveConfirmationsNeeded: bridge.transferStatus.receive?.confirmationsNeeded ?? null,
        }
      : null,
    optInNeeded: bridge.optInNeeded,
    optInSigned: bridge.optInSigned,
    watchingForFunding: bridge.watchingForFunding,
    optInConfirmed: bridge.optInConfirmed,
    status: bridge.status,
    error: bridge.error,
    sourceTxId: bridge.sourceTxId,
    destinationTxId: bridge.transferStatus?.receive?.txId ?? null,
    onBridge: bridge.handleBridge,
    onReset: bridge.reset,
    onRetry: bridge.retry,
    onRefresh: bridge.refreshBalances,
    isRefreshing: bridge.balancesLoading,
    onBack,
  }
}

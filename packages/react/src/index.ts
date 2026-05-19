import { initializeFonts } from './utils/fontLoader'

export { ConnectWalletButton } from './components/ConnectWalletButton'
export type { ButtonSize } from './components/ConnectWalletButton'
export { ConnectWalletMenu } from './components/ConnectWalletMenu'
export { ConnectedWalletButton } from './components/ConnectedWalletButton'
export { ConnectedWalletMenu } from './components/ConnectedWalletMenu'
export { WalletButton } from './components/WalletButton'
export { WalletList } from './components/WalletList'
export { NfdAvatar } from './components/NfdAvatar'

// Hooks
export { useAssetRegistry } from './hooks/useAssetRegistry'
export type { UseAssetRegistryReturn } from './hooks/useAssetRegistry'
export { useBridge } from './hooks/useBridge'
export type { UseBridgeReturn, UseBridgeOptions, BridgeStatus, BridgeChain, BridgeToken } from './hooks/useBridge'
export { useSwap } from './hooks/useSwap'
export type { UseSwapReturn, UseSwapOptions } from './hooks/useSwap'
export { useNfd } from './hooks/useNfd'
export type { NfdRecord, NfdLookupResponse } from './hooks/useNfd'
export { useAccountInfo } from './hooks/useAccountInfo'
export { useResolvedTheme } from './hooks/useResolvedTheme'
export type { Theme, ResolvedTheme } from './hooks/useResolvedTheme'

// Providers
export { WalletUIProvider, useWalletUI, useBeforeSignDialog, useAfterSignDialog, useWelcomeDialog } from './providers/WalletUIProvider'
export type { RainbowKitUIConfig } from './providers/WalletUIProvider'
export { useBridgeDialog } from './providers/BridgeDialogProvider'
export type { BridgeDialogContextType } from './providers/BridgeDialogProvider'
export { mapBridgeToPanelProps } from './utils/bridgePropsMapper'
export { useHaystackSwapConfig, buildHaystackSwapOptions } from './utils/useHaystackSwapConfig'
export type { UseHaystackSwapConfigOptions, SwapRouterLike } from './utils/useHaystackSwapConfig'

export { getDefaultConfig } from './rainbowkit'

// Notices (disclaimers & info dialogs) — re-exported from @d13co/algo-x-evm-ui
export {
  Disclaimer,
  InfoDialog,
  NoticeProvider,
  useNotice,
  useNoticeConfig,
  NOTICES_PERSIST_KEY,
  readNoticeAcks,
  clearAllNoticeAcks,
} from '@d13co/algo-x-evm-ui'
export type {
  DisclaimerProps,
  InfoDialogProps,
  NoticeProviderProps,
  DisclaimerNotice,
  InfoNotice,
  FooterNotice,
  NoticeConfig,
  NoticesConfig,
  UseNoticeReturn,
  NoticeAckMap,
} from '@d13co/algo-x-evm-ui'

// Initialize custom fonts
initializeFonts()

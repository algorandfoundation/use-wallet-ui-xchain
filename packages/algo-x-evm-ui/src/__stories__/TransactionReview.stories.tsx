import type { Meta, StoryObj, Decorator } from '@storybook/react'
import { useEffect, useState } from 'react'
import { TransactionReview } from '../components/TransactionReview'
import * as mocks from './mocks'

const TESTNET_GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='

// Inline SVG data URL so stories don't need network access to render a wallet icon.
const SAMPLE_WALLET_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="%23FFB800"/><path d="M10 22l4-12h4l4 12h-3l-.8-2.5h-4.4L13 22h-3zm5.2-5h2.6l-1.3-4-1.3 4z" fill="%23000"/></svg>',
  )

const meta: Meta<typeof TransactionReview> = {
  title: 'TransactionReview',
  component: TransactionReview,
  args: {
    message: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    dangerous: false,
    walletName: 'Pera Wallet',
    walletIcon: SAMPLE_WALLET_ICON,
    onApprove: () => console.log('approved'),
    onReject: () => console.log('rejected'),
    verifyUrl: 'https://example.com/verify#sample',
  },
}

export default meta
type Story = StoryObj<typeof TransactionReview>

export const SinglePayment: Story = {
  args: {
    transactions: mocks.singlePayment(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const GroupOfTwoPayments: Story = {
  args: {
    transactions: mocks.groupOfTwoPayments(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const RekeyTransaction: Story = {
  args: {
    transactions: mocks.rekeyTransaction(),
    dangerous: ['rekey'],
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const CloseOutTransaction: Story = {
  args: {
    transactions: mocks.closeOutTransaction(),
    dangerous: ['closeTo'],
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

const mockAlgodClient = {
  getAssetByID: (id: number) => ({
    do: async () => {
      if (id === 31566704) return { params: { decimals: 6, name: 'USD Coin', unitName: 'USDC' } }
      if (id === 312769) return { params: { decimals: 6, name: 'Tether USDt', unitName: 'USDt' } }
      return { params: { decimals: 0 } }
    },
  }),
}

export const ThreeStackedDangerous: Story = {
  args: {
    transactions: mocks.threeStackedDangerousGroup(),
    dangerous: ['rekey', 'closeTo'],
    algodClient: mockAlgodClient,
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const MixedDangerousGroup: Story = {
  args: {
    transactions: mocks.mixedDangerousGroup(),
    dangerous: ['rekey', 'closeTo'],
    algodClient: mockAlgodClient,
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const TwoAssetClosings: Story = {
  args: {
    transactions: mocks.twoAssetClosingsGroup(),
    dangerous: ['closeTo', 'closeTo'],
    algodClient: mockAlgodClient,
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const AssetOptIn: Story = {
  args: {
    transactions: mocks.assetOptIn(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const AssetTransfer: Story = {
  args: {
    transactions: mocks.assetTransfer(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const ApplicationCall: Story = {
  args: {
    transactions: mocks.applicationCall(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const KeyRegistration: Story = {
  args: {
    transactions: mocks.keyRegistration(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const MixedGroup: Story = {
  args: {
    transactions: mocks.mixedGroup(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const LargePaymentGroup: Story = {
  args: {
    transactions: mocks.largePaymentGroup(),
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const Signing: Story = {
  args: {
    transactions: mocks.singlePayment(),
    signing: true,
    walletName: 'Pera Wallet',
    genesisHash: TESTNET_GENESIS_HASH,
    verifyUrl: 'https://example.com/verify#sample',
  },
}

export const WithOrigin: Story = {
  args: {
    transactions: mocks.singlePayment(),
    origin: 'https://dapp.example.com',
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const PayloadVerificationFailed: Story = {
  args: {
    transactions: mocks.singlePayment(),
    payloadVerified: false,
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const MaxSizeNote: Story = {
  args: {
    transactions: [
      {
        ...mocks.singlePayment()[0],
        note: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula ut dictum pharetra, nisi nunc fringilla magna, in commodo elit erat nec turpis. Ut pharetra augue nec augue. Nam elit magna, hendrerit sit amet, tincidunt ac, viverra sed nulla. Donec porta diam eu massa. Quisque diam lorem, interdum vitae, dui sed ab.',
      },
    ],
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const BinaryNote: Story = {
  args: {
    transactions: [
      {
        ...mocks.singlePayment()[0],
        note: 'iKNyY3bEIJkCMheVHx4CK7J07fHsot/kSi0x4Ht1sNuH+bh8a6OQo2FtdM0Bo3NuZMQg',
      },
    ],
    genesisHash: TESTNET_GENESIS_HASH,
  },
}

export const UnknownNetwork: Story = {
  args: {
    transactions: mocks.singlePayment(),
    genesisHash: 'dW5rbm93bmdlbmVzaXNoYXNoYmFzZTY0ZW5jb2RlZA==',
  },
}

// When WalletUIProvider prop `verify={false}`: no `verifyUrl`, so the footer omits the Verify button entirely.
export const NoVerifyButton: Story = {
  args: {
    transactions: mocks.singlePayment(),
    genesisHash: TESTNET_GENESIS_HASH,
    verifyUrl: undefined,
  },
}

export const SigningWithoutVerify: Story = {
  args: {
    transactions: mocks.singlePayment(),
    signing: true,
    walletName: 'Pera Wallet',
    genesisHash: TESTNET_GENESIS_HASH,
    verifyUrl: undefined,
  },
}

export const Restored: Story = {
  args: {
    transactions: mocks.singlePayment(),
    genesisHash: TESTNET_GENESIS_HASH,
    verifyUrl: 'https://example.com/verify#sample',
    restored: true,
  },
}

// --- Wallet in-app browser: verify-blocked state (swap case) ---
const METAMASK_IN_APP_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WebView MetaMaskMobile'

function setUserAgent(ua: string): boolean {
  try {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
    return true
  } catch {
    return false
  }
}

const withWalletEmbeddedBrowser: Decorator = (Story) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const realUserAgent = navigator.userAgent
    const applied = setUserAgent(METAMASK_IN_APP_UA)
    setReady(true)
    return () => {
      if (applied) setUserAgent(realUserAgent)
    }
  }, [])

  return ready ? <Story /> : <></>
}

export const VerifyBlocked: Story = {
  decorators: [withWalletEmbeddedBrowser],
  args: {
    transactions: mocks.groupOfTwoPayments(),
    genesisHash: TESTNET_GENESIS_HASH,
    verifyUrl: 'https://example.com/verify#sample',
    restorable: false,
  },
}

import type { Meta, StoryObj } from '@storybook/react'
import { TransactionReview } from '../components/TransactionReview'
import * as mocks from './mocks'

const TESTNET_GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='
const MAINNET_GENESIS_HASH = 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8='
const UNKNOWN_GENESIS_HASH = 'dW5rbm93bmdlbmVzaXNoYXNoYmFzZTY0ZW5jb2RlZA=='

const mockAlgodClient = {
  getAssetByID: (id: number) => ({
    do: async () => {
      if (id === 31566704) return { params: { decimals: 6, name: 'USD Coin', unitName: 'USDC' } }
      if (id === 312769) return { params: { decimals: 6, name: 'Tether USDt', unitName: 'USDt' } }
      return { params: { decimals: 0 } }
    },
  }),
}

const meta: Meta<typeof TransactionReview> = {
  title: 'TransactionReview (verifyDisplayMode)',
  component: TransactionReview,
  args: {
    message: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    dangerous: false,
    verifyDisplayMode: true,
    origin: 'https://dapp.example.com',
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

export const LargePaymentGroup: Story = {
  args: {
    transactions: mocks.largePaymentGroup(),
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

export const MainNet: Story = {
  args: {
    transactions: mocks.singlePayment().map((t) => ({ ...t, genesisID: 'mainnet-v1.0', genesisHash: MAINNET_GENESIS_HASH })),
    genesisHash: MAINNET_GENESIS_HASH,
    genesisID: 'mainnet-v1.0',
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
    genesisHash: UNKNOWN_GENESIS_HASH,
  },
}

export const NoOrigin: Story = {
  args: {
    transactions: mocks.singlePayment(),
    genesisHash: TESTNET_GENESIS_HASH,
    origin: undefined,
  },
}

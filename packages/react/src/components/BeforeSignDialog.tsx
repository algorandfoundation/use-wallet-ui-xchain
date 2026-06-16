import {
  useFloating,
  useDismiss,
  useRole,
  useInteractions,
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useId,
} from '@floating-ui/react'
import { useState } from 'react'
import { getApplicationAddress } from 'algosdk'
import { InfoDialog, TransactionReview } from '@d13co/algo-x-evm-ui'
import type { TransactionData, TransactionDanger, AssetLookupClient } from '@d13co/algo-x-evm-ui'

import { useWalletUI } from '../providers/WalletUIProvider'

interface BeforeSignDialogProps {
  transactions: TransactionData[]
  message: string
  onApprove: () => void
  onReject: () => void
  dangerous: TransactionDanger
  genesisHash?: string | null
  genesisID?: string | null
  signing?: boolean
  walletName?: string
  walletIcon?: string
  algodClient?: AssetLookupClient
  network?: string
  verifyUrl?: string
  restored?: boolean
  restorable?: boolean
}

export function BeforeSignDialog({ transactions, message, dangerous, genesisHash, genesisID, onApprove, onReject, signing, walletName, walletIcon, algodClient, network, verifyUrl, restored, restorable }: BeforeSignDialogProps) {
  const { theme } = useWalletUI()
  const [animationState, setAnimationState] = useState<'starting' | 'entered' | 'exiting' | null>('starting')

  const dataTheme = theme === 'system' ? undefined : theme

  const { refs, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open && !signing) {
        setAnimationState('exiting')
        setTimeout(() => onReject(), 150)
      }
    },
  })

  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown', enabled: !signing })
  const role = useRole(context, { role: 'alertdialog' })
  const { getFloatingProps } = useInteractions([dismiss, role])

  const labelId = useId()
  const descriptionId = useId()

  // Trigger enter animation
  if (animationState === 'starting') {
    requestAnimationFrame(() => setAnimationState('entered'))
  }

  const closeButton = (
    <button
      onClick={() => {
        if (signing) return
        setAnimationState('exiting')
        setTimeout(() => onReject(), 150)
      }}
      disabled={signing}
      className="w-8 h-8 flex-none flex items-center justify-center rounded-full bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text-secondary)] hover:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100"
      aria-label="Close dialog"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )

  return (
    <FloatingPortal id="wallet-sign-dialog-portal">
      <div data-wallet-theme data-wallet-ui data-theme={dataTheme}>
        <FloatingOverlay
          className="grid place-items-center px-4 z-[100] pointer-events-auto transition-opacity duration-150 ease-in-out bg-[var(--wui-color-overlay)] data-[state=starting]:opacity-0 data-[state=exiting]:opacity-0 data-[state=entered]:opacity-100"
          data-state={animationState}
          lockScroll
        >
          <FloatingFocusManager context={context} modal={true} outsideElementsInert={true}>
            <div
              ref={refs.setFloating}
              {...getFloatingProps({
                'aria-labelledby': labelId,
                'aria-describedby': descriptionId,
              })}
              role="alertdialog"
              data-state={animationState}
              className="w-full max-w-md rounded-3xl bg-[var(--wui-color-bg)] shadow-xl pointer-events-auto transform transition-all duration-150 ease-in-out data-[state=starting]:opacity-0 data-[state=starting]:scale-90 data-[state=exiting]:opacity-0 data-[state=exiting]:scale-90 data-[state=entered]:opacity-100 data-[state=entered]:scale-100"
              style={{ marginTop: '-0.5rem' }}
            >
              <InfoDialog id="sign" className="m-4 flex flex-col gap-4 p-5 rounded-xl border border-[var(--wui-color-border)] bg-[var(--wui-color-bg-secondary)] text-[var(--wui-color-text)]">
                <TransactionReview
                  transactions={transactions}
                  message={message}
                  dangerous={dangerous}
                  genesisHash={genesisHash}
                  genesisID={genesisID}
                  algodClient={algodClient}
                  network={network}
                  getApplicationAddress={(appId: number) => getApplicationAddress(BigInt(appId))}
                  onApprove={onApprove}
                  onReject={() => {
                    setAnimationState('exiting')
                    setTimeout(() => onReject(), 150)
                  }}
                  signing={signing}
                  walletName={walletName}
                  walletIcon={walletIcon}
                  headerAction={closeButton}
                  verifyUrl={verifyUrl}
                  restored={restored}
                  restorable={restorable}
                />
              </InfoDialog>
            </div>
          </FloatingFocusManager>
        </FloatingOverlay>
      </div>
    </FloatingPortal>
  )
}

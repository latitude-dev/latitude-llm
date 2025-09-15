'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

import { UpgradeLink } from '$/components/UpgradeLink'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'

export type PaywallModalContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const PaywallModalContext = createContext<PaywallModalContextValue | undefined>(
  undefined,
)

export function PaywallModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const value = useMemo(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  )

  return (
    <PaywallModalContext.Provider value={value}>
      {children}
      <Modal
        open={isOpen}
        onOpenChange={setIsOpen}
        dismissible
        title='Upgrade is required'
        description="You've reached the credit limit included in your plan. Upgrade, wait for renewal or earn rewards to continue using Latte."
        footer={
          <>
            <CloseTrigger />
            <UpgradeLink
              buttonProps={{
                variant: 'latte',
                fancy: true,
                iconProps: {
                  name: 'arrowUpRight',
                  placement: 'right',
                  size: 'normal',
                  color: 'latteInputForeground',
                  className: 'flex-shrink-0 -mt-px',
                },
                userSelect: false,
              }}
            />
          </>
        }
      >
        <Alert
          variant='warning'
          description='Latitude will continue working, but you will not be able to use Latte.'
        />
      </Modal>
    </PaywallModalContext.Provider>
  )
}

export function usePaywallModal() {
  const ctx = useContext(PaywallModalContext)
  if (!ctx)
    throw new Error('usePaywallModal must be used within PaywallModalProvider')
  return ctx
}

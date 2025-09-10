'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import Link from 'next/link'

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
        description="You've reached the limit included in your plan. Upgrade, wait for renewal or earn rewards to continue using Latte."
        footer={
          <>
            <CloseTrigger />
            <Link href='mailto:hello@latitude.so'>
              <Button fancy iconProps={{ name: 'mail' }}>
                Get in touch to upgrade
              </Button>
            </Link>
          </>
        }
      >
        <Alert description="Latitude will continue working, but you'll no longer be able to use Latte." />
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

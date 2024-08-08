'use client'

import { createContext, ReactNode, useContext } from 'react'

import { useMeasure } from '$ui/browser'

type IAppLayoutContextType = {
  contentHeight: number
}

const AppLayoutContext = createContext<IAppLayoutContextType>(
  {} as IAppLayoutContextType,
)

const RIDICOUSLY_LARGE_NUMBER: number = 10000

function getBrowserHeight() {
  if (typeof window === 'undefined') return RIDICOUSLY_LARGE_NUMBER

  return window.innerHeight
}

const AppLayoutProvider = ({
  appHeader,
  children,
}: {
  appHeader: ReactNode
  children: ReactNode
}) => {
  const [headerRef, { height: headerHeight }] = useMeasure<HTMLDivElement>()
  const height = getBrowserHeight() - headerHeight
  return (
    <AppLayoutContext.Provider value={{ contentHeight: height }}>
      <div className='grid grid-rows-[auto,1fr] h-screen overflow-hidden'>
        <div ref={headerRef}>{appHeader}</div>
        <main
          className='overflow-y-hidden'
          style={{ height }}
          suppressHydrationWarning
        >
          {children}
        </main>
      </div>
    </AppLayoutContext.Provider>
  )
}

const useAppLayout = () => {
  const context = useContext(AppLayoutContext)

  if (!context) {
    throw new Error('useAppLayout must be used within a AppLayoutProvider')
  }

  return context
}

export { AppLayoutProvider, useAppLayout }

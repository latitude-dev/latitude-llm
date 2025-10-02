'use client'

import {
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { LatteChat } from '$/components/LatteSidebar/LatteChat'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import type { ProviderLogDto } from '@latitude-data/core/schema/types'
import { cn } from '@latitude-data/web-ui/utils'
import { zIndex } from '@latitude-data/web-ui/tokens'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { StarburstBadge } from '@latitude-data/web-ui/atoms/StarburstBadge'
import Image from 'next/image'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import {
  ResizableBox,
  ResizeCallbackData,
  SplitHandle,
} from '@latitude-data/web-ui/atoms/Resizable'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

const MIN_WIDTH = 400

export function LatteLayout({
  children,
  initialThreadUuid,
  initialProviderLog,
}: {
  children: ReactNode
  initialThreadUuid?: string
  initialProviderLog?: ProviderLogDto
}) {
  const { value: width, setValue: setWidth } = useLocalStorage<number>({
    key: AppLocalStorage.latteSidebarWidth,
    defaultValue: MIN_WIDTH,
  })
  const [localWidth, setLocalWidth] = useState(MIN_WIDTH)
  const [isOpen, _setIsOpen] = useState(false)
  const setIsOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) setLocalWidth(width)
      _setIsOpen(isOpen)
    },
    [_setIsOpen, setLocalWidth, width],
  )

  const onResizeStop = useCallback(
    (_: SyntheticEvent, data: ResizeCallbackData) => {
      console.log('onResizeStop', data.size.width)
      setWidth(data.size.width)
    },
    [setWidth],
  )
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)

  const openBadgeRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sidebarRef.current) return
    if (!openBadgeRef.current) return

    const sidebar = sidebarRef.current
    const openBadge = openBadgeRef.current

    const onMouseEnter = () => setIsSidebarHovered(true)
    const onMouseLeave = () => setIsSidebarHovered(false)

    sidebar.addEventListener('mouseenter', onMouseEnter)
    sidebar.addEventListener('mouseleave', onMouseLeave)
    openBadge.addEventListener('mouseenter', onMouseEnter)
    openBadge.addEventListener('mouseleave', onMouseLeave)

    return () => {
      sidebar.removeEventListener('mouseenter', onMouseEnter)
      sidebar.removeEventListener('mouseleave', onMouseLeave)
      openBadge.removeEventListener('mouseenter', onMouseEnter)
      openBadge.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <div className='w-full h-full relative overflow-hidden pr-6'>
      {children}

      <ResizableBox
        className={cn(
          'absolute top-4 bottom-4 w-full rounded-l-lg',
          {
            'right-0 translate-x-[0%]': isOpen,
            'right-6 translate-x-[100%]': !isOpen,
          },
          'transition-[right,transform] duration-300',
          zIndex.modal,
        )}
        width={localWidth}
        axis='x'
        minConstraints={[MIN_WIDTH, Infinity]}
        resizeHandles={['w']}
        handle={isOpen ? SplitHandle({ visibleHandle: false }) : null}
        onResizeStop={onResizeStop}
      >
        <div
          className='w-full h-full overflow-hidden border border-r-0 border-latte-border rounded-l-lg'
          ref={sidebarRef}
        >
          {!isOpen && isSidebarHovered && (
            <div
              className='absolute rounded-l-lg top-0 left-0 right-0 bottom-0 cursor-pointer bg-latte-widget/20 z-10'
              onClick={() => setIsOpen(true)}
            />
          )}
          <ClientOnly>
            <LatteChat
              initialThreadUuid={initialThreadUuid}
              initialProviderLog={initialProviderLog}
            />
          </ClientOnly>
        </div>
        <div
          className={cn(
            'absolute left-0 bottom-20 -translate-x-1/2 translate-y-1/2 z-20',
            { 'pointer-events-none': !isOpen },
          )}
        >
          <Button
            onClick={() => setIsOpen(false)}
            variant='outline'
            className='border-latte-border rounded-full h-10 w-10'
          >
            <div className='flex w-6 h-6 items-center justify-between'>
              <Icon name='chevronRight' color='latteBadgeBorder' size='large' />
            </div>
          </Button>
        </div>
      </ResizableBox>
      <div
        className={cn(
          'absolute right-0 bottom-24 translate-y-1/2',
          'transition-all duration-300',
          {
            'pointer-events-none': isOpen,
            'translate-x-full': isOpen,
            'translate-x-1/2': !isOpen,
            'right-6 -rotate-6': !isOpen && isSidebarHovered,
            'right-2 rotate-6': isOpen || !isSidebarHovered,
          },
          zIndex.modal,
        )}
        ref={openBadgeRef}
      >
        <Button variant='ghost' onClick={() => setIsOpen(true)}>
          <StarburstBadge
            className='w-20 h-20'
            backgroundColor='latteBackground'
            borderColor='latteBadgeBorder'
            spin
          >
            <Image
              src='/latte.svg'
              alt='Latte'
              width={50}
              height={50}
              className='select-none duration-500 h-auto'
              unselectable='on'
              unoptimized
            />
          </StarburstBadge>
        </Button>
      </div>
    </div>
  )
}

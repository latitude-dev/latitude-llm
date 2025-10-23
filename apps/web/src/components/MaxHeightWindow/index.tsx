import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode, useEffect, useRef, useState } from 'react'

const MAX_HEIGHT = 400

export function MaxHeightWindow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(() => {
      setIsOverflowing(ref.current!.scrollHeight > MAX_HEIGHT)
    })
    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [children])

  return (
    <div
      className='flex flex-col overflow-hidden relative'
      style={{ maxHeight: isOpen ? 'unset' : MAX_HEIGHT }}
    >
      <div ref={ref} className='w-full h-fit'>
        {children}
      </div>

      {isOverflowing && !isOpen ? (
        <div className='absolute bottom-0 left-0 right-0 h-[80px] bg-gradient-to-t from-backgroundCode from-30% via-backgroundCode/70 via-60% to-transparent flex flex-col items-center justify-end p-0'>
          <Button
            variant='ghost'
            size='small'
            onClick={() => setIsOpen(true)}
            iconProps={{
              name: 'chevronDown',
              color: 'primary',
              placement: 'right',
            }}
          >
            <Text.H6 color='primary'>View more</Text.H6>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

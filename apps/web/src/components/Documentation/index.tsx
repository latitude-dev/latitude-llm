import { envClient } from '$/envClient'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useDocs } from './Provider'
import { DocsRoute, getRouteFromPathname } from './routes'

const DOCS_DOMAIN = envClient.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.latitude.so'

export function DocumentationContent({ isOpen }: { isOpen: boolean }) {
  const { ref: iframeRef, open, navigateTo } = useDocs()

  const pathname = usePathname()
  const recommendedRoute = useMemo(
    () => getRouteFromPathname(pathname),
    [pathname],
  )

  const [initialRoute, setInitialRoute] = useState<DocsRoute>(
    DocsRoute.Introduction,
  )
  const [hasOpened, setHasOpened] = useState(false)
  const [currentRoute, setCurrentRoute] = useState<DocsRoute>(recommendedRoute)
  const [docTitle, setDocTitle] = useState('Documentation')

  useEffect(() => {
    if (hasOpened) return
    if (!isOpen) return

    setHasOpened(true)
    setInitialRoute(recommendedRoute)
  }, [isOpen, hasOpened, recommendedRoute])

  useEffect(() => {
    if (!hasOpened) return
    if (isOpen) return

    navigateTo(recommendedRoute)
  }, [isOpen, hasOpened, navigateTo, recommendedRoute])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'docs.update') {
        const { title, route } = e.data.value
        setDocTitle(title)
        setCurrentRoute(route)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  if (!hasOpened) return null

  return (
    <div className='w-full h-full flex flex-col'>
      <div className='w-full p-4 border-b border-border flex flex-row gap-4 items-center justify-between'>
        <div className='flex flex-row flex-grow min-w-0 items-center gap-4'>
          <Button
            variant='outline'
            iconProps={{
              name: 'house',
              className: 'w-4 h-4',
            }}
            disabled={currentRoute === recommendedRoute}
            onClick={() => {
              open(recommendedRoute)
            }}
            className='px-2'
          />
          <Text.H4 noWrap ellipsis>
            {docTitle}
          </Text.H4>
        </div>
        <Link href={`${DOCS_DOMAIN}${currentRoute}`} target='_blank'>
          <Button
            variant='outline'
            iconProps={{
              name: 'maximize',
            }}
            className='px-2'
          />
        </Link>
      </div>
      <iframe
        ref={iframeRef}
        src={`${DOCS_DOMAIN}${initialRoute}`}
        className='w-full flex-grow min-h-0'
        title='Docs'
      />
    </div>
  )
}

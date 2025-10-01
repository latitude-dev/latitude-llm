import { useDocs } from './Provider'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { envClient } from '$/envClient'

const DOCS_DOMAIN = envClient.NEXT_PUBLIC_DOCS_URL ?? 'https://docs.latitude.so'

export function DocumentationContent() {
  const {
    ref: iframeRef,
    init,
    open,
    navigateTo,
    homeRoute,
    currentRoute,
    docTitle,
  } = useDocs()

  if (!init) return null

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
            disabled={currentRoute === homeRoute}
            onClick={() => navigateTo(homeRoute)}
            className='px-2'
          />
          <Text.H4 noWrap ellipsis>
            {docTitle}
          </Text.H4>
        </div>
        <div className='flex flex-row items-center gap-4'>
          <Link href={`${DOCS_DOMAIN}${currentRoute}`} target='_blank'>
            <Button
              variant='outline'
              iconProps={{
                name: 'externalLink',
              }}
              className='px-2'
            />
          </Link>
          <Button
            variant='outline'
            iconProps={{
              name: 'close',
            }}
            className='px-2'
            onClick={() => open(false)}
          />
        </div>
      </div>
      <iframe
        ref={iframeRef}
        src={`${DOCS_DOMAIN}${currentRoute}`}
        className='w-full flex-grow min-h-0'
        title='Docs'
      />
    </div>
  )
}

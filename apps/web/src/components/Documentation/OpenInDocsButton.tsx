'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocsRoute } from './routes'
import { useDocs } from './Provider'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useState } from 'react'

export function OpenInDocsButton({ route }: { route: DocsRoute }) {
  const { navigateTo } = useDocs()

  const [isHovered, setIsHovered] = useState(false)

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          size='none'
          iconProps={{
            name: 'bookMarked',
            className: 'w-4 h-4',
            color: isHovered ? 'primary' : 'foregroundMuted',
          }}
          variant='ghost'
          className='p-0'
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            navigateTo(route)
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        />
      }
    >
      Learn more
    </Tooltip>
  )
}

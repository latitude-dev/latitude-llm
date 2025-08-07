'use client'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useState } from 'react'
import { useDocs } from './Provider'
import { DocsRoute } from './routes'

export function OpenInDocsButton({ route }: { route: DocsRoute }) {
  const { open } = useDocs()

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
            open(route)
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

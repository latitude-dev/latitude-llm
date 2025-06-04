'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useState } from 'react'

export function KeysetTablePaginationFooter({
  count,
  countLabel,
  cursor: next,
  setNext,
  setPrev,
  unknown,
}: {
  count?: number
  countLabel?: (count: number) => string
  cursor: string | null
  setNext: (cursor: string | null) => void
  setPrev: (cursor: string | null) => void
  unknown?: boolean
}) {
  const [page, setPage] = useState<number>(1)
  const [pages, setPages] = useState<(typeof next)[]>([null])

  const onNext = useCallback(() => {
    setPages([...pages, next])
    setPage(page + 1)
    setNext(next)
  }, [pages, setPages, page, setPage, next, setNext])

  const onPrev = useCallback(() => {
    if (page <= 1) return
    setPages(pages.slice(0, -1))
    setPage(page - 1)
    setPrev(pages[page - 2]!)
  }, [pages, setPages, page, setPage, setPrev])

  return (
    <div className='w-full flex justify-between items-center'>
      {count !== undefined ? (
        <div className='flex flex-row items-center gap-x-1'>
          <Icon name='equalApproximately' color='foregroundMuted' />
          <Text.H5M color='foregroundMuted'>
            {countLabel?.(count) ?? `${count} rows`}
          </Text.H5M>
        </div>
      ) : (
        <div />
      )}
      <div className='flex items-center'>
        <Button
          size='default'
          variant='ghost'
          disabled={page <= 1}
          iconProps={{ name: 'chevronLeft' }}
          onClick={onPrev}
        />
        <div className='flex flex-row items-center gap-x-1'>
          <Text.H5M color='foregroundMuted'>
            {page}
            {unknown ? '?' : ''}
          </Text.H5M>
        </div>
        <Button
          size='default'
          variant='ghost'
          disabled={!next}
          iconProps={{ name: 'chevronRight' }}
          onClick={onNext}
        />
      </div>
    </div>
  )
}

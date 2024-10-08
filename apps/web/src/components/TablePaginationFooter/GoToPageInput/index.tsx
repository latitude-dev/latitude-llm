'use client'

import { FormEvent, useCallback } from 'react'

import { buildPaginatedUrl } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { Input } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'

export function GoToPageInput({
  page,
  totalPages,
  pageSize,
  baseUrl,
  onPageChange,
}: {
  page: number
  totalPages: number
  pageSize: number
  baseUrl?: string
  onPageChange?: (page: number) => void
}) {
  const router = useNavigate()
  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const targetPage = Number(new FormData(event.currentTarget).get('page'))
    const queryParams = window.location.search

    if (baseUrl) {
      router.push(
        buildPaginatedUrl({
          baseUrl,
          page: targetPage,
          pageSize,
          queryParams,
        }),
      )
    }

    onPageChange?.(targetPage)
  }, [])
  return (
    <form onSubmit={onSubmit}>
      <Input
        hideNativeAppearance
        type='number'
        name='page'
        min={1}
        max={totalPages}
        defaultValue={page}
      />
    </form>
  )
}

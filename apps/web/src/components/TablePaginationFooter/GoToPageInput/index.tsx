'use client'

import { FormEvent, useCallback } from 'react'

import { buildPaginatedUrl } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { Input } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'

export function GoToPageInput({ pagination }: { pagination: IPagination }) {
  const router = useNavigate()
  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const goToPage = new FormData(event.currentTarget).get('page')
    const queryParams = window.location.search
    router.push(
      buildPaginatedUrl({
        baseUrl: pagination.baseUrl,
        page: Number(goToPage),
        pageSize: pagination.pageSize,
        queryParams,
      }),
    )
  }, [])
  return (
    <form onSubmit={onSubmit}>
      <Input
        hideNativeAppearance
        type='number'
        name='page'
        min={1}
        max={pagination.totalPages}
        defaultValue={pagination.page}
      />
    </form>
  )
}

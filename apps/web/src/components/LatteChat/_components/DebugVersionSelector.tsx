'use client'

import { useLatteDebugMode } from '$/hooks/latte'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useMemo } from 'react'

export function LatteDebugVersionSelector() {
  const {
    enabled,
    isLoading,
    data,
    selectedVersionUuid,
    setSelectedVersionUuid,
  } = useLatteDebugMode()

  const options = useMemo<SelectOption<string>[]>(
    () =>
      data.map((v) => ({
        label: v.name,
        value: v.uuid,
        icon: v.isLive ? <DotIndicator variant='success' pulse /> : null,
      })),
    [data],
  )

  if (!enabled) return null

  return (
    <Select
      name='debugVersionUuid'
      loading={isLoading}
      value={selectedVersionUuid}
      options={options}
      onChange={setSelectedVersionUuid}
    />
  )
}

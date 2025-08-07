'use client'

import type { ReactNode } from 'react'
import type { IconName } from '../Icons'
import { SelectItem } from './Primitives'

export type SelectOption<V = unknown> = {
  label: string
  value: V
  icon?: ReactNode | IconName
  description?: string
}

export type SelectOptionGroup<V = unknown> = {
  label: string
  options: SelectOption<V>[]
}
export function Options({ options }: { options: SelectOption[] }) {
  return options.map((option) => (
    <SelectItem
      key={option.label}
      value={String(option.value)}
      icon={option.icon}
      description={option.description}
    >
      {option.label}
    </SelectItem>
  ))
}

'use client'

import { ReactNode } from 'react'
import { IconName } from '../Icons'
import { SelectItem } from './Primitives'

export type SelectOption<V extends unknown = unknown> = {
  label: string
  value: V
  icon?: ReactNode | IconName
  description?: string
}

export type SelectOptionGroup<V extends unknown = unknown> = {
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

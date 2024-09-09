'use client'

import { useCallback, useRef, useState } from 'react'

import { cn, FormFieldGroup, Input, Select } from '@latitude-data/web-ui'

export enum DelimiterEnum {
  Comma = 'comma',
  Semicolon = 'semicolon',
  Tab = 'tab',
  Space = 'space',
  Custom = 'custom',
}

const DELIMITERS = [
  { value: DelimiterEnum.Comma, label: 'Comma (ex.: column1,column2,column3)' },
  {
    value: DelimiterEnum.Semicolon,
    label: 'Semicolon (ex.: column1;column2;column3)',
  },
  {
    value: DelimiterEnum.Tab,
    label: 'Tab (ex.: column1 \\t column2 \\t column3)',
  },
  { value: DelimiterEnum.Space, label: 'Space (ex.: column1 column2 column3)' },
  { value: DelimiterEnum.Custom, label: 'Custom' },
]
export const DELIMITER_KEYS = DELIMITERS.map(({ value }) => value)

export default function DelimiterSelector({
  delimiterInputName,
  customDelimiterInputName,
  delimiterErrors,
  customDelimiterErrors,
  delimiterValue,
  customDelimiterValue,
}: {
  delimiterInputName: string
  delimiterValue: string | undefined
  delimiterErrors: string[] | undefined
  customDelimiterInputName: string
  customDelimiterValue: string
  customDelimiterErrors: string[] | undefined
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isCustom, setIsCustom] = useState(false)
  const onSelectChange = useCallback((value: string) => {
    const custom = value === 'custom'
    setIsCustom(custom)
    setTimeout(() => {
      if (!custom) return
      inputRef.current?.focus()
    }, 0)
  }, [])
  return (
    <FormFieldGroup
      label='CSV header delimiter'
      description='Specify the delimiter used in the first line of the uploaded .csv file.'
    >
      <Select
        name={delimiterInputName}
        options={DELIMITERS}
        defaultValue={delimiterValue}
        onChange={onSelectChange}
        errors={delimiterErrors}
      />
      <Input
        ref={inputRef}
        name={customDelimiterInputName}
        className={cn({ hidden: !isCustom })}
        defaultValue={customDelimiterValue}
        errors={customDelimiterErrors}
        placeholder='Your custom delimiter'
      />
    </FormFieldGroup>
  )
}

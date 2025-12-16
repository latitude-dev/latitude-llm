'use client'
import { useCallback, useRef, useState } from 'react'

import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'

export enum DelimiterEnum {
  Comma = 'comma',
  Semicolon = 'semicolon',
  Tab = 'tab',
  Space = 'space',
  Custom = 'custom',
}

const DELIMITERS = [
  {
    value: DelimiterEnum.Comma,
    label: 'Comma (e.g.: column1,column2,column3)',
  },
  {
    value: DelimiterEnum.Semicolon,
    label: 'Semicolon (e.g.: column1;column2;column3)',
  },
  {
    value: DelimiterEnum.Tab,
    label: 'Tab (e.g.: column1 \\t column2 \\t column3)',
  },
  {
    value: DelimiterEnum.Space,
    label: 'Space (e.g.: column1 column2 column3)',
  },
  { value: DelimiterEnum.Custom, label: 'Custom' },
]
export const DELIMITER_KEYS = DELIMITERS.map(({ value }) => value)

export default function DelimiterSelector({
  delimiterInputName,
  customDelimiterInputName,
  delimiterErrors,
  customDelimiterErrors,
  delimiterDefaultValue,
  customDelimiterValue,
}: {
  delimiterInputName: string
  delimiterDefaultValue?: string | undefined
  delimiterErrors?: string[] | undefined
  customDelimiterInputName: string
  customDelimiterValue?: string
  customDelimiterErrors?: string[] | undefined
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
        defaultValue={delimiterDefaultValue}
        onChange={onSelectChange}
        errors={delimiterErrors}
        width='full'
      />
      {isCustom && (
        <Input
          ref={inputRef}
          name={customDelimiterInputName}
          defaultValue={customDelimiterValue}
          errors={customDelimiterErrors}
          placeholder='Your custom delimiter'
        />
      )}
    </FormFieldGroup>
  )
}

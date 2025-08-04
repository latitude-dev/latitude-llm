import { Text } from '../../atoms/Text'
import { Input } from '../../atoms/Input'
import { Button } from '../../atoms/Button'
import { KeyboardEvent, useCallback, useState } from 'react'
import { Icon, IconName } from '../../atoms/Icons'
import { TextArea } from '../../atoms/TextArea'
import { cn } from '../../../lib/utils'

function InputElement({
  className,
  value,
  icon,
  onClick,
  disabled,
  noWrap,
}: {
  className?: string
  value: string | number
  icon: IconName
  onClick: () => void
  disabled?: boolean
  noWrap?: boolean
}) {
  return (
    <div
      className={cn(
        'flex gap-2 px-2 py-1 justify-center items-center h-fit bg-accent rounded-md border border-border',
        className,
      )}
    >
      <Text.H6M
        color='accentForeground'
        noWrap={noWrap}
        ellipsis={noWrap}
        whiteSpace={noWrap ? 'nowrap' : 'preWrap'}
      >
        {value}
      </Text.H6M>
      <Button
        variant='ghost'
        size='small'
        onClick={onClick}
        disabled={disabled}
        className='p-0'
      >
        <Icon name={icon} size='xnormal' color='accentForeground' />
      </Button>
    </div>
  )
}

export function MultipleInput<
  T extends 'text' | 'number',
  V extends string | number = T extends 'text' ? string : number,
>({
  values,
  setValues,
  type,
  placeholder,
  required,
  label,
  description,
  disabled,
  noWrap,
}: {
  values: V[] | undefined
  setValues: (values: V[]) => void
  type: T
  placeholder?: string
  required?: boolean
  label?: string
  description?: string
  disabled?: boolean
  noWrap?: boolean
}) {
  const [inputValue, setInputValue] = useState<string>('')

  const handleAddValue = useCallback(
    (value: V) => setValues([...(values ?? []), value]),
    [values, setValues],
  )

  const handleRemoveValue = useCallback(
    (index: number) => {
      setValues((values ?? []).filter((_, i) => i !== index))
    },
    [values, setValues],
  )

  const acceptInputValue = useCallback(() => {
    const trimValue = inputValue.trim()
    if (!trimValue.length) return

    const value = type === 'number' ? Number(trimValue) : trimValue
    handleAddValue(value as V)
    setInputValue('')
  }, [inputValue, type, handleAddValue, setInputValue])

  const handleInputKeyDown = useCallback(
    (
      event:
        | KeyboardEvent<HTMLInputElement>
        | KeyboardEvent<HTMLTextAreaElement>,
    ) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        acceptInputValue()
        event.preventDefault()
      }
    },
    [acceptInputValue],
  )

  return (
    <div className='flex flex-col gap-2'>
      {type === 'text' && !noWrap ? (
        <TextArea
          label={label}
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          description={description}
          minRows={1}
          maxRows={5}
          value={inputValue}
          onKeyDown={handleInputKeyDown}
          onChange={(e) => setInputValue(e.target.value)}
          className='resize-none'
        />
      ) : (
        <Input
          label={label}
          disabled={disabled}
          placeholder={placeholder}
          type={type}
          required={required}
          description={description}
          value={inputValue}
          onKeyDown={(event) =>
            handleInputKeyDown(event as KeyboardEvent<HTMLInputElement>)
          }
          onChange={(e) => setInputValue(e.target.value)}
        />
      )}
      <div className='flex flex-wrap gap-2'>
        {values?.map((value, index) => (
          <InputElement
            key={index}
            value={value}
            icon='close'
            onClick={() => handleRemoveValue(index)}
            disabled={disabled}
            noWrap={noWrap}
          />
        ))}
        {inputValue && (
          <InputElement
            value={inputValue}
            icon='checkClean'
            onClick={acceptInputValue}
            noWrap={noWrap}
            className='opacity-50'
          />
        )}
      </div>
    </div>
  )
}

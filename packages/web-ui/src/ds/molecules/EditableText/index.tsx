'use client'

import { ReactNode, useState } from 'react'

import { Button } from '../../atoms/Button'
import { Input } from '../../atoms/Input'

export const EditableText = ({
  value,
  handleChange,
  fallback,
}: {
  value: string
  handleChange: (value?: string) => void
  fallback: (value: string) => ReactNode
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  const handleClick = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    setIsEditing(false)
  }

  return isEditing ? (
    <Input
      size='small'
      defaultValue={inputValue}
      onChange={(ev) => {
        handleChange(ev.target.value)
        setInputValue(ev.target.value)
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      autoFocus
    />
  ) : (
    <Button variant='nope' onClick={handleClick}>
      {fallback(inputValue)}
    </Button>
  )
}

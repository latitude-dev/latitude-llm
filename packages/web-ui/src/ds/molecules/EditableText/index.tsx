import React, { useState } from 'react'

import { Button, Input } from '@latitude-data/web-ui'

export const EditableText = ({
  value,
  handleChange,
  fallback,
}: {
  value: string
  handleChange: (value?: string) => void
  fallback: (value: string) => React.ReactNode
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

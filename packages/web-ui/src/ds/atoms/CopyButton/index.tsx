'use client'

import React from 'react'

import { Button } from '../Button'
import { Icon, IconProps } from '../Icons'
import { useToast } from '../Toast/useToast'

type CopyButtonProps = Omit<IconProps, 'name'> & {
  content: string
}

export function CopyButton({
  content,
  color = 'foregroundMuted',
  ...rest
}: CopyButtonProps) {
  const { toast } = useToast()

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      toast({
        title: 'Copied to clipboard',
        description: 'The code has been copied to your clipboard',
      })
    })
  }

  return (
    <Button onClick={handleCopy} variant='nope' size='small'>
      <Icon name='clipboard' color={color} {...rest} />
    </Button>
  )
}

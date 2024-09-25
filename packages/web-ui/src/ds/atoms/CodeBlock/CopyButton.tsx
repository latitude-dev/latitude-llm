'use client'

import React from 'react'

import { Button } from '../Button'
import { Icon } from '../Icons'
import { useToast } from '../Toast/useToast'

interface CopyButtonProps {
  content: string
}

export function CopyButton({ content }: CopyButtonProps) {
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
    <Button onClick={handleCopy} variant='ghost' size='small'>
      <Icon name='clipboard' />
    </Button>
  )
}

'use client'

import { useState } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'

export function ClientErrorButton() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw new Error('Backoffice client error test')
  }

  return (
    <Button variant='outline' onClick={() => setShouldThrow(true)}>
      Trigger client render error
    </Button>
  )
}

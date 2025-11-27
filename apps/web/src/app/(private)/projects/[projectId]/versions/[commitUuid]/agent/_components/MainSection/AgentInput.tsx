'use client'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { useMetadataParameters } from '$/hooks/useMetadataParameters'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { cn } from '@latitude-data/web-ui/utils'
import { KeyboardEvent, useCallback, useState } from 'react'

function InputField({
  placeholder,
  className,
  large,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string
  className?: string
  large: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        onSubmit()
      }
    },
    [onSubmit],
  )

  return (
    <TextArea
      className={cn(
        'bg-background w-full resize-none text-sm border-none',
        'text-muted-foreground',
        'ring-0 outline-none focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-opacity-0',
        'custom-scrollbar scrollable-indicator',
        className,
      )}
      placeholder={placeholder}
      minRows={1}
      maxRows={large ? 10 : 5}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  )
}

export function AgentInput({
  document,
  runPromptFn,
}: {
  document: DocumentVersion
  runPromptFn: (params: {
    document: DocumentVersion
    parameters: Record<string, unknown>
    userMessage: string
    aiParameters: boolean
  }) => void
}) {
  const { parameters } = useMetadataParameters()

  const [value, setValue] = useState({
    parameters: {} as Record<string, string>,
    userMessage: '',
  })

  const setParameter = useCallback((key: string, value: string) => {
    setValue((prev) => ({
      ...prev,
      parameters: { ...prev.parameters, [key]: value },
    }))
  }, [])

  const setUserMessage = useCallback((value: string) => {
    setValue((prev) => ({
      ...prev,
      userMessage: value,
    }))
  }, [])

  const onSubmit = useCallback(() => {
    runPromptFn({
      document,
      parameters: value.parameters,
      userMessage: value.userMessage,
      aiParameters: false,
    })
  }, [runPromptFn, document, value])

  return (
    <div className='relative'>
      <div
        className={cn(
          'flex flex-col max-w-[500px] w-[500px] border border-border shadow-[0px_2px_28px_0px_rgba(0,0,0,0.05)] min-h-14 justify-center overflow-hidden',
          {
            'rounded-[28px]': parameters.length < 2,
            'rounded-2xl': parameters.length >= 2,
            'pr-10': parameters.length < 2, // For the absolute button on the right
          },
        )}
      >
        {parameters.length ? (
          parameters.map((parameter, i) => (
            <div
              key={i}
              className={cn('flex flex-row items-start gap-2 overflow-hidden', {
                'border-t border-border': i > 0,
              })}
            >
              <div className='pl-3 pt-2'>
                <Badge variant='accent'>{parameter}</Badge>
              </div>
              <InputField
                placeholder='Enter value...'
                className='p-3'
                large={parameters.length === 1}
                value={value.parameters[parameter] ?? ''}
                onChange={(value) => setParameter(parameter, value)}
                onSubmit={onSubmit}
              />
            </div>
          ))
        ) : (
          <div className='flex flex-row items-center gap-4 px-3 py-2'>
            <InputField
              placeholder='Type your message here...'
              large
              value={value.userMessage}
              onChange={setUserMessage}
              onSubmit={onSubmit}
            />
          </div>
        )}
      </div>
      <div
        className={cn('absolute transition-all duration-150', {
          'right-2 bottom-1/2 translate-y-1/2': parameters.length < 2,
          'right-3 bottom-0 translate-y-1/2': parameters.length >= 2,
        })}
      >
        <Button
          variant='default'
          className='rounded-full w-10 h-10'
          iconProps={{
            name: 'arrowUp',
          }}
          onClick={onSubmit}
        />
      </div>
    </div>
  )
}

export function AgentInputSkeleton() {
  return <Skeleton className='w-[500px] h-14 rounded-full' />
}

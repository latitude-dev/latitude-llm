'use client'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { cn } from '@latitude-data/web-ui/utils'
import { KeyboardEvent, useCallback, useMemo, useState } from 'react'
import { RunProps } from '../types'
import { useRefreshPromptMetadata } from '$/hooks/useDocumentValueContext'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ParameterType } from '@latitude-data/constants'
import { FileParameterInput } from '$/components/ParameterInput'

function InputField({
  placeholder,
  className,
  large,
  inputType,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string
  className?: string
  large: boolean
  inputType: ParameterType
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
    },
    [onSubmit],
  )

  if (inputType === ParameterType.File || inputType === ParameterType.Image) {
    return (
      <FileParameterInput
        type={inputType}
        value={value}
        onChange={onChange}
        withBorder={false}
        inputSize='medium'
      />
    )
  }

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
  runPromptFn: (props: RunProps) => void
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  // TODO: At times, the metadata is not set, and parameters never show up. We must review the metadata workflow and remove this, but for now we need it.
  useRefreshPromptMetadata({
    value: document.content,
    document,
    commit,
    project,
    devMode: false,
  })

  const {
    manual: { inputs: parametersObject },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  const parameters = useMemo(
    () => (parametersObject ? Object.keys(parametersObject) : []),
    [parametersObject],
  )

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

  const inputType = useCallback(
    (parameter: string): ParameterType => {
      return parametersObject[parameter]?.metadata.type || ParameterType.Text
    },
    [parametersObject],
  )

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
                inputType={inputType(parameter)}
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
              inputType={ParameterType.Text}
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
          className='rounded-full w-10 h-10 flex items-center justify-center p-0'
          iconProps={{
            name: 'arrowUp',
            size: 'large',
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

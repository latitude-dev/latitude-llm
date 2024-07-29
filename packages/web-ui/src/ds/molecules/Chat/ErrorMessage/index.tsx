import { CompileError, ContentType } from '@latitude-data/compiler'
import { Text } from '$ui/ds/atoms'

import { Message } from '../Message'

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className='flex flex-col gap-2'>
      <Message
        role='Error'
        content={[{ type: ContentType.text, value: error.message }]}
        variant='destructive'
      />
      {error instanceof CompileError && (
        <div className='flex flex-col w-full relative overflow-auto border border-destructive p-4 rounded-lg gap-0'>
          {error
            .toString()
            .split('\n')
            .map((line, index) => (
              <div key={index} className='inline-block leading-none'>
                <Text.Mono color='destructive'>{line}</Text.Mono>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

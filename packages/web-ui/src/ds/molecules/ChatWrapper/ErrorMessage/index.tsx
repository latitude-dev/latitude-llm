import { Alert } from '../../../atoms/Alert'
import { Text } from '../../../atoms/Text'

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className='flex flex-col gap-2'>
      <Alert title='Error' description={error.message} variant='destructive' />
      {error && (
        <div className='flex flex-col w-full relative overflow-auto border border-destructive p-4 rounded-lg gap-0'>
          {error
            .toString()
            .split('\n')
            .map((line, index) => (
              <div key={index} className='inline-block leading-none'>
                <Text.Mono
                  color='destructive'
                  whiteSpace='preWrap'
                  wordBreak='breakAll'
                >
                  {line}
                </Text.Mono>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

import { useConfigureIntegrationAccount } from '$/hooks/useConfigureIntegrationAccount'
import { PipedreamIntegration } from '@latitude-data/core/schema/models/types/Integration'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Image from 'next/image'

export function UnconfiguredIntegration({
  integration,
}: {
  integration: PipedreamIntegration
}) {
  const { isLoading, connectAccount, isUpdating } =
    useConfigureIntegrationAccount({
      integration,
    })

  return (
    <div className='flex flex-row px-4 py-3 gap-3 border border-latte-border bg-latte-background rounded-xl items-center'>
      <Image
        src={integration.configuration.metadata?.imageUrl ?? ''}
        alt={integration.name}
        className='max-w-6 max-h-6'
        width={24}
        height={24}
        unoptimized
      />

      <div className='flex-1'>
        <Text.H5 color='latteOutputForeground'>
          '{integration.name}' integration needs additional configuration
        </Text.H5>
      </div>

      <Button
        fancy
        variant='outline'
        disabled={isLoading}
        onClick={connectAccount}
        isLoading={isUpdating}
      >
        Set up
      </Button>
    </div>
  )
}

import { Button, Icon, toast } from '@latitude-data/web-ui'

export const CopyButton = ({ text }: { text: string }) => (
  <Button
    variant='nope'
    onClick={() => {
      navigator.clipboard.writeText(text)
      toast({
        title: 'Copied to clipboard',
        description: 'The snippet has been copied to your clipboard',
      })
    }}
  >
    <Icon name='clipboard' color='foregroundMuted' />
  </Button>
)

'use client'

import {
  Button,
  CloseTrigger,
  FormWrapper,
  Input,
  Modal,
  TextArea,
  useToast,
} from '@latitude-data/web-ui'
import { useFormAction } from '$/hooks/useFormAction'
import useMcpServers from '$/stores/mcpServers'

type Props = {
  open: boolean
  setOpen: (open: boolean) => void
}

export default function NewMcpServer({ open, setOpen }: Props) {
  const { toast } = useToast()
  const { create, isCreating } = useMcpServers()
  const { action, data } = useFormAction(create, {
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'MCP server created successfully',
      })
      setOpen(false)
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create MCP server',
        variant: 'destructive',
      })
    },
  })

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={setOpen}
      title='Create MCP Server'
      description='MCP Servers allow you to run custom code as part of your prompts.'
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            form='createMcpServerForm'
            type='submit'
            disabled={isCreating}
          >
            {isCreating ? 'Creating...' : 'Create MCP Server'}
          </Button>
        </>
      }
    >
      <form id='createMcpServerForm' action={action}>
        <FormWrapper>
          <Input
            required
            type='text'
            name='name'
            label='Name'
            description='A descriptive name for your MCP server.'
            placeholder='My MCP Server'
            value={data?.name}
          />
          <Input
            required
            type='text'
            name='runCommand'
            label='Run Command'
            description='The command to run your server.'
            placeholder='npm start'
            value={data?.runCommand}
          />
          <TextArea
            name='environmentVariables'
            label='Environment Variables'
            description='Enter environment variables in KEY=VALUE format, one per line or comma-separated (e.g., API_KEY=abc123, SECRET_TOKEN=xyz456).'
            placeholder='API_KEY=abc123
SECRET_TOKEN=xyz456'
            value={data?.environmentVariables}
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}

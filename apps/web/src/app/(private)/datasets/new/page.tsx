'use client'

import {
  Button,
  CloseTrigger,
  DropzoneInput,
  FormWrapper,
  Input,
  Modal,
  // useToast,
} from '@latitude-data/web-ui'
// import { useFormAction } from '$/hooks/useFormAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

// import useProjects from '$/stores/projects'

export default function NewDataset() {
  const data = { name: '' }
  const navigate = useNavigate()
  // const { toast } = useToast()
  // const { create } = useProjects()
  // const { data, action } = useFormAction(create, {
  //   onSuccess: (project) => {
  //     toast({
  //       title: 'Success',
  //       description: `Project "${project.name}" created.`,
  //     })
  //
  //     navigate.push(ROUTES.datasets.root)
  //   },
  // })
  return (
    <Modal
      open
      onOpenChange={(open) => !open && navigate.push(ROUTES.datasets.root)}
      title='Create new dataset'
      description='Datasets allow you to test prompts and evaluations with your own data.'
      footer={
        <>
          <CloseTrigger />
          <Button fancy form='createDatasetForm' type='submit'>
            Create dataset
          </Button>
        </>
      }
    >
      <form className='min-w-0' id='createDatasetForm'>
        <FormWrapper>
          <Input
            required
            type='text'
            label='Name'
            name='name'
            defaultValue={data?.name}
            placeholder='Amazing dataset'
          />
          <DropzoneInput
            label='Upload dataset'
            name='dataset_file'
            placeholder='Upload csv'
            multiple={false}
            accept='.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel'
          />
        </FormWrapper>
      </form>
    </Modal>
  )
}

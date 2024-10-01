'use client'

import { FormEvent } from 'react'

import {
  EvaluationResultableType,
  EvaluationTemplateWithCategory,
} from '@latitude-data/core/browser'
import {
  Button,
  FormField,
  FormWrapper,
  Icon,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWithHeader,
  TabSelector,
  Text,
  TextArea,
} from '@latitude-data/web-ui'
import useEvaluationTemplates from '$/stores/evaluationTemplates'

import { useEvaluationConfiguration } from '../../../(private)/evaluations/_components/CreateEvaluationModal'

export default function AdminPage() {
  const { data: evaluationTemplates } = useEvaluationTemplates()

  return (
    <div className='w-full max-w-[1250px] m-auto px-4 py-8 pt-0 flex flex-col gap-8'>
      <NewEvaluationTemplate />
      <EvaluationTemplatesTable evaluationTemplates={evaluationTemplates} />
    </div>
  )
}

function EvaluationTemplatesTable({
  evaluationTemplates,
}: {
  evaluationTemplates: EvaluationTemplateWithCategory[]
}) {
  const { destroy } = useEvaluationTemplates()
  if (!evaluationTemplates.length) return null

  return (
    <TableWithHeader
      title='Evaluation Templates'
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluationTemplates.map((template) => (
              <TableRow
                key={template.id}
                className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
              >
                <TableCell>
                  <Text.H4 noWrap>{template.name}</Text.H4>
                </TableCell>
                <TableCell>
                  <Text.H4 noWrap>{template.category}</Text.H4>
                </TableCell>
                <TableCell>
                  <div className='flex flex-row gap-1 justify-between items-center'>
                    <div className='flex-auto'>
                      <Text.H4>{template.description}</Text.H4>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Text.H4 noWrap>
                    {JSON.stringify(template.configuration)}
                  </Text.H4>
                </TableCell>
                <TableCell>
                  <Button
                    variant='outline'
                    onClick={() => destroy({ id: template.id })}
                  >
                    <Icon name='trash' />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}

function NewEvaluationTemplate() {
  const { create } = useEvaluationTemplates()

  const handleSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault() // This line prevents the default form submission

    const formData = new FormData(ev.currentTarget)
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const prompt = formData.get('prompt') as string

    create({
      name,
      description,
      prompt,
      configuration,
    })
  }

  const {
    configuration,
    handleTypeChange,
    handleRangeFromChange,
    handleRangeToChange,
  } = useEvaluationConfiguration()

  return (
    <div className='w-full flex flex-col gap-4'>
      <form onSubmit={handleSubmit}>
        <FormWrapper>
          <FormField label='Name'>
            <Input
              required
              name='name'
              placeholder='Enter title'
              className='w-full'
            />
          </FormField>
          <FormField label='Description'>
            <TextArea
              required
              name='description'
              minRows={4}
              maxRows={6}
              placeholder='Describe what is the purpose of this template'
              className='w-full'
            />
          </FormField>
          <FormField label='Prompt'>
            <TextArea
              required
              name='prompt'
              minRows={4}
              maxRows={6}
              placeholder='Write your template prompt'
              className='w-full'
            />
          </FormField>
          <TabSelector
            options={[
              { label: 'Text', value: EvaluationResultableType.Text },
              { label: 'Number', value: EvaluationResultableType.Number },
              { label: 'Boolean', value: EvaluationResultableType.Boolean },
            ]}
            onSelect={handleTypeChange}
            selected={configuration.type}
          />
          {configuration.type === EvaluationResultableType.Number && (
            <FormField label='Range'>
              <div className='flex flex-row items-center flex-1 gap-4'>
                <Input
                  type='number'
                  min={0}
                  value={configuration.detail?.range.from.toString() || ''}
                  placeholder='From'
                  onChange={handleRangeFromChange}
                />
                <Input
                  type='number'
                  min={0}
                  value={configuration.detail?.range.to.toString() || ''}
                  placeholder='To'
                  onChange={handleRangeToChange}
                />
              </div>
            </FormField>
          )}
          <Button type='submit'>Create Template</Button>
        </FormWrapper>
      </form>
    </div>
  )
}

import { useState } from 'react'

import { EvaluationTemplateWithCategory } from '@latitude-data/core/browser'
import {
  Button,
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'

export const TemplateEvaluationsTableRow = ({
  template,
  onSelect,
}: {
  template: EvaluationTemplateWithCategory
  onSelect: () => void
}) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <TableRow
      key={template.id}
      className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border'
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <TableCell>
        <Text.H5 noWrap ellipsis>
          {template.name}
        </Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5 noWrap ellipsis>
          {template.category}
        </Text.H5>
      </TableCell>
      <TableCell>
        <div className='flex flex-row gap-1 justify-between items-center'>
          <div className='flex-auto'>
            <Text.H5>{template.description}</Text.H5>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Button
          className={cn('flex-shrink-0', { 'opacity-0 disabled': !isHovered })}
          variant='ghost'
        >
          <div className='flex flex-row gap-1 items-center truncate'>
            <Text.H5M noWrap ellipsis color='accentForeground'>
              Use this template
            </Text.H5M>
            <Icon name='addCircle' color='accentForeground' />
          </div>
        </Button>
      </TableCell>
    </TableRow>
  )
}

export const TemplateEvaluationsTable = ({
  evaluationTemplates,
  onSelectTemplate,
}: {
  evaluationTemplates: EvaluationTemplateWithCategory[]
  onSelectTemplate: (template: EvaluationTemplateWithCategory) => void
}) => {
  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Description</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluationTemplates.map((template) => (
          <TemplateEvaluationsTableRow
            key={template.id}
            template={template}
            onSelect={() => onSelectTemplate(template)}
          />
        ))}
      </TableBody>
    </Table>
  )
}

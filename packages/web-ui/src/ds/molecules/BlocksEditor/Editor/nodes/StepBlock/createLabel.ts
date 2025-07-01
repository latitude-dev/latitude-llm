import { StepBlockNode } from './index'
import { cn } from '../../../../../../lib/utils'
import { triggerStepNameUpdate } from '../../plugins/StepNameEditPlugin'

function getEditableSpan(header: HTMLElement) {
  return header.getElementsByClassName('editable-step-name')[0]! as HTMLElement
}

function getStepName({ block }: { block: StepBlockNode }): string {
  return block.getLatest().__stepName
}

export function createLabel({ block }: { block: StepBlockNode }) {
  const stepLabel = document.createElement('div')
  const name = getStepName({ block })

  stepLabel.className = cn(
    'step-header text-sm font-bold text-indigo-800 p-2 my-1 mx-4',
    'rounded hover:bg-indigo-100 cursor-text border border-transparent',
    'hover:border-indigo-300 transition-colors',
    'flex items-center gap-x-2',
  )
  stepLabel.contentEditable = 'false'
  stepLabel.setAttribute('data-step-header', 'true')
  stepLabel.setAttribute('spellcheck', 'false')
  const emoji = document.createElement('span')
  emoji.textContent = '📋'
  stepLabel.appendChild(emoji)
  const editableSpan = document.createElement('span')
  editableSpan.className =
    'editable-step-name focus:outline-none focus:shadow-none focus:bg-transparent'
  editableSpan.textContent = name
  stepLabel.appendChild(editableSpan)

  const handleMouseEnter = (e: Event) => {
    e.stopPropagation()

    getEditableSpan(stepLabel).contentEditable = 'true'
  }

  const handleMouseLeave = (e: Event) => {
    e.stopPropagation()
    const input = getEditableSpan(stepLabel)
    input.contentEditable = 'false'

    const newName = input.textContent?.trim()

    if (newName && newName.length !== 0) {
      triggerStepNameUpdate(block.__key, newName)
    }
  }

  stepLabel.addEventListener('mouseenter', handleMouseEnter)
  stepLabel.addEventListener('mouseleave', handleMouseLeave)

  return stepLabel
}

export function onUpdateHeader({
  prevNode,
  currentBlock,
  dom,
}: {
  prevNode: StepBlockNode
  currentBlock: StepBlockNode
  dom: HTMLElement
}) {
  const name = getStepName({ block: currentBlock })
  if (getStepName({ block: prevNode }) === name) return false

  const stepLabel = dom.querySelector('.step-header') as HTMLElement

  if (stepLabel) {
    const input = getEditableSpan(stepLabel)
    input.textContent = name
  }
  return true
}

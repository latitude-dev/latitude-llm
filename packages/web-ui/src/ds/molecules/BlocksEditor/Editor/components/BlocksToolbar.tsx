import React from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  INSERT_MESSAGE_BLOCK_COMMAND,
  INSERT_STEP_BLOCK_COMMAND,
} from '../plugins/BlocksPlugin'
import { MessageRole } from '../nodes/utils'

interface BlocksToolbarProps {
  className?: string
}

export function BlocksToolbar({ className = '' }: BlocksToolbarProps) {
  const [editor] = useLexicalComposerContext()

  const insertMessageBlock = (role: MessageRole) => {
    editor.dispatchCommand(INSERT_MESSAGE_BLOCK_COMMAND, role)
  }

  const insertStepBlock = () => {
    // Generate a short random name like Step_abc123
    const randomId = crypto.randomUUID().slice(0, 8)
    const stepName = `Step_${randomId}`
    editor.dispatchCommand(INSERT_STEP_BLOCK_COMMAND, stepName)
  }

  return (
    <div
      className={`blocks-toolbar flex flex-wrap gap-2 p-3 border-b border-gray-200 bg-gray-50 ${className}`}
    >
      <div className='flex gap-1'>
        <button
          onClick={() => insertMessageBlock('system')}
          className='px-3 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500'
        >
          🔧 System
        </button>
        <button
          onClick={() => insertMessageBlock('user')}
          className='px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
        >
          👤 User
        </button>
        <button
          onClick={() => insertMessageBlock('assistant')}
          className='px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500'
        >
          🤖 Assistant
        </button>
        <button
          onClick={() => insertMessageBlock('developer')}
          className='px-3 py-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-300 rounded hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500'
        >
          👨‍💻 Developer
        </button>
      </div>

      <button
        onClick={insertStepBlock}
        className='px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-300 rounded hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'
      >
        📋 Step
      </button>
    </div>
  )
}

import {
  LatitudeTool,
  LatitudeToolInternalName,
} from '@latitude-data/constants'
import { LatitudeToolDefinition } from '../../../constants'
import { LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { TelemetryContext } from '../../../telemetry'
import { withTelemetryWrapper } from '../telemetryWrapper'
import z from 'zod'

async function todo(): PromisedResult<unknown, LatitudeError> {
  return Result.ok({
    status: 'success',
    message:
      'Successfully updated TODOs. Make sure to follow and update your TODO list as you make progress. Cancel and add new TODO tasks as needed when the user makes a correction or follow-up request.',
  })
}

export default {
  name: LatitudeTool.TODO,
  internalName: LatitudeToolInternalName.TODO,
  method: todo,
  definition: (context?: TelemetryContext) => ({
    description,
    inputSchema: z.object({
      merge: z
        .boolean()
        .describe(
          'Whether to merge the todos with the existing todos. If true, the todos will be merged into the existing todos based on the id field. You can leave unchanged properties undefined. If false, the new todos will replace the existing todos.',
        ),
      todos: z
        .array(
          z.object({
            content: z
              .string()
              .describe('The description/content of the todo item'),
            id: z.string().describe('Unique identifier for the todo item'),
            status: z
              .enum(['pending', 'in_progress', 'completed', 'cancelled'])
              .describe('The current status of the todo item'),
          }),
        )
        .min(2)
        .describe('Array of todo items to write'),
    }),
    execute: async (args, toolCall) =>
      withTelemetryWrapper(todo, {
        toolName: LatitudeTool.TODO,
        context,
        args,
        toolCall,
      }),
  }),
} as LatitudeToolDefinition

const description = `
Use this tool to create and manage a structured task list for your current coding session. This helps track progress, organize complex tasks, and demonstrate thoroughness.

Note: Other than when first creating todos, don't tell the user you're updating todos, just do it.

### When to Use This Tool

Use proactively for:
1. Complex multi-step tasks (3+ distinct steps)
2. Non-trivial tasks requiring careful planning
3. User explicitly requests todo list
4. User provides multiple tasks (numbered/comma-separated)
5. After receiving new instructions - capture requirements as todos (use merge=false to add new ones)
6. After completing tasks - mark complete with merge=true and add follow-ups
7. When starting new tasks - mark as in_progress (ideally only one at a time)

### When NOT to Use

Skip for:
1. Single, straightforward tasks
2. Trivial tasks with no organizational benefit
3. Tasks completable in < 3 trivial steps
4. Purely conversational/informational requests
5. Todo items should NOT include operational actions done in service of higher-level tasks.

NEVER INCLUDE THESE IN TODOS: linting; testing; searching or examining the codebase.

### Examples

<example>
  User: Add dark mode toggle to settings
  Assistant:
    - *Creates todo list:*
      1. Add state management [in_progress]
      2. Implement styles
      3. Create toggle component
      4. Update components
    - [Immediately begins working on todo 1 in the same tool call batch]
<reasoning>
  Multi-step feature with dependencies.
</reasoning>
</example>

<example>
  User: Rename getCwd to getCurrentWorkingDirectory across my project
  Assistant: *Searches codebase, finds 15 instances across 8 files*
  *Creates todo list with specific items for each file that needs updating*

<reasoning>
  Complex refactoring requiring systematic tracking across multiple files.
</reasoning>
</example>

<example>
  User: Implement user registration, product catalog, shopping cart, checkout flow.
  Assistant: *Creates todo list breaking down each feature into specific tasks*

<reasoning>
  Multiple complex features provided as list requiring organized task management.
</reasoning>
</example>

<example>
  User: Optimize my React app - it's rendering slowly.
  Assistant: *Analyzes codebase, identifies issues*
  *Creates todo list: 1) Memoization, 2) Virtualization, 3) Image optimization, 4) Fix state loops, 5) Code splitting*

<reasoning>
  Performance optimization requires multiple steps across different components.
</reasoning>
</example>

### Examples of When NOT to Use the Todo List

<example>
  User: What does git status do?
  Assistant: Shows current state of working directory and staging area...

<reasoning>
  Informational request with no coding task to complete.
</reasoning>
</example>

<example>
  User: Add comment to calculateTotal function.
  Assistant: *Uses edit tool to add comment*

<reasoning>
  Single straightforward task in one location.
</reasoning>
</example>

<example>
  User: Run npm install for me.
  Assistant: *Executes npm install* Command completed successfully...

<reasoning>
  Single command execution with immediate results.
</reasoning>
</example>

### Task States and Management

1. **Task States:**
  - pending: Not yet started
  - in_progress: Currently working on
  - completed: Finished successfully
  - cancelled: No longer needed

2. **Task Management:**
  - Update status in real-time
  - Mark complete IMMEDIATELY after finishing
  - Only ONE task in_progress at a time
  - Complete current tasks before starting new ones

3. **Task Breakdown:**
  - Create specific, actionable items
  - Break complex tasks into manageable steps
  - Use clear, descriptive names

4. **Parallel Todo Writes:**
  - Prefer creating the first todo as in_progress
  - Start working on todos by using tool calls in the same tool call batch as the todo write
  - Batch todo updates with other tool calls for better latency and lower costs for the user

When in doubt, use this tool. Proactive task management demonstrates attentiveness and ensures complete requirements.
`.trim()

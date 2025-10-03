export type TodoToolArgs = {
  merge: boolean
  todos: {
    content: string
    id: string
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  }[]
}

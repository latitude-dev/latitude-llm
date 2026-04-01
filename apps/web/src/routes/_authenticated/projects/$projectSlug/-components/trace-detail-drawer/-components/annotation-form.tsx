import { Button, FormField, Textarea } from "@repo/ui"
import { AnnotationThumbToggle } from "./annotation-thumb-toggle.tsx"
import { IssueSelector } from "./issue-selector.tsx"

export interface AnnotationFormProps {
  projectId: string
  passed: boolean | null
  comment: string
  issueId: string | null
  isLoading: boolean
  onPassedChange: (passed: boolean) => void
  onCommentChange: (comment: string) => void
  onIssueChange: (issueId: string | null) => void
  onConfirm: () => void
  onCancel: () => void
}

export function AnnotationForm({
  projectId,
  passed,
  comment,
  issueId,
  isLoading,
  onPassedChange,
  onCommentChange,
  onIssueChange,
  onConfirm,
  onCancel,
}: AnnotationFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <AnnotationThumbToggle
        passed={passed}
        disabled={isLoading}
        onThumbUp={() => onPassedChange(true)}
        onThumbDown={() => onPassedChange(false)}
      />

      <FormField description="A short description helps the system improve accuracy when matching issues and clustering feedback.">
        <Textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Add a comment..."
          disabled={isLoading}
          rows={3}
        />
      </FormField>

      {passed === false && <IssueSelector projectId={projectId} value={issueId} onChange={onIssueChange} />}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={passed === null || isLoading} isLoading={isLoading} onClick={onConfirm}>
          Save
        </Button>
        <Button variant="ghost" size="sm" disabled={isLoading} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

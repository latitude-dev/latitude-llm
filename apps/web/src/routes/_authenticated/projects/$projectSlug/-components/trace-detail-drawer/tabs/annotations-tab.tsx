import { TraceAnnotationWidget } from "./trace-tab/trace-annotation-widget.tsx"

export function AnnotationsTab({ projectId, traceId }: { readonly projectId: string; readonly traceId: string }) {
  return (
    <div className="flex flex-col gap-4 py-6 px-4 overflow-y-auto flex-1">
      <TraceAnnotationWidget key={traceId} projectId={projectId} traceId={traceId} />
    </div>
  )
}

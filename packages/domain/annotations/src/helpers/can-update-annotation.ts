interface AnnotationUpdateInput {
  readonly draftedAt: Date | string | null
}

export function canUpdateAnnotation(annotation: AnnotationUpdateInput): boolean {
  return annotation.draftedAt !== null
}

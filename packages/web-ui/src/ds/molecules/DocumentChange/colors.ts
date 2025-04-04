import { ModifiedDocumentType } from '@latitude-data/core/browser'
import { IconName } from '../../atoms/Icons'
import { TextColor } from '../../tokens'

export const MODIFICATION_ICONS: Record<ModifiedDocumentType, IconName> = {
  [ModifiedDocumentType.Created]: 'addSquare',
  [ModifiedDocumentType.Updated]: 'modification',
  [ModifiedDocumentType.UpdatedPath]: 'squareArrowRight',
  [ModifiedDocumentType.Deleted]: 'deletion',
}
export const MODIFICATION_COLORS: Record<ModifiedDocumentType, TextColor> = {
  [ModifiedDocumentType.Created]: 'success',
  [ModifiedDocumentType.Updated]: 'accentForeground',
  [ModifiedDocumentType.UpdatedPath]: 'accentForeground',
  [ModifiedDocumentType.Deleted]: 'destructive',
}
export const MODIFICATION_BACKGROUNDS: Record<ModifiedDocumentType, string> = {
  [ModifiedDocumentType.Created]: 'bg-success/10',
  [ModifiedDocumentType.Updated]: 'bg-accent-foreground/10',
  [ModifiedDocumentType.UpdatedPath]: 'bg-accent-foreground/10',
  [ModifiedDocumentType.Deleted]: 'bg-destructive/10',
}

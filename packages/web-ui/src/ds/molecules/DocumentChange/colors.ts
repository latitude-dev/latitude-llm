import { ModifiedDocumentType } from '@latitude-data/core/constants'
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
  [ModifiedDocumentType.Updated]: 'bg-accent-foreground/5',
  [ModifiedDocumentType.UpdatedPath]: 'bg-accent-foreground/5',
  [ModifiedDocumentType.Deleted]: 'bg-destructive/10',
}

export const MODIFICATION_BACKGROUNDS_HOVER: Record<
  ModifiedDocumentType,
  string
> = {
  [ModifiedDocumentType.Created]: 'hover:bg-success/10',
  [ModifiedDocumentType.Updated]: 'hover:bg-accent-foreground/5',
  [ModifiedDocumentType.UpdatedPath]: 'hover:bg-accent-foreground/5',
  [ModifiedDocumentType.Deleted]: 'hover:bg-destructive/10',
}

export const MODIFICATION_LABELS: Record<ModifiedDocumentType, string> = {
  [ModifiedDocumentType.Created]: 'Created',
  [ModifiedDocumentType.Updated]: 'Updated',
  [ModifiedDocumentType.UpdatedPath]: 'Updated path',
  [ModifiedDocumentType.Deleted]: 'Deleted',
}

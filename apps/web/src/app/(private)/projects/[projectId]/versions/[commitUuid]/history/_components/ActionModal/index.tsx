import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentChange } from '@latitude-data/web-ui/molecules/DocumentChange'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { useCurrentCommit } from '@latitude-data/web-ui/providers'
import { DiffViewer } from '@latitude-data/web-ui/molecules/DiffViewer'
import { DocumentChangeSkeleton } from '@latitude-data/web-ui/molecules/DocumentChange'
import {
  createContext,
  useState,
  useContext,
  ReactNode,
  Dispatch,
  SetStateAction,
  useMemo,
  useEffect,
  useCallback,
} from 'react'
import {
  ModifiedDocumentType,
  DraftChange,
} from '@latitude-data/core/constants'

interface HistoryActionModalContextProps {
  isOpen: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  title: string
  open: (_: { title: string; onConfirm: () => void }) => void
  error: string | undefined
  setError: Dispatch<SetStateAction<string | undefined>>
  changes: DraftChange[] | undefined
  setChanges: Dispatch<SetStateAction<DraftChange[] | undefined>>
  onConfirm: undefined | (() => void)
  setOnConfirm: Dispatch<SetStateAction<undefined | (() => void)>>
}

const HistoryActionModalContext = createContext<HistoryActionModalContextProps>(
  {
    isOpen: false,
    setOpen: () => {},
    title: '',
    open: () => {},
    error: undefined,
    setError: () => {},
    changes: undefined,
    setChanges: () => {},
    onConfirm: undefined,
    setOnConfirm: () => {},
  },
)

export function HistoryActionModalProvider({
  children,
}: {
  children: ReactNode
}) {
  const [isOpen, setOpen] = useState(false)
  const [title, setTitle] = useState<string>('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [onConfirm, setOnConfirm] = useState<undefined | (() => void)>(
    undefined,
  )
  const [changes, setChanges] = useState<DraftChange[] | undefined>(undefined)

  const open = useCallback(
    ({ title, onConfirm }: { title: string; onConfirm: () => void }) => {
      setChanges(undefined)
      setError(undefined)
      setTitle(title)
      setOnConfirm(() => onConfirm)
      setOpen(true)
    },
    [],
  )

  return (
    <HistoryActionModalContext.Provider
      value={{
        setOpen,
        isOpen,
        title,
        open,
        error,
        setError,
        changes,
        setChanges,
        onConfirm,
        setOnConfirm,
      }}
    >
      {children}
    </HistoryActionModalContext.Provider>
  )
}

export const useHistoryActionModalContext = () =>
  useContext(HistoryActionModalContext)

const getChangeType = (change: DraftChange): ModifiedDocumentType => {
  if (!change.content.newValue) return ModifiedDocumentType.Deleted
  if (!change.content.oldValue) return ModifiedDocumentType.Created
  if (change.newDocumentPath !== change.oldDocumentPath) {
    return ModifiedDocumentType.UpdatedPath
  }
  return ModifiedDocumentType.Updated
}

export function HistoryActionModal() {
  const { isOpen, setOpen, title, error, changes, onConfirm, setOnConfirm } =
    useHistoryActionModalContext()
  const { commit } = useCurrentCommit()

  const [isConfirming, setIsConfirming] = useState(false)

  const [selectedChange, setSelectedChange] = useState<
    DraftChange | undefined
  >()
  useEffect(() => {
    setSelectedChange(changes?.[0])
  }, [changes])

  useEffect(() => {
    if (isOpen) {
      setIsConfirming(false)
    } else {
      setOnConfirm(undefined)
    }
  }, [isOpen, setOnConfirm])

  const confirmChanges = useCallback(async () => {
    if (isConfirming || !!error || !onConfirm) return
    setIsConfirming(true)
    onConfirm()
  }, [isConfirming, error, onConfirm])

  const isLoading = useMemo(() => !changes && !error, [changes, error])

  return (
    <Modal
      open={isOpen}
      onOpenChange={setOpen}
      title={title}
      description={`The following changes will be applied to ${commit.mergedAt ? 'a new draft version' : 'the current draft'}`}
      size='large'
      dismissible
      footer={
        <div className='flex flex-row w-full justify-end gap-2'>
          <Button
            variant='outline'
            fancy
            onClick={() => setOpen(false)}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button
            variant='default'
            fancy
            disabled={isLoading || !!error || !onConfirm}
            isLoading={isConfirming}
            onClick={confirmChanges}
          >
            Confirm
          </Button>
        </div>
      }
    >
      <div className='flex flex-col w-full gap-2'>
        <div className='flex flex-row w-full gap-2'>
          <div className='flex flex-col w-full'>
            {isLoading ? (
              <ul>
                <li>
                  <DocumentChangeSkeleton
                    width={62}
                    changeType={ModifiedDocumentType.Deleted}
                  />
                  <DocumentChangeSkeleton
                    width={87}
                    changeType={ModifiedDocumentType.Updated}
                  />
                  <DocumentChangeSkeleton
                    width={23}
                    changeType={ModifiedDocumentType.Created}
                  />
                  <DocumentChangeSkeleton
                    width={67}
                    changeType={ModifiedDocumentType.Updated}
                  />
                </li>
              </ul>
            ) : (
              changes?.map((change, i) => {
                return (
                  <DocumentChange
                    key={i}
                    path={change.newDocumentPath}
                    oldPath={
                      change.newDocumentPath == change.oldDocumentPath
                        ? undefined
                        : change.oldDocumentPath
                    }
                    changeType={getChangeType(change)}
                    isSelected={selectedChange === change}
                    onClick={() => setSelectedChange(change)}
                  />
                )
              })
            )}
          </div>
          <div className='flex w-full min-h-[400px]'>
            {selectedChange ? (
              <DiffViewer {...selectedChange.content} />
            ) : (
              <div className='w-full h-full rounded-md bg-secondary' />
            )}
          </div>
        </div>
        {error && (
          <Alert variant='destructive' title='Error' description={error} />
        )}
      </div>
    </Modal>
  )
}

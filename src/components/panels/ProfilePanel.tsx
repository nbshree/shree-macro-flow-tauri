import { useEffect, useRef } from 'react'
import { Download, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MacroController } from '@/hooks/useMacroController'

type ProfilePanelProps = {
  controller: MacroController
}

export function ProfilePanel({ controller }: ProfilePanelProps) {
  const {
    cancelRenameProfile,
    createProfile,
    isEditingLocked,
    isRenamingProfile,
    profileNameInput,
    profileNameInputRef,
    removeActiveProfile,
    renameActiveProfile,
    setIsRenamingProfile,
    setProfileNameInput,
    state,
    updateState
  } = controller
  const isComposingProfileNameRef = useRef(false)
  const deleteCancelButtonRef = useRef<HTMLButtonElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreRenameFocusRef = useRef(false)
  const activeProfileName =
    state.profiles.find((profile) => profile.id === state.activeProfileId)?.name ?? '当前方案'

  useEffect(() => {
    if (isRenamingProfile || !shouldRestoreRenameFocusRef.current) return

    shouldRestoreRenameFocusRef.current = false
    renameButtonRef.current?.focus()
  }, [isRenamingProfile])

  return (
    <section className="ui-panel sidebar-panel" aria-labelledby="profile-panel-title">
      <div className="ui-panel__heading">
        <h2 id="profile-panel-title">
          <FolderOpen aria-hidden="true" size={17} />
          方案
        </h2>
        <span className="ui-panel__count">{state.profiles.length} 个</span>
      </div>

      <div className="profile-picker">
        {isRenamingProfile ? (
          <Input
            aria-label="方案名称"
            disabled={isEditingLocked}
            placeholder="输入方案名称"
            ref={profileNameInputRef}
            value={profileNameInput}
            onBlur={() => {
              isComposingProfileNameRef.current = false
              renameActiveProfile()
            }}
            onChange={(event) => setProfileNameInput(event.target.value)}
            onCompositionEnd={() => {
              isComposingProfileNameRef.current = false
            }}
            onCompositionStart={() => {
              isComposingProfileNameRef.current = true
            }}
            onKeyDown={(event) => {
              const isComposing =
                isComposingProfileNameRef.current ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              if (isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                shouldRestoreRenameFocusRef.current = true
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                shouldRestoreRenameFocusRef.current = true
                cancelRenameProfile()
              }
            }}
          />
        ) : (
          <Select
            disabled={isEditingLocked || state.profiles.length === 0}
            value={state.activeProfileId}
            onValueChange={(profileId) => {
              if (!profileId || profileId === state.activeProfileId) return
              setIsRenamingProfile(false)
              void updateState(window.api.switchProfile(profileId))
            }}
          >
            <SelectTrigger aria-label="当前方案" className="min-w-0">
              <SelectValue placeholder="暂无方案" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {state.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={isRenamingProfile ? '保存方案名称' : '重命名方案'}
              disabled={isEditingLocked || !state.activeProfileId}
              ref={renameButtonRef}
              size="icon"
              type="button"
              variant="outline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (isComposingProfileNameRef.current) return
                if (isRenamingProfile) {
                  shouldRestoreRenameFocusRef.current = true
                  renameActiveProfile()
                } else {
                  setIsRenamingProfile(true)
                }
              }}
            >
              <Pencil aria-hidden="true" size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {isRenamingProfile ? '保存方案名称' : '重命名方案'}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="profile-actions">
        <Button disabled={isEditingLocked} type="button" variant="outline" onClick={createProfile}>
          <Plus aria-hidden="true" size={15} />
          新建
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="text-destructive hover:text-destructive"
              disabled={isEditingLocked || !state.activeProfileId || state.profiles.length <= 1}
              type="button"
              variant="outline"
            >
              <Trash2 aria-hidden="true" size={15} />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent
            size="sm"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              deleteCancelButtonRef.current?.focus()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>删除方案？</AlertDialogTitle>
              <AlertDialogDescription>
                确定删除方案“{activeProfileName}”吗？此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={deleteCancelButtonRef}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={isEditingLocked || !state.activeProfileId || state.profiles.length <= 1}
                variant="destructive"
                onClick={removeActiveProfile}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          disabled={isEditingLocked}
          type="button"
          variant="outline"
          onClick={() => void updateState(window.api.importProfile())}
        >
          <Upload aria-hidden="true" size={15} />
          导入
        </Button>
        <Button
          disabled={isEditingLocked || !state.activeProfileId}
          type="button"
          variant="outline"
          onClick={() => void updateState(window.api.exportProfile(state.activeProfileId))}
        >
          <Download aria-hidden="true" size={15} />
          导出
        </Button>
      </div>
    </section>
  )
}

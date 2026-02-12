import { useState, useCallback, useEffect } from 'react'
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'up-to-date'
  | 'error'

interface UpdateInfo {
  version: string
  body: string
}

interface UseUpdaterOptions {
  /** 是否在挂载时自动检查更新，默认 true */
  autoCheck?: boolean
}

interface UseUpdaterReturn {
  status: UpdateStatus
  error: string | null
  updateInfo: UpdateInfo | null
  check: () => Promise<void>
  install: () => Promise<void>
}

export function useUpdater(options: UseUpdaterOptions = {}): UseUpdaterReturn {
  const { autoCheck = true } = options
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  const check = useCallback(async () => {
    try {
      setStatus('checking')
      setError(null)

      const { shouldUpdate, manifest } = await checkUpdate()

      if (shouldUpdate && manifest) {
        setUpdateInfo({
          version: manifest.version,
          body: manifest.body,
        })
        setStatus('available')
      } else {
        setStatus('up-to-date')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  const install = useCallback(async () => {
    try {
      setStatus('downloading')
      await installUpdate()
      setStatus('installing')
      await relaunch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  // 自动检查更新
  useEffect(() => {
    if (autoCheck) {
      check()
    }
  }, [autoCheck, check])

  return { status, error, updateInfo, check, install }
}

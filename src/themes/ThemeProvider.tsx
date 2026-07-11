import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

import './themes.css'

import { getThemeDefinition, normalizeAppearance } from './registry'
import type {
  AppearanceInput,
  AppearancePreferences,
  ThemeAssetKey,
  ThemeAssetStatusMap,
  ThemeDefinition
} from './types'

type ThemeContextValue = {
  appearance: AppearancePreferences
  activeAppearance: AppearancePreferences
  previewAppearance: AppearancePreferences | null
  theme: ThemeDefinition
  assetStatus: ThemeAssetStatusMap
  setPreviewAppearance: (appearance: AppearanceInput | null) => void
  resetPreviewAppearance: () => void
}

export type ThemeProviderProps = {
  appearance?: AppearanceInput | null
  children: ReactNode
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getThemeAssetEntries(theme: ThemeDefinition): Array<[ThemeAssetKey, string]> {
  const entries = Object.entries(theme.assets).filter((entry) => Boolean(entry[1])) as Array<
    [ThemeAssetKey, string]
  >

  if (theme.preview) entries.push(['preview', theme.preview])

  return entries
}

function useThemeAssetPreloader(theme: ThemeDefinition): ThemeAssetStatusMap {
  const [assetStatus, setAssetStatus] = useState<ThemeAssetStatusMap>({})

  useEffect(() => {
    const entries = getThemeAssetEntries(theme)
    const initialStatus = Object.fromEntries(
      entries.map(([key]) => [key, 'loading'])
    ) as ThemeAssetStatusMap

    setAssetStatus(initialStatus)

    if (typeof Image === 'undefined') return

    let disposed = false

    for (const [key, source] of entries) {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => {
        if (!disposed) {
          setAssetStatus((current) => ({ ...current, [key]: 'loaded' }))
        }
      }
      image.onerror = () => {
        if (!disposed) {
          setAssetStatus((current) => ({ ...current, [key]: 'error' }))
        }
      }
      image.src = source
    }

    return () => {
      disposed = true
    }
  }, [theme])

  return assetStatus
}

export function ThemeProvider({ appearance, children }: ThemeProviderProps) {
  const normalizedAppearance = useMemo(
    () => normalizeAppearance(appearance),
    [appearance?.cleanMode, appearance?.themeId]
  )
  const [previewAppearance, setPreviewState] = useState<AppearancePreferences | null>(null)
  const activeAppearance = previewAppearance ?? normalizedAppearance
  const theme = getThemeDefinition(activeAppearance.themeId)
  const assetStatus = useThemeAssetPreloader(theme)

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const previousTheme = root.dataset.theme
    const previousCleanMode = root.dataset.cleanMode

    root.dataset.theme = activeAppearance.themeId
    root.dataset.cleanMode = String(activeAppearance.cleanMode)

    return () => {
      if (previousTheme === undefined) delete root.dataset.theme
      else root.dataset.theme = previousTheme

      if (previousCleanMode === undefined) delete root.dataset.cleanMode
      else root.dataset.cleanMode = previousCleanMode
    }
  }, [activeAppearance.cleanMode, activeAppearance.themeId])

  const setPreviewAppearance = useCallback((nextAppearance: AppearanceInput | null) => {
    setPreviewState(nextAppearance ? normalizeAppearance(nextAppearance) : null)
  }, [])

  const resetPreviewAppearance = useCallback(() => {
    setPreviewState(null)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance: normalizedAppearance,
      activeAppearance,
      previewAppearance,
      theme,
      assetStatus,
      setPreviewAppearance,
      resetPreviewAppearance
    }),
    [
      activeAppearance,
      assetStatus,
      normalizedAppearance,
      previewAppearance,
      resetPreviewAppearance,
      setPreviewAppearance,
      theme
    ]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用')
  }

  return context
}

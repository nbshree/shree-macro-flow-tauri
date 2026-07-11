import { useCallback, useEffect, useState } from 'react'

import { useTheme, type ThemeAssetKey } from '../../themes'

export type ThemeBackgroundProps = {
  className?: string
  onAssetError?: (asset: ThemeAssetKey, source: string) => void
}

type ThemeLayerProps = {
  asset: ThemeAssetKey
  source?: string
  className: string
  loadState?: 'idle' | 'loading' | 'loaded' | 'error'
  failed: boolean
  onError: (asset: ThemeAssetKey, source: string) => void
}

function ThemeLayer({ asset, source, className, loadState, failed, onError }: ThemeLayerProps) {
  if (!source || failed || loadState === 'error') return null

  return (
    <img
      alt=""
      aria-hidden="true"
      className={`theme-background__layer ${className}`}
      data-asset={asset}
      data-asset-state={loadState ?? 'loading'}
      draggable={false}
      src={source}
      onError={() => onError(asset, source)}
    />
  )
}

export function ThemeBackground({ className, onAssetError }: ThemeBackgroundProps) {
  const { activeAppearance, assetStatus, theme } = useTheme()
  const [failedAssets, setFailedAssets] = useState<Set<ThemeAssetKey>>(() => new Set())

  useEffect(() => {
    setFailedAssets(new Set())
  }, [theme.id])

  const handleAssetError = useCallback(
    (asset: ThemeAssetKey, source: string) => {
      setFailedAssets((current) => {
        if (current.has(asset)) return current

        const next = new Set(current)
        next.add(asset)
        return next
      })
      onAssetError?.(asset, source)
    },
    [onAssetError]
  )

  const rootClassName = ['theme-background', className].filter(Boolean).join(' ')

  return (
    <div
      aria-hidden="true"
      className={rootClassName}
      data-clean-mode={String(activeAppearance.cleanMode)}
      data-theme-id={theme.id}
    >
      <ThemeLayer
        asset="background"
        className="theme-background__background"
        failed={failedAssets.has('background')}
        loadState={assetStatus.background}
        source={theme.assets.background}
        onError={handleAssetError}
      />
      <ThemeLayer
        asset="texture"
        className="theme-background__texture"
        failed={failedAssets.has('texture')}
        loadState={assetStatus.texture}
        source={theme.assets.texture}
        onError={handleAssetError}
      />
      <ThemeLayer
        asset="character"
        className="theme-background__character"
        failed={failedAssets.has('character')}
        loadState={assetStatus.character}
        source={theme.assets.character}
        onError={handleAssetError}
      />
      <ThemeLayer
        asset="cornerTopRight"
        className="theme-background__corner theme-background__corner--top-right"
        failed={failedAssets.has('cornerTopRight')}
        loadState={assetStatus.cornerTopRight}
        source={theme.assets.cornerTopRight}
        onError={handleAssetError}
      />
      <ThemeLayer
        asset="cornerBottomLeft"
        className="theme-background__corner theme-background__corner--bottom-left"
        failed={failedAssets.has('cornerBottomLeft')}
        loadState={assetStatus.cornerBottomLeft}
        source={theme.assets.cornerBottomLeft}
        onError={handleAssetError}
      />
    </div>
  )
}

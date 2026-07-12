import { useState } from 'react'

import { useTheme } from '../../themes'

type ThemeLogCharacterAssetProps = {
  source: string
}

function ThemeLogCharacterAsset({ source }: ThemeLogCharacterAssetProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (failed) return null

  return (
    <div aria-hidden="true" className="theme-log-character">
      <img
        alt=""
        aria-hidden="true"
        className="theme-log-character__image"
        data-asset="logCharacter"
        data-asset-state={loaded ? 'loaded' : 'loading'}
        decoding="async"
        draggable={false}
        height={384}
        src={source}
        width={384}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export function ThemeLogCharacter() {
  const { activeAppearance, assetStatus, theme } = useTheme()
  const source = theme.assets.logCharacter

  if (activeAppearance.cleanMode || !source || assetStatus.logCharacter === 'error') return null

  return <ThemeLogCharacterAsset key={source} source={source} />
}

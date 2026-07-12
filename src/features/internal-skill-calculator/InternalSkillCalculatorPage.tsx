import {
  Award,
  CircleHelp,
  Eraser,
  Eye,
  EyeOff,
  Gauge,
  Info,
  KeyRound,
  Link2,
  LoaderCircle,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Trophy
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  macroApi,
  type InternalSkillRecognitionResult,
  type MacroAPI,
  type MysteryCodeStatus
} from '@/lib/macro-api'

import {
  baseStatDefinitions,
  calculateInternalSkill,
  calculatorRuleMeta,
  cycleDefinitions,
  defaultCalculatorInput,
  skillDefinitions,
  type BaseStatId,
  type CalculatorInput,
  type ContributionCategory,
  type CycleId,
  type SkillId
} from './domain'
import internalSkillPanelExample from './assets/internal-skill-panel-example.webp'

import './InternalSkillCalculatorPage.css'

const scoreFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const contributionCategoryLabels: Record<ContributionCategory, string> = {
  'base-stat': '基础词条',
  spirit: '灵',
  trait: '特性',
  cycle: '周天'
}

const cloneCalculatorInput = (input: CalculatorInput): CalculatorInput => ({
  baseStats: { ...input.baseStats },
  skills: Object.fromEntries(
    skillDefinitions.map((definition) => [definition.id, { ...input.skills[definition.id] }])
  ) as CalculatorInput['skills'],
  cycleId: input.cycleId
})

const createEmptyInput = (): CalculatorInput => {
  const input = cloneCalculatorInput(defaultCalculatorInput)

  for (const definition of baseStatDefinitions) {
    input.baseStats[definition.id] = 0
  }

  for (const definition of skillDefinitions) {
    input.skills[definition.id] = {
      equipped: false,
      spirit: false
    }
  }

  input.cycleId = cycleDefinitions.find((definition) => definition.score === 0)?.id ?? 'metalFire'
  return input
}

const formatScore = (score: number) =>
  scoreFormatter.format(Math.round((score + Number.EPSILON * 100) * 100) / 100)

const formatSignedScore = (score: number) => {
  if (score === 0) {
    return '0.00'
  }

  return `${score > 0 ? '+' : ''}${formatScore(score)}`
}

type PanelHeadingProps = {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
}

function PanelHeading({ id, icon, title, description, children }: PanelHeadingProps) {
  return (
    <header className="calculator-panel__header">
      <div className="calculator-panel__title">
        <span className="calculator-panel__icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children ? <div className="calculator-panel__meta">{children}</div> : null}
    </header>
  )
}

const MAX_CLIPBOARD_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_RECOGNITION_IMAGE_DIMENSION = 2048
const RECOGNITION_WEBP_QUALITY = 0.86
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('无法读取剪贴板图片。'))
    reader.onerror = () => reject(new Error('无法读取剪贴板图片。'))
    reader.readAsDataURL(file)
  })

const optimizeImageToDataUrl = async (file: File) => {
  if (typeof createImageBitmap !== 'function') return fileToDataUrl(file)

  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(
      1,
      MAX_RECOGNITION_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return fileToDataUrl(file)

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const optimized = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', RECOGNITION_WEBP_QUALITY)
    )
    if (!optimized || (scale === 1 && optimized.size >= file.size)) return fileToDataUrl(file)
    return fileToDataUrl(new File([optimized], 'recognition.webp', { type: 'image/webp' }))
  } catch {
    return fileToDataUrl(file)
  } finally {
    bitmap?.close()
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || '操作失败，请重试。')

type InternalSkillCalculatorPageProps = {
  active?: boolean
  api?: Pick<
    MacroAPI,
    | 'getMysteryCodeStatus'
    | 'saveAndValidateMysteryCode'
    | 'deleteMysteryCode'
    | 'recognizeInternalSkillImage'
  >
}

export function InternalSkillCalculatorPage({
  active = false,
  api = macroApi
}: InternalSkillCalculatorPageProps) {
  const [calculatorInput, setCalculatorInput] = useState<CalculatorInput>(createEmptyInput)
  const [credentialStatus, setCredentialStatus] = useState<MysteryCodeStatus>({
    configured: false,
    lastFour: null
  })
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false)
  const [mysteryCodeDraft, setMysteryCodeDraft] = useState('')
  const [showMysteryCode, setShowMysteryCode] = useState(false)
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [credentialError, setCredentialError] = useState('')
  const [recognitionLoading, setRecognitionLoading] = useState(false)
  const [recognitionMessage, setRecognitionMessage] = useState('')
  const recognitionInFlightRef = useRef(false)
  const result = useMemo(() => calculateInternalSkill(calculatorInput), [calculatorInput])
  const equippedCount = skillDefinitions.reduce(
    (count, definition) => count + Number(calculatorInput.skills[definition.id].equipped),
    0
  )
  const spiritCount = skillDefinitions.reduce(
    (count, definition) => count + Number(calculatorInput.skills[definition.id].spirit),
    0
  )
  const selectedCycle =
    cycleDefinitions.find((definition) => definition.id === calculatorInput.cycleId) ??
    cycleDefinitions[0]
  const hasEvaluationInput =
    baseStatDefinitions.some((definition) => calculatorInput.baseStats[definition.id] !== 0) ||
    skillDefinitions.some((definition) => {
      const skillInput = calculatorInput.skills[definition.id]
      return skillInput.equipped || skillInput.spirit
    })
  const hasDraftInput =
    hasEvaluationInput || calculatorInput.cycleId !== defaultCalculatorInput.cycleId
  const skillScores = useMemo(() => {
    const scores = new Map<string, number>()

    for (const contribution of result.contributions) {
      if (
        contribution.active &&
        (contribution.category === 'spirit' || contribution.category === 'trait')
      ) {
        const currentScore = scores.get(contribution.sourceId) ?? 0
        scores.set(contribution.sourceId, currentScore + contribution.score)
      }
    }

    return scores
  }, [result.contributions])
  const rankedContributions = useMemo(
    () =>
      result.contributions
        .filter((contribution) => contribution.active && contribution.score !== 0)
        .sort((left, right) => right.score - left.score),
    [result.contributions]
  )

  const updateBaseStat = (id: BaseStatId, value: number) => {
    setCalculatorInput((current) => ({
      ...current,
      baseStats: {
        ...current.baseStats,
        [id]: Number.isFinite(value) ? Math.max(0, value) : 0
      }
    }))
  }

  const updateSkill = (id: SkillId, field: 'equipped' | 'spirit', checked: boolean) => {
    setCalculatorInput((current) => ({
      ...current,
      skills: {
        ...current.skills,
        [id]: {
          ...current.skills[id],
          [field]: checked
        }
      }
    }))
  }

  const clearAll = () => setCalculatorInput(createEmptyInput())

  useEffect(() => {
    if (!active) return

    let cancelled = false
    void api
      .getMysteryCodeStatus()
      .then((status) => {
        if (!cancelled) setCredentialStatus(status)
      })
      .catch((error: unknown) => {
        if (!cancelled) setRecognitionMessage(errorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [active, api])

  const applyRecognition = (recognition: InternalSkillRecognitionResult) => {
    const equipped = new Set(recognition.equippedSkillIds)
    setCalculatorInput((current) => ({
      baseStats: { ...recognition.baseStats },
      skills: Object.fromEntries(
        skillDefinitions.map((definition) => [
          definition.id,
          {
            equipped: equipped.has(definition.id),
            spirit: current.skills[definition.id].spirit
          }
        ])
      ) as CalculatorInput['skills'],
      cycleId: current.cycleId
    }))
  }

  useEffect(() => {
    if (!active || credentialDialogOpen) return

    const handlePaste = (event: ClipboardEvent) => {
      if (recognitionInFlightRef.current) return
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(
        (item) => item.kind === 'file' && SUPPORTED_IMAGE_TYPES.has(item.type)
      )
      if (!imageItem) return

      event.preventDefault()
      setRecognitionMessage('')
      if (!credentialStatus.configured) {
        setCredentialError('请先配置有效的神秘代码。')
        setCredentialDialogOpen(true)
        return
      }

      const image = imageItem.getAsFile()
      if (!image) {
        setRecognitionMessage('无法读取剪贴板图片，请重新复制截图。')
        return
      }
      if (image.size > MAX_CLIPBOARD_IMAGE_BYTES) {
        setRecognitionMessage('图片不能超过 20 MB。')
        return
      }

      recognitionInFlightRef.current = true
      setRecognitionLoading(true)
      void optimizeImageToDataUrl(image)
        .then((imageDataUrl) => api.recognizeInternalSkillImage(imageDataUrl))
        .then((recognition) => {
          applyRecognition(recognition)
          setRecognitionMessage(
            `识别完成：已回填 ${recognition.equippedSkillIds.length} 个内功，灵状态保持不变。灵韵和周天组合需要手动配置。`
          )
        })
        .catch((error: unknown) => setRecognitionMessage(errorMessage(error)))
        .finally(() => {
          recognitionInFlightRef.current = false
          setRecognitionLoading(false)
        })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [active, api, credentialDialogOpen, credentialStatus.configured])

  const openCredentialDialog = () => {
    setMysteryCodeDraft('')
    setCredentialError('')
    setShowMysteryCode(false)
    setCredentialDialogOpen(true)
  }

  const saveCredential = async () => {
    if (!mysteryCodeDraft.trim()) {
      setCredentialError('请输入神秘代码。')
      return
    }
    setCredentialBusy(true)
    setCredentialError('')
    try {
      const status = await api.saveAndValidateMysteryCode(mysteryCodeDraft)
      setCredentialStatus(status)
      setMysteryCodeDraft('')
      setCredentialDialogOpen(false)
      setRecognitionMessage('神秘代码和 GPT-5.6 Terra 识别服务验证成功并已保存。')
    } catch (error) {
      setCredentialError(errorMessage(error))
    } finally {
      setCredentialBusy(false)
    }
  }

  const deleteCredential = async () => {
    setCredentialBusy(true)
    setCredentialError('')
    try {
      const status = await api.deleteMysteryCode()
      setCredentialStatus(status)
      setMysteryCodeDraft('')
      setRecognitionMessage('已删除神秘代码。')
    } catch (error) {
      setCredentialError(errorMessage(error))
    } finally {
      setCredentialBusy(false)
    }
  }

  return (
    <div className="internal-skill-calculator" aria-busy={recognitionLoading}>
      <div className="calculator-toolbar">
        <div className="calculator-rule-summary">
          <div className="calculator-rule-badges">
            <Badge variant="outline">
              <Info aria-hidden="true" />
              规则 {calculatorRuleMeta.version}
            </Badge>
          </div>
          <div className="calculator-rule-copy">
            <strong>{calculatorRuleMeta.title}</strong>
            <span>
              制表：{calculatorRuleMeta.author} · 公式来源：
              {calculatorRuleMeta.formulaSource}
            </span>
          </div>
        </div>
        <div className="calculator-toolbar__actions">
          <div className="calculator-paste-hint">
            <span className="calculator-paste-hint__copy">
              复制内功面板截图，按 <kbd>Ctrl+V</kbd> 即可计算
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="calculator-paste-hint__help"
                  aria-label="查看截图示例"
                >
                  <span>截图示例</span>
                  <CircleHelp aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                className="calculator-paste-example"
                side="bottom"
                align="end"
                collisionPadding={12}
              >
                <strong>截图示例</strong>
                <span>复制包含属性和内功图标的完整面板</span>
                <img
                  src={internalSkillPanelExample}
                  alt="包含属性和内功图标的完整内功面板示例"
                />
              </TooltipContent>
            </Tooltip>
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label="AI 配置"
            onClick={openCredentialDialog}
          >
            <KeyRound aria-hidden="true" />
            AI 配置
            <span
              className="calculator-ai-status"
              data-configured={credentialStatus.configured}
              aria-hidden="true"
              title={credentialStatus.configured ? '神秘代码已配置' : '神秘代码未配置'}
            />
          </Button>
          <Button type="button" variant="outline" disabled={!hasDraftInput} onClick={clearAll}>
            <Eraser aria-hidden="true" />
            清空全部
          </Button>
        </div>
      </div>

      {recognitionMessage ? (
        <Alert className="calculator-recognition-message" role="status">
          <Info aria-hidden="true" />
          <AlertTitle>AI 图片识别</AlertTitle>
          <AlertDescription>{recognitionMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="calculator-layout">
        <section className="calculator-panel calculator-base-panel" aria-labelledby="base-title">
          <PanelHeading
            id="base-title"
            icon={<SlidersHorizontal />}
            title="基础词条"
            description="输入面板显示的原始数值"
          />
          <div className="calculator-panel__body">
            <Alert className="calculator-percent-alert">
              <CircleHelp aria-hidden="true" />
              <AlertTitle>百分比输入方式</AlertTitle>
              <AlertDescription>
                <p id="calculator-percent-help">4.7% 请直接输入 4.7，不要输入 0.047。</p>
              </AlertDescription>
            </Alert>

            <div className="calculator-stat-grid">
              {baseStatDefinitions.map((definition) => {
                const inputId = `calculator-stat-${definition.id}`
                const isPercent = definition.unit === 'percent'

                return (
                  <label className="calculator-stat-field" htmlFor={inputId} key={definition.id}>
                    <span>{definition.label}</span>
                    <div className="calculator-number-field">
                      <Input
                        id={inputId}
                        type="number"
                        min="0"
                        step={isPercent ? '0.1' : '1'}
                        inputMode="decimal"
                        value={calculatorInput.baseStats[definition.id]}
                        aria-describedby={isPercent ? 'calculator-percent-help' : undefined}
                        onChange={(event) =>
                          updateBaseStat(definition.id, event.currentTarget.valueAsNumber)
                        }
                      />
                      {isPercent ? <span aria-hidden="true">%</span> : null}
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="calculator-cycle-field">
              <div className="calculator-cycle-field__heading">
                <div>
                  <span id="calculator-cycle-label">周天组合</span>
                  <small>周天收益计入特性分</small>
                </div>
                <Badge variant="secondary">
                  {selectedCycle.score === 0
                    ? '不加分'
                    : `${formatSignedScore(selectedCycle.score)} 分`}
                </Badge>
              </div>
              <Select
                value={calculatorInput.cycleId}
                onValueChange={(value) =>
                  setCalculatorInput((current) => ({
                    ...current,
                    cycleId: value as CycleId
                  }))
                }
              >
                <SelectTrigger aria-labelledby="calculator-cycle-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cycleDefinitions.map((definition) => (
                    <SelectItem value={definition.id} key={definition.id}>
                      {definition.label}（{formatSignedScore(definition.score)} 分）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section
          className="calculator-panel calculator-skills-panel"
          aria-labelledby="skills-title"
        >
          <PanelHeading
            id="skills-title"
            icon={<Sparkles />}
            title="内功配置"
            description="携带、灵与当前贡献同列呈现"
          >
            <Badge variant="outline">携带 {equippedCount} / 15</Badge>
            <Badge variant="secondary">灵 {spiritCount}</Badge>
          </PanelHeading>
          <div className="calculator-skill-table" role="table" aria-label="内功携带与灵配置">
            <div className="calculator-skill-head" role="row">
              <span role="columnheader">内功</span>
              <span role="columnheader">携带</span>
              <span role="columnheader">灵</span>
              <span role="columnheader">贡献</span>
            </div>
            {equippedCount === 0 && spiritCount === 0 ? (
              <Alert className="calculator-empty-selection">
                <CircleHelp aria-hidden="true" />
                <AlertTitle>尚未选择内功</AlertTitle>
                <AlertDescription>打开任一“携带”或“灵”开关即可开始计算。</AlertDescription>
              </Alert>
            ) : null}
            <ul className="calculator-skill-list" role="rowgroup">
              {skillDefinitions.map((definition, index) => {
                const skillInput = calculatorInput.skills[definition.id]
                const contribution = skillScores.get(definition.id) ?? 0
                const equippedId = `calculator-${definition.id}-equipped`
                const equippedLabelId = `${equippedId}-label`
                const spiritId = `calculator-${definition.id}-spirit`
                const spiritLabelId = `${spiritId}-label`

                return (
                  <li
                    className="calculator-skill-row"
                    data-active={skillInput.equipped || skillInput.spirit}
                    key={definition.id}
                    role="row"
                  >
                    <div className="calculator-skill-name" role="rowheader">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{definition.label}</strong>
                    </div>
                    <div className="calculator-switch-cell" role="cell">
                      <Switch
                        id={equippedId}
                        size="sm"
                        checked={skillInput.equipped}
                        aria-labelledby={equippedLabelId}
                        onCheckedChange={(checked) =>
                          updateSkill(definition.id, 'equipped', checked)
                        }
                      />
                      <label
                        className="calculator-switch-hit-area"
                        id={equippedLabelId}
                        htmlFor={equippedId}
                      >
                        <span>携带{definition.label}</span>
                      </label>
                    </div>
                    <div className="calculator-switch-cell" role="cell">
                      <Switch
                        id={spiritId}
                        size="sm"
                        checked={skillInput.spirit}
                        aria-labelledby={spiritLabelId}
                        onCheckedChange={(checked) => updateSkill(definition.id, 'spirit', checked)}
                      />
                      <label
                        className="calculator-switch-hit-area"
                        id={spiritLabelId}
                        htmlFor={spiritId}
                      >
                        <span>{definition.label}灵</span>
                      </label>
                    </div>
                    <output
                      className="calculator-skill-score"
                      data-zero={contribution === 0}
                      aria-label={`${definition.label}当前贡献${formatScore(contribution)}分`}
                      role="cell"
                    >
                      {formatSignedScore(contribution)}
                    </output>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        <aside
          className="calculator-panel calculator-results-panel"
          aria-labelledby="results-title"
        >
          <PanelHeading
            id="results-title"
            icon={<Gauge />}
            title="结果摘要"
            description="随输入实时更新"
          />
          <div className="calculator-panel__body calculator-results-body">
            {hasEvaluationInput ? (
              <>
                <section className="calculator-score-hero" aria-label="综合评分">
                  <span>综合评分</span>
                  <strong aria-live="polite">{formatScore(result.totalScore)}</strong>
                  <Badge className="calculator-tier-badge" variant="outline">
                    <Award aria-hidden="true" />
                    {result.tier.label}
                  </Badge>
                  {result.nextTier ? (
                    <p>
                      <TrendingUp aria-hidden="true" />
                      距离“{result.nextTier.label}”还差
                      <strong>{formatScore(result.nextTier.scoreNeeded)}</strong> 分
                    </p>
                  ) : (
                    <p>
                      <Trophy aria-hidden="true" />
                      已达到当前规则最高档位
                    </p>
                  )}
                </section>

                <dl className="calculator-score-breakdown">
                  <div>
                    <dt>词条分</dt>
                    <dd>{formatScore(result.attributeScore)}</dd>
                  </div>
                  <div>
                    <dt>特性分</dt>
                    <dd>{formatScore(result.traitScore)}</dd>
                  </div>
                </dl>

                <section className="calculator-result-section" aria-labelledby="ranking-title">
                  <div className="calculator-result-section__heading">
                    <h3 id="ranking-title">贡献排行</h3>
                    <Badge variant="outline">非零 {rankedContributions.length} 项</Badge>
                  </div>
                  {rankedContributions.length > 0 ? (
                    <ol className="calculator-ranking-list">
                      {rankedContributions.slice(0, 6).map((contribution, index) => (
                        <li key={contribution.id}>
                          <span className="calculator-ranking-index">{index + 1}</span>
                          <span className="calculator-ranking-copy">
                            <strong>{contribution.label}</strong>
                            <small>{contributionCategoryLabels[contribution.category]}</small>
                          </span>
                          <output>{formatSignedScore(contribution.score)}</output>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="calculator-ranking-empty">
                      <CircleHelp aria-hidden="true" />
                      <div>
                        <strong>暂无非零贡献</strong>
                        <span>填写词条或选择内功后，这里会显示贡献排行。</span>
                      </div>
                    </div>
                  )}
                </section>

                <Alert className="calculator-synergy-alert">
                  <Link2 aria-hidden="true" />
                  <AlertTitle>联动说明</AlertTitle>
                  <AlertDescription>
                    <ul>
                      {result.synergyNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <div className="calculator-results-empty" role="status">
                <Gauge aria-hidden="true" />
                <strong>填写属性或选择内功后查看评估结果</strong>
                <span>基础词条或携带/灵任一项发生变化后，将在此实时显示。</span>
              </div>
            )}

            <Alert className="calculator-source-alert">
              <Info aria-hidden="true" />
              <AlertTitle>规则与署名</AlertTitle>
              <AlertDescription>
                <p>
                  制表：{calculatorRuleMeta.author}；公式来源：
                  {calculatorRuleMeta.formulaSource}。当前按 {calculatorRuleMeta.version}{' '}
                  版规则计算。
                </p>
              </AlertDescription>
            </Alert>
          </div>
        </aside>
      </div>

      {recognitionLoading ? (
        <div className="calculator-recognition-overlay" role="status" aria-live="assertive">
          <LoaderCircle aria-hidden="true" />
          <strong>正在识别中</strong>
          <span>正在读取属性并匹配内功图标，请稍候…</span>
        </div>
      ) : null}

      <Dialog
        open={credentialDialogOpen}
        onOpenChange={(open) => {
          if (!credentialBusy) setCredentialDialogOpen(open)
        }}
      >
        <DialogContent className="calculator-ai-dialog">
          <DialogHeader>
            <DialogTitle>AI 图片识别配置</DialogTitle>
            <DialogDescription>
              输入神秘代码并验证。配置后，在内功评估页按 Ctrl+V 粘贴截图即可识别。
            </DialogDescription>
          </DialogHeader>

          <div className="calculator-ai-dialog__body">
            <div className="calculator-ai-connection">
              <span
                className="calculator-ai-status"
                data-configured={credentialStatus.configured}
                aria-hidden="true"
              />
              <div>
                <strong>{credentialStatus.configured ? '已配置' : '尚未配置'}</strong>
                <span>
                  {credentialStatus.configured && credentialStatus.lastFour
                    ? `当前神秘代码尾号 ${credentialStatus.lastFour}`
                    : '使用 GPT-5.6 Terra 图片理解模型'}
                </span>
              </div>
            </div>

            <div className="calculator-ai-key-field">
              <Label htmlFor="mystery-code">神秘代码</Label>
              <div>
                <Input
                  id="mystery-code"
                  type={showMysteryCode ? 'text' : 'password'}
                  value={mysteryCodeDraft}
                  disabled={credentialBusy}
                  autoComplete="off"
                  placeholder={
                    credentialStatus.configured ? '输入新神秘代码以替换' : '请输入神秘代码'
                  }
                  onChange={(event) => setMysteryCodeDraft(event.currentTarget.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={credentialBusy}
                  aria-label={showMysteryCode ? '隐藏神秘代码' : '显示神秘代码'}
                  onClick={() => setShowMysteryCode((current) => !current)}
                >
                  {showMysteryCode ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
              <small>保存前会验证神秘代码，并调用一次 GPT-5.6 Terra 检查识别服务是否可用。</small>
            </div>

            {credentialError ? (
              <Alert variant="destructive" role="alert">
                <Info aria-hidden="true" />
                <AlertTitle>配置失败</AlertTitle>
                <AlertDescription>{credentialError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            {credentialStatus.configured ? (
              <Button
                type="button"
                variant="destructive"
                disabled={credentialBusy}
                onClick={() => void deleteCredential()}
              >
                删除神秘代码
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={credentialBusy || !mysteryCodeDraft.trim()}
              onClick={() => void saveCredential()}
            >
              {credentialBusy ? (
                <LoaderCircle className="calculator-spinner" aria-hidden="true" />
              ) : null}
              保存并验证
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

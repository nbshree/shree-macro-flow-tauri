import {
  BarChart3,
  Castle,
  Eraser,
  Info,
  RefreshCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Swords,
  TriangleAlert
} from 'lucide-react'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

import {
  calculateTowerDemolition,
  createEmptyTowerCalculatorInput,
  defaultTowerCalculatorInput,
  towerCalculatorRuleMeta,
  towerDefenseStatDefinitions,
  towerNormalSkillDefinitions,
  towerOffenseStatDefinitions,
  towerProfessionDefinitions,
  towerRareSkillDefinitions,
  wuyunDefinitions,
  type TowerBuildInput,
  type TowerBuildResult,
  type TowerCalculatorInput,
  type TowerDefenseStatId,
  type TowerOffenseStatId,
  type TowerProfessionId,
  type TowerSelectableSkillId,
  type TowerSkillSlotInput,
  type WuyunDefinition,
  type WuyunInput,
  type WuyunResult,
  type WuyunSkillId,
  type WuyunValueId
} from './domain'

import './TowerDemolitionCalculatorPage.css'

type BuildIndex = 0 | 1
type SkillSlotKind = 'rareSkills' | 'normalSkills'
type CycleKey = keyof TowerBuildInput['cycles']

type DefinitionView<Id extends string> = {
  id: Id
  label: string
}

type StatDefinitionView<Id extends string> = DefinitionView<Id> & {
  unit?: 'flat' | 'percent' | string
  description?: string
}

const professions = towerProfessionDefinitions as readonly DefinitionView<TowerProfessionId>[]
const rareSkills =
  towerRareSkillDefinitions as unknown as readonly DefinitionView<TowerSelectableSkillId>[]
const normalSkills =
  towerNormalSkillDefinitions as unknown as readonly DefinitionView<TowerSelectableSkillId>[]
const offenseStats =
  towerOffenseStatDefinitions as readonly StatDefinitionView<TowerOffenseStatId>[]
const defenseStats =
  towerDefenseStatDefinitions as readonly StatDefinitionView<TowerDefenseStatId>[]
const wuyunRules = wuyunDefinitions as readonly WuyunDefinition[]

const cycleFields: readonly { key: CycleKey; label: string; suffix: string }[] = [
  { key: 'metal', label: '金周天', suffix: '金' },
  { key: 'fire', label: '火周天', suffix: '火' },
  { key: 'wood', label: '木周天', suffix: '木' },
  { key: 'earth', label: '土周天', suffix: '土' }
]

const buildLabels = ['第一套', '第二套'] as const
const buildAffectingWuyunIssueKeys = new Set(['wuyun-value-xunYingIncrease'])

const scoreFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0
})

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
})

const cloneInput = (input: TowerCalculatorInput): TowerCalculatorInput =>
  JSON.parse(JSON.stringify(input)) as TowerCalculatorInput

const getRuleMeta = () => {
  const meta = towerCalculatorRuleMeta as unknown as Record<string, unknown>
  return {
    version: typeof meta.version === 'string' ? meta.version : '4.1.1.3',
    title: typeof meta.title === 'string' ? meta.title : '4.1.1.3 进攻团拆塔内功计算器',
    source:
      typeof meta.formulaSource === 'string'
        ? meta.formulaSource
        : '拆塔内功计算器4.1.1.3（最终版）.xlsx'
  }
}

const ruleMeta = getRuleMeta()

const isPercentDefinition = (definition: StatDefinitionView<string>) =>
  definition.unit === 'percent' || definition.unit === '%'

const formatScore = (value: number) =>
  Number.isFinite(value) ? scoreFormatter.format(Math.round(value)) : '—'

const formatSignedScore = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${scoreFormatter.format(rounded)}`
}

type ValidationIssue = {
  key: string
  message: string
}

const validateInput = (input: TowerCalculatorInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const validateNonNegative = (key: string, label: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) {
      issues.push({ key, message: `${label}必须是有限的非负数。` })
    }
  }

  if (!Number.isFinite(input.battleDurationSeconds) || input.battleDurationSeconds <= 0) {
    issues.push({ key: 'battleDurationSeconds', message: '战斗时长必须大于 0 秒。' })
  }
  validateNonNegative('morale', '局内士气', input.morale)

  if (!Number.isFinite(input.offenseWeight) || input.offenseWeight < 0 || input.offenseWeight > 1) {
    issues.push({ key: 'offenseWeight', message: '输出权重必须在 0% 到 100% 之间。' })
  }
  if (
    !Number.isFinite(input.defenseWeight) ||
    input.defenseWeight < 0 ||
    input.defenseWeight >= 1
  ) {
    issues.push({ key: 'defenseWeight', message: '坦度权重必须在 0% 到小于 100% 之间。' })
  }
  if (
    Number.isFinite(input.offenseWeight) &&
    Number.isFinite(input.defenseWeight) &&
    Math.abs(input.offenseWeight + input.defenseWeight - 1) > 0.000_001
  ) {
    issues.push({ key: 'weights', message: '输出与坦度权重之和必须为 100%。' })
  }

  input.builds.forEach((build, buildIndex) => {
    const prefix = `build-${buildIndex}`
    offenseStats.forEach((definition) =>
      validateNonNegative(
        `${prefix}-offense-${definition.id}`,
        `${buildLabels[buildIndex]}${definition.label}`,
        build.offenseStats[definition.id]
      )
    )
    defenseStats.forEach((definition) =>
      validateNonNegative(
        `${prefix}-defense-${definition.id}`,
        `${buildLabels[buildIndex]}${definition.label}`,
        build.defenseStats[definition.id]
      )
    )
  })

  wuyunRules.forEach((definition) => {
    definition.valueFields.forEach((field) => {
      const value = input.wuyun.values[field.id]
      const key = `wuyun-value-${field.id}`
      const valueLabel = `${definition.label}${field.label}`
      if (!Number.isFinite(value) || value < 0) {
        issues.push({ key, message: `${valueLabel}必须是有限的非负数。` })
        return
      }
      if (field.minValue !== null && value < field.minValue) {
        const minimum = percentFormatter.format(field.minValue * 100)
        issues.push({
          key,
          message: `${valueLabel}不能低于 ${minimum}%。`
        })
      }
      if (field.maxValue !== null && value > field.maxValue) {
        const maximum = percentFormatter.format(field.maxValue * 100)
        issues.push({
          key,
          message: `${valueLabel}不能高于 ${maximum}%。`
        })
      }
    })
  })

  validateNonNegative('wuyun-consumed-points', '消耗武蕴点', input.wuyun.consumedPoints)

  return issues
}

type PanelHeadingProps = {
  id: string
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}

function PanelHeading({ id, icon, title, description, children }: PanelHeadingProps) {
  return (
    <header className="tower-panel__heading">
      <div className="tower-panel__title">
        <span className="tower-panel__icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </header>
  )
}

type NumberFieldProps = {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  description?: string
  percent?: boolean
  min?: number
  max?: number
  integer?: boolean
  error?: string
}

function NumberField({
  id,
  label,
  value,
  onChange,
  description,
  percent = false,
  min = 0,
  max,
  integer = false,
  error
}: NumberFieldProps) {
  const displayValue = Number.isFinite(value) ? value * (percent ? 100 : 1) : ''
  const errorId = `${id}-error`

  return (
    <div className="tower-field">
      <Label htmlFor={id}>
        <span>{label}</span>
        {description ? <small aria-hidden="true">{description}</small> : null}
      </Label>
      <div className="tower-field__control">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={integer ? 1 : percent ? 0.1 : 1}
          value={displayValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            const nextValue = event.currentTarget.valueAsNumber
            onChange(percent && Number.isFinite(nextValue) ? nextValue / 100 : nextValue)
          }}
        />
        {percent ? <span aria-hidden="true">%</span> : null}
      </div>
      {error ? (
        <p className="tower-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

const componentScoreDefinitions = [
  { key: 'dynamicSkillScore', label: '内功' },
  { key: 'cycleScore', label: '周天' },
  { key: 'offenseStatScore', label: '输出词条' },
  { key: 'defenseStatScore', label: '坦度词条' },
  { key: 'spiritScore', label: '灵韵' }
] as const satisfies readonly { key: keyof TowerBuildResult; label: string }[]

type ResultSummaryProps = {
  builds: readonly [TowerBuildResult, TowerBuildResult]
}

function ResultSummary({ builds }: ResultSummaryProps) {
  const differences = {
    anti: builds[0].antiDemolitionScore - builds[1].antiDemolitionScore,
    unopposed: builds[0].unopposedScore - builds[1].unopposedScore
  }

  const maxComponentScore = Math.max(
    1,
    ...builds.flatMap((build) =>
      componentScoreDefinitions.map((definition) => Math.abs(Number(build[definition.key]) || 0))
    )
  )

  return (
    <section className="tower-panel" aria-labelledby="tower-results-title" aria-live="polite">
      <PanelHeading
        id="tower-results-title"
        icon={<BarChart3 />}
        title="双套评分对比"
        description="抗拆包含折算后的坦度词条；空拆不计坦度词条分"
      >
        <Badge variant="outline">实时计算</Badge>
      </PanelHeading>

      <div className="tower-summary-grid">
        {builds.map((build, index) => (
          <article
            className="tower-summary-card"
            data-build={index === 0 ? 'one' : 'two'}
            aria-label={`${buildLabels[index]}评分`}
            key={buildLabels[index]}
          >
            <header className="tower-summary-card__heading">
              <h3>{buildLabels[index]}</h3>
              <span>{index === 0 ? '五项分数组成' : '原表兼容汇总'}</span>
            </header>
            <div className="tower-score-grid">
              <div className="tower-score" aria-label={`${buildLabels[index]}抗拆总分`}>
                <span>抗拆总分</span>
                <div className="tower-score__value">
                  <strong>{formatScore(build.antiDemolitionScore)}</strong>
                  <small>{build.antiDemolitionRating}</small>
                </div>
              </div>
              <div className="tower-score" aria-label={`${buildLabels[index]}空拆总分`}>
                <span>空拆总分</span>
                <div className="tower-score__value">
                  <strong>{formatScore(build.unopposedScore)}</strong>
                  <small>{build.unopposedRating}</small>
                </div>
              </div>
            </div>
            <dl className="tower-composition">
              {componentScoreDefinitions.map((definition) => (
                <div key={definition.key}>
                  <dt>{definition.label}</dt>
                  <dd>{formatScore(Number(build[definition.key]))}</dd>
                </div>
              ))}
            </dl>
            <div className="tower-range-copy" aria-label={`${buildLabels[index]}原表区间说明`}>
              <strong>原表区间说明</strong>
              <dl>
                <div>
                  <dt>抗拆</dt>
                  <dd>{build.antiDemolitionRatingDetail.visibleDescription}</dd>
                </div>
                <div>
                  <dt>空拆</dt>
                  <dd>{build.unopposedRatingDetail.visibleDescription}</dd>
                </div>
              </dl>
            </div>
            {index === 1 ? (
              <p className="tower-summary-card__compatibility">
                兼容原表：顶部周天分与坦度分沿用第一套计算结果。
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="tower-difference" aria-label="第一套减第二套分差">
        <span>
          抗拆分差<strong>{formatSignedScore(differences.anti)}</strong>
        </span>
        <span>
          空拆分差<strong>{formatSignedScore(differences.unopposed)}</strong>
        </span>
      </div>

      <figure className="tower-chart" aria-labelledby="tower-chart-title">
        <figcaption id="tower-chart-title">
          词条收益对比图
          <span>上行为第一套，下行为第二套；负周天按绝对长度显示</span>
        </figcaption>
        <div className="tower-chart__rows">
          {componentScoreDefinitions.map((definition) => {
            const firstValue = Number(builds[0][definition.key]) || 0
            const secondValue = Number(builds[1][definition.key]) || 0
            return (
              <div className="tower-chart__row" key={definition.key}>
                <span className="tower-chart__label">{definition.label}</span>
                <div className="tower-chart__bars" aria-hidden="true">
                  {[firstValue, secondValue].map((value, index) => (
                    <span className="tower-chart__track" key={`${definition.key}-${index}`}>
                      <span
                        className="tower-chart__bar"
                        data-build={index === 0 ? 'one' : 'two'}
                        data-negative={value < 0}
                        style={
                          {
                            '--tower-bar-width': `${(Math.abs(value) / maxComponentScore) * 100}%`
                          } as CSSProperties
                        }
                      />
                    </span>
                  ))}
                </div>
                <span className="tower-chart__values">
                  <span>{formatScore(firstValue)}</span>
                  <span>{formatScore(secondValue)}</span>
                </span>
              </div>
            )
          })}
        </div>
      </figure>
    </section>
  )
}

type SkillSlotRowProps = {
  buildLabel: string
  kindLabel: string
  index: number
  slot: TowerSkillSlotInput
  definitions: readonly DefinitionView<TowerSelectableSkillId>[]
  onChange: (slot: TowerSkillSlotInput) => void
}

function SkillSlotRow({
  buildLabel,
  kindLabel,
  index,
  slot,
  definitions,
  onChange
}: SkillSlotRowProps) {
  const slotLabel = `${kindLabel} ${index + 1}`
  const selectLabelId = `${buildLabel}-${kindLabel}-${index}-label`

  return (
    <div className="tower-slot-row">
      <span id={selectLabelId}>{slotLabel}</span>
      <Select
        value={slot.skillId ?? 'none'}
        onValueChange={(value) =>
          onChange({
            ...slot,
            skillId: value === 'none' ? null : (value as TowerSelectableSkillId),
            spirit: value === 'none' ? false : slot.spirit
          })
        }
      >
        <SelectTrigger size="compact" aria-labelledby={selectLabelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">不装备</SelectItem>
          {definitions.map((definition) => (
            <SelectItem value={definition.id} key={definition.id}>
              {definition.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="tower-spirit-toggle">
        <span>灵韵</span>
        <Switch
          checked={slot.spirit}
          disabled={slot.skillId === null}
          aria-label={`${buildLabel}${slotLabel}灵韵`}
          onCheckedChange={(checked) => onChange({ ...slot, spirit: checked })}
        />
      </label>
    </div>
  )
}

type BuildEditorProps = {
  index: BuildIndex
  build: TowerBuildInput
  issues: ReadonlyMap<string, string>
  onChange: (build: TowerBuildInput) => void
}

function BuildEditor({ index, build, issues, onChange }: BuildEditorProps) {
  const label = buildLabels[index]
  const updateSlot = (kind: SkillSlotKind, slotIndex: number, slot: TowerSkillSlotInput) => {
    const slots = build[kind].map((current, currentIndex) =>
      currentIndex === slotIndex ? slot : current
    )
    onChange({ ...build, [kind]: slots })
  }

  const updateOffenseStat = (id: TowerOffenseStatId, value: number) => {
    onChange({
      ...build,
      offenseStats: { ...build.offenseStats, [id]: value }
    })
  }

  const updateDefenseStat = (id: TowerDefenseStatId, value: number) => {
    onChange({
      ...build,
      defenseStats: { ...build.defenseStats, [id]: value }
    })
  }

  return (
    <article className="tower-build" data-build={index === 0 ? 'one' : 'two'}>
      <header className="tower-build__heading">
        <div className="tower-build__title">
          <span className="tower-build__icon" aria-hidden="true">
            {index === 0 ? <Swords /> : <Shield />}
          </span>
          <div>
            <h2>{label}配置</h2>
            <p>
              {index === 0
                ? '周天、内功和完整词条均可与另一套独立填写'
                : '输入可独立填写；顶部周天与坦度汇总仍沿用第一套'}
            </p>
          </div>
        </div>
        <Badge variant="secondary">{index + 1}</Badge>
      </header>

      <div className="tower-build__body">
        <section className="tower-section" aria-labelledby={`tower-build-${index}-cycles`}>
          <header className="tower-section-heading">
            <div>
              <h3 id={`tower-build-${index}-cycles`}>周天组合</h3>
              <p>允许两套使用不同组合；2 木沿用原表负分公式</p>
            </div>
          </header>
          <div className="tower-cycle-grid">
            {cycleFields.map((field) => {
              const labelId = `tower-build-${index}-cycle-${field.key}`
              return (
                <div className="tower-field" key={field.key}>
                  <span className="tower-field__label" id={labelId}>
                    {field.label}
                  </span>
                  <Select
                    value={String(build.cycles[field.key])}
                    onValueChange={(value) =>
                      onChange({
                        ...build,
                        cycles: {
                          ...build.cycles,
                          [field.key]: Number(value) as TowerBuildInput['cycles'][CycleKey]
                        }
                      })
                    }
                  >
                    <SelectTrigger size="compact" aria-labelledby={labelId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3].map((level) => (
                        <SelectItem value={String(level)} key={level}>
                          {level === 0 ? '无' : `${level}${field.suffix}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        </section>

        <section className="tower-section" aria-labelledby={`tower-build-${index}-skills`}>
          <header className="tower-section-heading">
            <div>
              <h3 id={`tower-build-${index}-skills`}>内功搭配</h3>
              <p>3 个稀有槽与 4 个普通槽；允许空槽、重复和独立灵韵</p>
            </div>
          </header>
          <div className="tower-slot-list">
            {build.rareSkills.map((slot, slotIndex) => (
              <SkillSlotRow
                buildLabel={label}
                kindLabel="稀有"
                index={slotIndex}
                slot={slot}
                definitions={rareSkills}
                onChange={(nextSlot) => updateSlot('rareSkills', slotIndex, nextSlot)}
                key={`rare-${slotIndex}`}
              />
            ))}
            {build.normalSkills.map((slot, slotIndex) => (
              <SkillSlotRow
                buildLabel={label}
                kindLabel="普通"
                index={slotIndex}
                slot={slot}
                definitions={normalSkills}
                onChange={(nextSlot) => updateSlot('normalSkills', slotIndex, nextSlot)}
                key={`normal-${slotIndex}`}
              />
            ))}
          </div>
        </section>

        <section className="tower-section" aria-labelledby={`tower-build-${index}-offense`}>
          <header className="tower-section-heading">
            <div>
              <h3 id={`tower-build-${index}-offense`}>输出词条</h3>
              <p>百分比按百分号前数值填写，例如 1.2% 输入 1.2</p>
            </div>
          </header>
          <div className="tower-stat-grid">
            {offenseStats.map((definition) => {
              const key = `build-${index}-offense-${definition.id}`
              return (
                <NumberField
                  id={`tower-${key}`}
                  label={`${label}${definition.label}`}
                  description={definition.description}
                  value={build.offenseStats[definition.id]}
                  percent={isPercentDefinition(definition)}
                  error={issues.get(key)}
                  onChange={(value) => updateOffenseStat(definition.id, value)}
                  key={definition.id}
                />
              )
            })}
          </div>
        </section>

        <section className="tower-section" aria-labelledby={`tower-build-${index}-defense`}>
          <header className="tower-section-heading">
            <div>
              <h3 id={`tower-build-${index}-defense`}>坦度词条</h3>
              <p>坦度按输出收益折算，仅计入抗拆总分</p>
            </div>
          </header>
          <div className="tower-stat-grid">
            {defenseStats.map((definition) => {
              const key = `build-${index}-defense-${definition.id}`
              return (
                <NumberField
                  id={`tower-${key}`}
                  label={`${label}${definition.label}`}
                  description={definition.description}
                  value={build.defenseStats[definition.id]}
                  percent={isPercentDefinition(definition)}
                  error={issues.get(key)}
                  onChange={(value) => updateDefenseStat(definition.id, value)}
                  key={definition.id}
                />
              )
            })}
          </div>
        </section>
      </div>
    </article>
  )
}

type WuyunPanelProps = {
  input: WuyunInput
  result: WuyunResult | null
  issues: ReadonlyMap<string, string>
  onChange: (input: WuyunInput) => void
}

function WuyunPanel({ input, result, issues, onChange }: WuyunPanelProps) {
  const updateEnabled = (id: WuyunSkillId, enabled: boolean) => {
    onChange({
      ...input,
      enabled: { ...input.enabled, [id]: enabled }
    })
  }

  const updateValue = (id: WuyunValueId, value: number) => {
    onChange({
      ...input,
      values: { ...input.values, [id]: value }
    })
  }

  return (
    <div className="tower-wuyun-layout">
      <div className="tower-wuyun-controls">
        <h3>当前武蕴配置</h3>
        <p className="tower-wuyun-help">
          “有 / 无”仅执行原表实际存在的跨项联动，不会统一把该项场景结果清零。
        </p>
        <div className="tower-wuyun-options">
          {wuyunRules.map((definition) => {
            const enabledLabelId = `tower-wuyun-${definition.id}-label`
            return (
              <section className="tower-wuyun-definition" key={definition.id}>
                <header>
                  <div>
                    <strong id={enabledLabelId}>{definition.label}</strong>
                    <span>{definition.kind === 'damage-share' ? '伤害占比类' : '增伤类'}</span>
                  </div>
                  <Select
                    value={input.enabled[definition.id] ? 'enabled' : 'disabled'}
                    onValueChange={(value) => updateEnabled(definition.id, value === 'enabled')}
                  >
                    <SelectTrigger size="compact" aria-labelledby={enabledLabelId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">有</SelectItem>
                      <SelectItem value="disabled">无</SelectItem>
                    </SelectContent>
                  </Select>
                </header>
                <div className="tower-wuyun-value-fields">
                  {definition.valueFields.map((field) => {
                    const key = `wuyun-value-${field.id}`
                    return (
                      <NumberField
                        id={`tower-${key}`}
                        label={`${definition.label}${field.label}`}
                        value={input.values[field.id]}
                        percent
                        min={field.minValue === null ? 0 : field.minValue * 100}
                        max={field.maxValue === null ? undefined : field.maxValue * 100}
                        error={issues.get(key)}
                        onChange={(value) => updateValue(field.id, value)}
                        key={field.id}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        <div className="tower-wuyun-points">
          <NumberField
            id="tower-wuyun-consumed-points"
            label="消耗武蕴点"
            value={input.consumedPoints}
            integer
            error={issues.get('wuyun-consumed-points')}
            onChange={(value) => onChange({ ...input, consumedPoints: value })}
          />
        </div>
      </div>

      <div className="tower-wuyun-results">
        <h3>场景收益</h3>
        {result ? (
          <div className="tower-wuyun-result-groups">
            {wuyunRules.map((definition) => {
              const scenarios = result.scenarios.filter(
                (scenario) => scenario.skillId === definition.id
              )
              if (scenarios.length === 0) return null

              return (
                <section className="tower-wuyun-result-group" key={definition.id}>
                  <h4>{definition.label}</h4>
                  <div className="tower-wuyun-scenarios">
                    {scenarios.map((scenario) => (
                      <article
                        className="tower-wuyun-scenario"
                        aria-label={`${scenario.skillLabel}${scenario.label}评分`}
                        key={scenario.id}
                      >
                        <div className="tower-wuyun-scenario__heading">
                          <strong>{scenario.label}</strong>
                          <span>{formatScore(scenario.score)} 分</span>
                        </div>
                        <small>
                          实际期望 {percentFormatter.format(scenario.expected * 100)}%
                          {scenario.note ? ` · ${scenario.note}` : ''}
                        </small>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
            {result.scenarios.some((scenario) => scenario.skillId === null) ? (
              <section className="tower-wuyun-result-group">
                <h4>消耗武蕴点</h4>
                <div className="tower-wuyun-scenarios">
                  {result.scenarios
                    .filter((scenario) => scenario.skillId === null)
                    .map((scenario) => (
                      <article
                        className="tower-wuyun-scenario"
                        aria-label={`${scenario.label}评分`}
                        key={scenario.id}
                      >
                        <div className="tower-wuyun-scenario__heading">
                          <strong>{scenario.label}</strong>
                          <span>{formatScore(scenario.score)} 分</span>
                        </div>
                        <small>
                          实际期望 {percentFormatter.format(scenario.expected * 100)}%
                          {scenario.note ? ` · ${scenario.note}` : ''}
                        </small>
                      </article>
                    ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="tower-empty-result" role="status">
            <Sparkles aria-hidden="true" />
            <strong>武蕴场景结果暂不可用</strong>
            <span>修正武蕴区域的标红字段后，将自动恢复全部场景收益。</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function TowerDemolitionCalculatorPage() {
  const [calculatorInput, setCalculatorInput] = useState<TowerCalculatorInput>(() =>
    cloneInput(defaultTowerCalculatorInput)
  )
  const validationIssues = useMemo(() => validateInput(calculatorInput), [calculatorInput])
  const issuesByKey = useMemo(
    () => new Map(validationIssues.map((issue) => [issue.key, issue.message])),
    [validationIssues]
  )
  const buildValidationIssues = useMemo(
    () =>
      validationIssues.filter(
        (issue) => !issue.key.startsWith('wuyun-') || buildAffectingWuyunIssueKeys.has(issue.key)
      ),
    [validationIssues]
  )
  const wuyunValidationIssues = useMemo(
    () => validationIssues.filter((issue) => issue.key.startsWith('wuyun-')),
    [validationIssues]
  )
  const result = useMemo(() => {
    let safeInput = cloneInput(calculatorInput)

    if (buildValidationIssues.length > 0) {
      const fallbackInput = cloneInput(defaultTowerCalculatorInput)
      safeInput = { ...fallbackInput, wuyun: safeInput.wuyun }
    }
    if (wuyunValidationIssues.length > 0) {
      safeInput.wuyun = cloneInput(defaultTowerCalculatorInput).wuyun
    }

    return calculateTowerDemolition(safeInput)
  }, [buildValidationIssues.length, calculatorInput, wuyunValidationIssues.length])

  const updateBuild = (index: BuildIndex, build: TowerBuildInput) => {
    setCalculatorInput((current) => {
      const builds = [...current.builds] as TowerCalculatorInput['builds']
      builds[index] = build
      return { ...current, builds }
    })
  }

  const updateWeight = (field: 'offenseWeight' | 'defenseWeight', value: number) => {
    setCalculatorInput((current) => {
      if (!Number.isFinite(value)) return { ...current, [field]: value }
      const complementField = field === 'offenseWeight' ? 'defenseWeight' : 'offenseWeight'
      return {
        ...current,
        [field]: value,
        [complementField]: 1 - value
      }
    })
  }

  const restoreExample = () => setCalculatorInput(cloneInput(defaultTowerCalculatorInput))
  const clearBuilds = () => {
    const emptyInput = createEmptyTowerCalculatorInput()
    setCalculatorInput((current) => ({
      ...current,
      builds: cloneInput(emptyInput).builds
    }))
  }

  return (
    <div className="tower-calculator">
      <div className="tower-calculator__scroll">
        <header className="tower-toolbar">
          <div className="tower-toolbar__summary">
            <div className="tower-toolbar__badges">
              <Badge className="tower-compatibility-badge" variant="outline">
                <Info aria-hidden="true" />
                Excel 兼容模式
              </Badge>
              <Badge className="tower-warning-badge" variant="outline">
                <TriangleAlert aria-hidden="true" />
                含原表已知异常
              </Badge>
            </div>
            <div className="tower-toolbar__copy">
              <strong>{ruleMeta.title}</strong>
              <span>
                规则 {ruleMeta.version} · 来源：{ruleMeta.source}
              </span>
            </div>
          </div>
          <div className="tower-toolbar__actions">
            <Button type="button" variant="outline" onClick={restoreExample}>
              <RefreshCcw aria-hidden="true" />
              恢复表格示例
            </Button>
            <Button type="button" variant="outline" onClick={clearBuilds}>
              <Eraser aria-hidden="true" />
              清空两套
            </Button>
          </div>
        </header>

        <section className="tower-panel" aria-labelledby="tower-conditions-title">
          <PanelHeading
            id="tower-conditions-title"
            icon={<SlidersHorizontal />}
            title="战斗条件"
            description="两套配置共用职业、时长、士气及抗拆权重"
          >
            <Badge variant="secondary">
              输出 {percentFormatter.format(calculatorInput.offenseWeight * 100)}% / 坦度{' '}
              {percentFormatter.format(calculatorInput.defenseWeight * 100)}%
            </Badge>
          </PanelHeading>
          <div className="tower-conditions">
            <div className="tower-field">
              <Label id="tower-profession-label">职业</Label>
              <Select
                value={calculatorInput.professionId}
                onValueChange={(value) =>
                  setCalculatorInput((current) => ({
                    ...current,
                    professionId: value as TowerProfessionId
                  }))
                }
              >
                <SelectTrigger aria-labelledby="tower-profession-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {professions.map((profession) => (
                    <SelectItem value={profession.id} key={profession.id}>
                      {profession.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id="tower-battle-duration"
              label="战斗时长"
              description="秒"
              value={calculatorInput.battleDurationSeconds}
              min={1}
              integer
              error={issuesByKey.get('battleDurationSeconds')}
              onChange={(value) =>
                setCalculatorInput((current) => ({
                  ...current,
                  battleDurationSeconds: value
                }))
              }
            />
            <NumberField
              id="tower-morale"
              label="局内士气"
              value={calculatorInput.morale}
              integer
              error={issuesByKey.get('morale')}
              onChange={(value) => setCalculatorInput((current) => ({ ...current, morale: value }))}
            />
            <NumberField
              id="tower-offense-weight"
              label="输出权重"
              value={calculatorInput.offenseWeight}
              percent
              max={100}
              error={issuesByKey.get('offenseWeight') ?? issuesByKey.get('weights')}
              onChange={(value) => updateWeight('offenseWeight', value)}
            />
            <NumberField
              id="tower-defense-weight"
              label="坦度权重"
              value={calculatorInput.defenseWeight}
              percent
              max={99.9}
              error={issuesByKey.get('defenseWeight') ?? issuesByKey.get('weights')}
              onChange={(value) => updateWeight('defenseWeight', value)}
            />
          </div>
        </section>

        {validationIssues.length > 0 ? (
          <Alert variant="destructive" role="alert">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>请先修正输入</AlertTitle>
            <AlertDescription>{validationIssues[0].message} 受影响的结果已暂停。</AlertDescription>
          </Alert>
        ) : null}

        {buildValidationIssues.length === 0 ? (
          <ResultSummary builds={result.builds} />
        ) : (
          <section className="tower-panel tower-empty-result" role="status">
            <Castle aria-hidden="true" />
            <strong>评分暂不可用</strong>
            <span>修正标红字段后，将自动恢复两套抗拆和空拆评分。</span>
          </section>
        )}

        <section className="tower-build-grid" aria-label="双套内功配置">
          {calculatorInput.builds.map((build, index) => (
            <BuildEditor
              index={index as BuildIndex}
              build={build}
              issues={issuesByKey}
              onChange={(nextBuild) => updateBuild(index as BuildIndex, nextBuild)}
              key={buildLabels[index]}
            />
          ))}
        </section>

        <section className="tower-panel" aria-labelledby="tower-wuyun-title">
          <PanelHeading
            id="tower-wuyun-title"
            icon={<Sparkles />}
            title="武蕴灵窍"
            description="按原表场景独立估算，保留“有 / 无”之间的联动语义"
          >
            <span className="tower-wuyun-note">
              <TriangleAlert aria-hidden="true" />
              独立参考工具，不计入两套内功总分
            </span>
          </PanelHeading>
          <WuyunPanel
            input={calculatorInput.wuyun}
            result={wuyunValidationIssues.length === 0 ? result.wuyun : null}
            issues={issuesByKey}
            onChange={(wuyun) => setCalculatorInput((current) => ({ ...current, wuyun }))}
          />
        </section>
      </div>
    </div>
  )
}

import {
  Award,
  CircleHelp,
  Eraser,
  Gauge,
  Info,
  Link2,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Trophy
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

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

export function InternalSkillCalculatorPage() {
  const [calculatorInput, setCalculatorInput] = useState<CalculatorInput>(createEmptyInput)
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

  return (
    <div className="internal-skill-calculator">
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
          <Button type="button" variant="outline" disabled={!hasDraftInput} onClick={clearAll}>
            <Eraser aria-hidden="true" />
            清空全部
          </Button>
        </div>
      </div>

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
    </div>
  )
}

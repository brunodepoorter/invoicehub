import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FileCheck, ExternalLink, AlertCircle, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Search, AlertTriangle, ArrowRight,
  Loader2, RefreshCw, Sparkles,
} from 'lucide-react'
import type { Expense, Report } from '../lib/types'
import { matchRule, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { updateExpense, assignExpenseToReport } from '../lib/api'
import { formatAmount, cn } from '../lib/utils'

interface Props {
  orgId: number
  reports: Report[]
  unreported: Expense[]
  allExpenses: Expense[]
  loading: boolean
  onRefresh: () => void
}

function getFieldStatus(exp: Expense) {
  return {
    category: !!(exp.category || exp.category_id),
    tag1: !!(exp.tag1_id || (exp as any).tag1),
    kostenplaats: !!(exp.field_values?.some((fv: any) => fv.field_id === KOSTENPLAATS_FIELD_ID && (fv.option_id || fv.value))),
    receipt: !!(exp.attachment_count && exp.attachment_count > 0) || !!((exp as any).resources?.length > 0),
  }
}

function getAutoFillInfo(exp: Expense) {
  const rule = matchRule(exp.description)
  if (!rule) return null
  const status = getFieldStatus(exp)
  const missing: string[] = []
  if (!status.category) missing.push('Categorie → ' + rule.category)
  if (!status.tag1) missing.push('Kostendrager → MD00')
  if (!status.kostenplaats) missing.push('Kostenplaats → D18JPL')
  return { rule, missing }
}

const REQUIRED = [
  { key: 'category' as const, label: 'Categorie' },
  { key: 'tag1' as const, label: 'Kostendrager' },
  { key: 'kostenplaats' as const, label: 'Kostenplaats' },
  { key: 'receipt' as const, label: 'Receipt' },
]

export function DeclareeExpenses({ orgId, reports, unreported, allExpenses, loading, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['unreported', ...reports.map(r => 'r-' + r.id)]))
  const [autoFilling, setAutoFilling] = useState<Set<number>>(new Set())
  const [assigning, setAssigning] = useState<Set<number>>(new Set())

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const totalCount = allExpenses.length
  const missingCount = allExpenses.filter(e => {
    const s = getFieldStatus(e); return !s.category || !s.tag1 || !s.kostenplaats || !s.receipt
  }).length

  const filtered = search
    ? allExpenses.filter(e =>
        e.description?.toLowerCase().includes(search.toLowerCase()) ||
        e.category?.toLowerCase().includes(search.toLowerCase())
      )
    : null

  async function doAutoFill(exp: Expense) {
    const rule = matchRule(exp.description)
    if (!rule) return
    setAutoFilling(prev => new Set(prev).add(exp.id))
    try {
      await updateExpense(exp.id, {
        category: rule.category,
        tag1_id: TAG1_ID,
        field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
      })
      onRefresh()
    } catch (e) { console.error('Auto-fill failed', e) }
    finally { setAutoFilling(prev => { const n = new Set(prev); n.delete(exp.id); return n }) }
  }

  async function doAssign(expId: number, reportId: number) {
    setAssigning(prev => new Set(prev).add(expId))
    try { await assignExpenseToReport(expId, reportId); onRefresh() }
    catch (e) { console.error('Assign failed', e) }
    finally { setAssigning(prev => { const n = new Set(prev); n.delete(expId); return n }) }
  }

  if (loading) {
    return (
      <section>
        <SectionHeader count={0} missing={0} unreported={0} onRefresh={onRefresh} />
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 shadow-card">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading expenses from Declaree…</span>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader count={totalCount} missing={missingCount} unreported={unreported.length} onRefresh={onRefresh} />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder="Search expenses…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <a href="https://app.declaree.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Open Declaree <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </div>
      </div>

      {filtered ? (
        <ExpenseTable expenses={filtered} showReport />
      ) : (
        <div className="space-y-3">
          {unreported.length > 0 && (
            <div className="rounded-lg border-2 border-warning/30 bg-card shadow-card overflow-hidden">
              <button onClick={() => toggle('unreported')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-warning/5 transition-colors">
                {expanded.has('unreported') ? <ChevronDown className="h-4 w-4 text-warning shrink-0" /> : <ChevronRight className="h-4 w-4 text-warning shrink-0" />}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-medium text-foreground font-display text-sm">Zonder Rapport</span>
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Needs assignment</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{unreported.length} expense{unreported.length !== 1 ? 's' : ''}</span>
                  <span className="font-medium font-display text-sm text-foreground">
                    {formatAmount(unreported.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0), 'EUR')}
                  </span>
                </div>
              </button>
              {expanded.has('unreported') && (
                <ExpenseTable expenses={unreported} showAutoFill showAssign reports={reports}
                  autoFilling={autoFilling} assigning={assigning} onAutoFill={doAutoFill} onAssign={doAssign} />
              )}
            </div>
          )}

          {reports.map(report => {
            const sid = 'r-' + report.id
            const expenses = report.expenses || []
            return (
              <div key={report.id} className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
                <button onClick={() => toggle(sid)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
                  {expanded.has(sid) ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground font-display text-sm truncate">{report.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</span>
                    <span className="font-medium font-display text-sm text-foreground">
                      {formatAmount(report.total || expenses.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0), 'EUR')}
                    </span>
                  </div>
                </button>
                {expanded.has(sid) && expenses.length > 0 && <ExpenseTable expenses={expenses} />}
                {expanded.has(sid) && expenses.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground border-t border-border">No expenses in this report yet</div>
                )}
              </div>
            )
          })}

          {reports.length === 0 && unreported.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
              No open reports or unreported expenses found.
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SectionHeader({ count, missing, unreported, onRefresh }: { count: number; missing: number; unreported: number; onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider font-display flex items-center gap-2">
        <FileCheck className="h-4 w-4" />Declaree Items ({count})
      </h2>
      {unreported > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
          <AlertTriangle className="h-3 w-3" />{unreported} zonder rapport
        </span>
      )}
      {missing > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" />{missing} missing details
        </span>
      )}
      <button onClick={onRefresh} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <RefreshCw className="h-3 w-3" /> Refresh
      </button>
    </div>
  )
}

function ExpenseTable({ expenses, showReport = false, showAutoFill = false, showAssign = false,
  reports = [], autoFilling = new Set<number>(), assigning = new Set<number>(), onAutoFill, onAssign,
}: {
  expenses: (Expense & { reportName?: string })[]
  showReport?: boolean; showAutoFill?: boolean; showAssign?: boolean
  reports?: Report[]; autoFilling?: Set<number>; assigning?: Set<number>
  onAutoFill?: (exp: Expense) => void; onAssign?: (expId: number, reportId: number) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground font-display text-xs">Description</th>
            {showReport && <th className="px-4 py-2.5 text-left font-medium text-muted-foreground font-display text-xs">Report</th>}
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground font-display text-xs">Date</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground font-display text-xs">Amount</th>
            {REQUIRED.map(f => <th key={f.key} className="px-3 py-2.5 text-center font-medium text-muted-foreground font-display text-xs">{f.label}</th>)}
            {showAutoFill && <th className="px-3 py-2.5 text-center font-medium text-muted-foreground font-display text-xs">Auto-fill</th>}
            {showAssign && <th className="px-3 py-2.5 text-left font-medium text-muted-foreground font-display text-xs"><span className="flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Rapport</span></th>}
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp, i) => {
            const fields = getFieldStatus(exp)
            const allFilled = REQUIRED.every(f => fields[f.key])
            const autoInfo = showAutoFill ? getAutoFillInfo(exp) : null
            return (
              <motion.tr key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                className={cn('border-b border-border last:border-0 transition-colors', allFilled ? 'hover:bg-secondary/30' : 'bg-warning/[0.02] hover:bg-warning/[0.05]')}>
                <td className="px-4 py-2.5 font-medium text-foreground text-sm">{exp.description}</td>
                {showReport && <td className="px-4 py-2.5 text-xs text-muted-foreground">{(exp as any).reportName || '—'}</td>}
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {exp.date ? new Date(exp.date).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-medium font-display text-foreground text-sm">
                  {formatAmount(exp.amount, exp.currency || 'EUR')}
                </td>
                {REQUIRED.map(f => (
                  <td key={f.key} className="px-3 py-2.5 text-center">
                    {fields[f.key] ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {f.key === 'category' && (exp.category || '✓')}
                          {f.key === 'tag1' && 'MD00'}
                          {f.key === 'kostenplaats' && 'D18JPL'}
                          {f.key === 'receipt' && (exp.attachment_count || 1) + ' file' + ((exp.attachment_count || 1) !== 1 ? 's' : '')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <XCircle className="h-4 w-4 text-warning" />
                        <span className="text-[10px] text-warning mt-0.5">Missing</span>
                      </div>
                    )}
                  </td>
                ))}
                {showAutoFill && (
                  <td className="px-3 py-2.5 text-center">
                    {autoInfo ? (
                      <button onClick={() => onAutoFill?.(exp)} disabled={autoFilling.has(exp.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
                        {autoFilling.has(exp.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {autoInfo.rule.label}
                      </button>
                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>
                )}
                {showAssign && (
                  <td className="px-3 py-2.5">
                    {assigning.has(exp.id) ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                      <select className="h-8 w-full max-w-[180px] rounded border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/30 cursor-pointer"
                        defaultValue="" onChange={e => { const id = parseInt(e.target.value); if (id) onAssign?.(exp.id, id) }}>
                        <option value="" disabled>Kies rapport…</option>
                        {reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                  </td>
                )}
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default DeclareeExpenses

import React, { useState } from 'react'
import { ChevronRight, ChevronDown, RefreshCw, ExternalLink, AlertTriangle, Zap } from 'lucide-react'
import type { Expense, Report } from '../lib/types'
import { matchRule, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { updateExpense, assignToReport } from '../lib/api'
import { formatDate, formatAmount, getExpenseDate, expenseCompleteness, cn } from '../lib/utils'

interface Props {
  orgId: number
  reports: Report[]
  unreported: Expense[]
  allExpenses: Expense[]
  loading: boolean
  onRefresh: () => void
}

export function DeclareeExpenses({ orgId, reports, unreported, allExpenses, loading, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['unreported']))
  const [autofilling, setAutofilling] = useState<Set<number>>(new Set())
  const [assigning, setAssigning] = useState<Set<number>>(new Set())

  // Open all report sections when loaded
  React.useEffect(() => {
    if (reports.length > 0) {
      setOpenSections(prev => {
        const next = new Set(prev)
        reports.forEach(r => next.add(`report-${r.id}`))
        return next
      })
    }
  }, [reports.length])

  const missingCount = allExpenses.filter(e => {
    const c = expenseCompleteness(e)
    return !c.hasCategory || !c.hasKostendrager || !c.hasKostenplaats || !c.hasReceipt
  }).length

  const q = search.toLowerCase()
  const filterExp = (e: Expense) => !q || (e.description||'').toLowerCase().includes(q) || String(e.amount).includes(q)

  function toggle(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleAutoFill(expense: Expense) {
    const rule = matchRule(expense.description)
    if (!rule) return
    setAutofilling(prev => new Set(prev).add(expense.id))
    try {
      await updateExpense(orgId, expense.id, {
        category: rule.category,
        tag1_id: TAG1_ID,
        field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
      })
      onRefresh()
    } catch (e: any) { alert('Auto-fill failed: ' + e.message) }
    finally { setAutofilling(prev => { const n = new Set(prev); n.delete(expense.id); return n }) }
  }

  async function handleAssign(expense: Expense, reportId: number) {
    setAssigning(prev => new Set(prev).add(expense.id))
    try {
      await assignToReport(orgId, expense.id, reportId)
      onRefresh()
    } catch (e: any) { alert('Assign failed: ' + e.message) }
    finally { setAssigning(prev => { const n = new Set(prev); n.delete(expense.id); return n }) }
  }

  const filteredUnreported = unreported.filter(filterExp)
  const unreportedTotal = filteredUnreported.reduce((s, e) => s + parseFloat(String(e.amount)||'0'), 0)

  return (
    <section>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold font-display text-foreground uppercase tracking-wide">
            Declaree items ({allExpenses.length})
          </span>
          {unreported.length > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
              {unreported.length} zonder rapport
            </span>
          )}
          {missingCount > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {missingCount} missing details
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search expenses…"
            className="h-9 rounded-lg border border-border bg-card pl-3 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30" />
          <button onClick={onRefresh} disabled={loading}
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
          </button>
          <a href="https://app.declaree.com" target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Open Declaree <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 shadow-card">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading expenses from Declaree…</span>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {/* Zonder Rapport */}
          {filteredUnreported.length > 0 && (
            <div className="rounded-lg border-2 border-warning/30 bg-card shadow-card overflow-hidden">
              <button onClick={() => toggle('unreported')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-warning/5 transition-colors">
                {openSections.has('unreported')
                  ? <ChevronDown className="h-4 w-4 text-warning shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-warning shrink-0" />}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-medium text-foreground font-display text-sm">Zonder Rapport</span>
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Needs assignment</span>
                </div>
                <span className="text-xs text-muted-foreground mr-3">{filteredUnreported.length} expenses</span>
                <span className="font-medium font-display text-sm text-foreground">€{unreportedTotal.toFixed(2)}</span>
              </button>
              {openSections.has('unreported') && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/50 border-y border-border">
                        <Th>Description</Th><Th>Date</Th><Th>Amount</Th>
                        <Th center>Categorie</Th><Th center>Kostendrager</Th><Th center>Kostenplaats</Th><Th center>Receipt</Th>
                        <Th>Auto-fill</Th><Th>→ Rapport</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnreported.map(e => (
                        <UnreportedRow key={e.id} expense={e} reports={reports}
                          isAutofilling={autofilling.has(e.id)} isAssigning={assigning.has(e.id)}
                          onAutoFill={() => handleAutoFill(e)} onAssign={rId => handleAssign(e, rId)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Reports */}
          {reports.map(report => {
            const exps = (report.expenses || []).filter(filterExp)
            const total = exps.reduce((s, e) => s + parseFloat(String(e.amount)||'0'), 0)
            const key = `report-${report.id}`
            const isOpen = openSections.has(key)
            return (
              <div key={report.id} className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
                <button onClick={() => toggle(key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-medium text-foreground font-display text-sm truncate">{report.name || `Report ${report.id}`}</span>
                    {report.user?.fullName && <span className="text-xs text-muted-foreground">— {report.user.fullName}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground mr-3">{exps.length} expenses</span>
                  <span className="font-medium font-display text-sm text-foreground">€{total.toFixed(2)}</span>
                </button>
                {isOpen && (
                  exps.length === 0
                    ? <div className="px-5 py-4 text-center text-sm text-muted-foreground">No expenses in this report yet</div>
                    : <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-secondary/50 border-y border-border">
                              <Th>Description</Th><Th>Date</Th><Th>Amount</Th>
                              <Th center>Categorie</Th><Th center>Kostendrager</Th><Th center>Kostenplaats</Th><Th center>Receipt</Th>
                            </tr>
                          </thead>
                          <tbody>{exps.map(e => <ReportRow key={e.id} expense={e} />)}</tbody>
                        </table>
                      </div>
                )}
              </div>
            )
          })}

          {filteredUnreported.length === 0 && reports.length === 0 && (
            <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 shadow-card">
              <p className="text-sm text-muted-foreground">No open reports or unreported expenses found.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={cn('text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2 first:pl-5', center ? 'text-center' : 'text-left')}>{children}</th>
}

function Dot({ ok, label }: { ok: boolean; label?: string }) {
  if (ok) return <div className="flex flex-col items-center gap-0.5"><span className="text-success text-sm">✓</span>{label && <span className="text-[10px] text-muted-foreground max-w-[70px] truncate">{label}</span>}</div>
  return <div className="flex flex-col items-center gap-0.5"><span className="text-warning text-sm">⊗</span><span className="text-[10px] text-warning">Missing</span></div>
}

function UnreportedRow({ expense, reports, isAutofilling, isAssigning, onAutoFill, onAssign }: {
  expense: Expense; reports: Report[]; isAutofilling: boolean; isAssigning: boolean
  onAutoFill: () => void; onAssign: (rId: number) => void
}) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)
  const rule = matchRule(expense.description)
  const canAutoFill = !!rule && (!hasCategory || !hasKostendrager || !hasKostenplaats)

  return (
    <tr className="border-b border-border hover:bg-secondary/20 last:border-0 align-top">
      <td className="px-5 py-3 font-medium text-foreground max-w-[180px]"><div className="truncate">{expense.description || '—'}</div></td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(getExpenseDate(expense))}</td>
      <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{formatAmount(expense.amount, expense.currency)}</td>
      <td className="px-4 py-3 text-center"><Dot ok={hasCategory} /></td>
      <td className="px-4 py-3 text-center"><Dot ok={hasKostendrager} /></td>
      <td className="px-4 py-3 text-center"><Dot ok={hasKostenplaats} /></td>
      <td className="px-4 py-3 text-center"><Dot ok={hasReceipt} label={hasReceipt ? '1 file' : undefined} /></td>
      <td className="px-4 py-3 min-w-[180px]">
        {canAutoFill ? (
          <button onClick={onAutoFill} disabled={isAutofilling} className="text-left disabled:opacity-50 hover:opacity-80 group">
            <div className="text-xs font-semibold text-accent mb-0.5 group-hover:underline">{rule.label}</div>
            <div className="text-[10px] text-muted-foreground leading-relaxed">
              Categorie → {rule.category},<br />
              Kostendrager → MD00 - Algemeen,<br />
              Kostenplaats → D18JPL - Business Innovation & Marketing competitie
            </div>
            {isAutofilling && <div className="text-[10px] text-accent mt-0.5">Saving…</div>}
          </button>
        ) : hasCategory && hasKostendrager && hasKostenplaats
          ? <span className="text-xs text-success">✓ Complete</span>
          : <span className="text-xs text-muted-foreground">No rule match</span>}
      </td>
      <td className="px-4 py-3">
        <select disabled={isAssigning} onChange={e => { if (e.target.value) onAssign(parseInt(e.target.value)) }} defaultValue=""
          className="text-xs px-2 py-1 border border-border rounded-md bg-card text-foreground focus:outline-none disabled:opacity-50 max-w-[160px]">
          <option value="">Kies rapport...</option>
          {reports.map(r => <option key={r.id} value={r.id}>{(r.name||`Report ${r.id}`).substring(0,35)}</option>)}
        </select>
      </td>
    </tr>
  )
}

function ReportRow({ expense }: { expense: Expense }) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)
  const catName = typeof expense.category === 'string' ? expense.category : expense.category?.name || ''
  const tagName = typeof expense.tag1 === 'string' ? expense.tag1 : expense.tag1?.name || 'MD00 - Alg…'

  return (
    <tr className="border-b border-border hover:bg-secondary/20 last:border-0">
      <td className="px-5 py-2.5 font-medium text-foreground max-w-[200px]"><div className="truncate">{expense.description||'—'}</div></td>
      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(getExpenseDate(expense))}</td>
      <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{formatAmount(expense.amount, expense.currency)}</td>
      <td className="px-4 py-2.5 text-center"><Dot ok={hasCategory} label={catName.substring(0,12)+'…'} /></td>
      <td className="px-4 py-2.5 text-center"><Dot ok={hasKostendrager} label={tagName.substring(0,10)+'…'} /></td>
      <td className="px-4 py-2.5 text-center"><Dot ok={hasKostenplaats} label={hasKostenplaats ? 'D18JPL - Bu…' : undefined} /></td>
      <td className="px-4 py-2.5 text-center"><Dot ok={hasReceipt} label={hasReceipt ? '1 file' : undefined} /></td>
    </tr>
  )
}

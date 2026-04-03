import React, { useState } from 'react'
import { ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import type { Expense, Report } from '../lib/types'
import { matchRule, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { updateExpense, assignExpenseToReport } from '../lib/api'
import { formatDate, formatAmount, expenseCompleteness, cn } from '../lib/utils'

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

  // Open all report sections when reports load
  React.useEffect(() => {
    if (reports.length > 0) {
      setOpenSections(prev => {
        const next = new Set(prev)
        reports.forEach(r => next.add(String(r.id)))
        return next
      })
    }
  }, [reports.length])

  const unreportedCount = unreported.length
  const missingCount = allExpenses.filter(e => {
    const c = expenseCompleteness(e)
    return !c.hasCategory || !c.hasKostendrager || !c.hasKostenplaats || !c.hasReceipt
  }).length

  const q = search.toLowerCase()
  const filterExp = (e: Expense) => {
    if (!q) return true
    return (e.description || '').toLowerCase().includes(q) ||
      String(e.amount).includes(q) ||
      (e.date || '').includes(q)
  }

  function toggleSection(key: string) {
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
      await updateExpense(expense.id, {
        category: rule.category,
        tag1_id: TAG1_ID,
        field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
      })
      onRefresh()
    } catch (e: any) {
      alert('Auto-fill failed: ' + e.message)
    } finally {
      setAutofilling(prev => { const n = new Set(prev); n.delete(expense.id); return n })
    }
  }

  async function handleAssign(expense: Expense, reportId: number) {
    setAssigning(prev => new Set(prev).add(expense.id))
    try {
      await assignExpenseToReport(expense.id, reportId)
      onRefresh()
    } catch (e: any) {
      alert('Assign failed: ' + e.message)
    } finally {
      setAssigning(prev => { const n = new Set(prev); n.delete(expense.id); return n })
    }
  }

  const filteredUnreported = unreported.filter(filterExp)
  const unreportedTotal = filteredUnreported.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Declaree items ({allExpenses.length})
        </span>
        {unreportedCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
            {unreportedCount} zonder rapport
          </span>
        )}
        {missingCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {missingCount} missing details
          </span>
        )}
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search expenses..."
          className="ml-auto text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 w-56"
        />
        <button onClick={onRefresh} disabled={loading}
          className={cn('p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500', loading && 'opacity-50')}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <a href="https://app.declaree.com" target="_blank" rel="noreferrer">
          <button className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            Open Declaree <ExternalLink size={12} />
          </button>
        </a>
      </div>

      {loading && <div className="px-5 py-8 text-center text-sm text-gray-400">Loading expenses…</div>}

      {!loading && (
        <div>
          {/* Zonder Rapport */}
          {filteredUnreported.length > 0 && (
            <Section
              label={<><span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">Zonder Rapport</span><span className="text-xs text-gray-400 ml-2">Needs assignment</span></>}
              count={filteredUnreported.length}
              total={unreportedTotal}
              isOpen={openSections.has('unreported')}
              onToggle={() => toggleSection('unreported')}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-100">
                    <Th>Description</Th>
                    <Th>Date</Th>
                    <Th>Amount</Th>
                    <Th center>Categorie</Th>
                    <Th center>Kostendrager</Th>
                    <Th center>Kostenplaats</Th>
                    <Th center>Receipt</Th>
                    <Th>Auto-fill</Th>
                    <Th>→ Rapport</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnreported.map(e => (
                    <UnreportedRow
                      key={e.id}
                      expense={e}
                      reports={reports}
                      isAutofilling={autofilling.has(e.id)}
                      isAssigning={assigning.has(e.id)}
                      onAutoFill={() => handleAutoFill(e)}
                      onAssign={rId => handleAssign(e, rId)}
                    />
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Reports */}
          {reports.map(report => {
            const exps = (report.expenses || []).filter(filterExp)
            const total = exps.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0)
            const isOpen = openSections.has(String(report.id))
            return (
              <Section
                key={report.id}
                label={<span className="font-medium text-gray-900">{report.name || `Report ${report.id}`}</span>}
                count={exps.length}
                total={total}
                isOpen={isOpen}
                onToggle={() => toggleSection(String(report.id))}
              >
                {exps.length === 0
                  ? <div className="px-5 py-4 text-center text-sm text-gray-400">No expenses in this report yet</div>
                  : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-y border-gray-100">
                          <Th>Description</Th>
                          <Th>Date</Th>
                          <Th>Amount</Th>
                          <Th center>Categorie</Th>
                          <Th center>Kostendrager</Th>
                          <Th center>Kostenplaats</Th>
                          <Th center>Receipt</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {exps.map(e => <ReportRow key={e.id} expense={e} />)}
                      </tbody>
                    </table>
                  )
                }
              </Section>
            )
          })}

          {filteredUnreported.length === 0 && reports.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No expenses found</div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, count, total, isOpen, onToggle, children }: {
  label: React.ReactNode; count: number; total: number
  isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 px-5 py-3 cursor-pointer hover:bg-gray-50 select-none" onClick={onToggle}>
        <ChevronRight size={14} className={cn('text-gray-400 transition-transform shrink-0', isOpen && 'rotate-90')} />
        <div className="flex-1 flex items-center">{label}</div>
        <span className="text-xs text-gray-400 mr-3">{count} expenses</span>
        <span className="text-sm font-semibold text-gray-800">€{total.toFixed(2)}</span>
      </div>
      {isOpen && <div className="overflow-x-auto">{children}</div>}
    </div>
  )
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={cn(
      'text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 first:px-5',
      center ? 'text-center' : 'text-left'
    )}>{children}</th>
  )
}

function UnreportedRow({ expense, reports, isAutofilling, isAssigning, onAutoFill, onAssign }: {
  expense: Expense; reports: Report[]
  isAutofilling: boolean; isAssigning: boolean
  onAutoFill: () => void; onAssign: (rId: number) => void
}) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)
  const rule = matchRule(expense.description)
  const canAutoFill = !!rule && (!hasCategory || !hasKostendrager || !hasKostenplaats)

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0 align-top">
      <td className="px-5 py-3 font-medium text-gray-800 max-w-[180px]"><div className="truncate">{expense.description || '—'}</div></td>
      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{formatDate(expense.date)}</td>
      <td className="px-3 py-3 font-semibold text-gray-800 whitespace-nowrap">{formatAmount(expense.amount, expense.currency)}</td>
      <td className="px-3 py-3 text-center"><Dot ok={hasCategory} /></td>
      <td className="px-3 py-3 text-center"><Dot ok={hasKostendrager} /></td>
      <td className="px-3 py-3 text-center"><Dot ok={hasKostenplaats} /></td>
      <td className="px-3 py-3 text-center"><Dot ok={hasReceipt} /></td>
      <td className="px-3 py-3 min-w-[180px]">
        {canAutoFill ? (
          <button onClick={onAutoFill} disabled={isAutofilling} className="text-left disabled:opacity-50 hover:opacity-80">
            <div className="text-xs font-semibold text-green-600 mb-0.5">{rule.label}</div>
            <div className="text-[10px] text-gray-500 leading-relaxed">
              Categorie → {rule.category},<br />
              Kostendrager → MD00 - Algemeen,<br />
              Kostenplaats → D18JPL - Business Innovation & Marketing competitie
            </div>
            {isAutofilling && <div className="text-[10px] text-blue-500 mt-0.5">Saving…</div>}
          </button>
        ) : hasCategory && hasKostendrager && hasKostenplaats
          ? <span className="text-xs text-green-600">✓ Complete</span>
          : <span className="text-xs text-gray-400">No rule match</span>
        }
      </td>
      <td className="px-3 py-3">
        <select disabled={isAssigning} onChange={e => { if (e.target.value) onAssign(parseInt(e.target.value)) }} defaultValue=""
          className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-50 max-w-[160px]">
          <option value="">Kies rapport...</option>
          {reports.map(r => <option key={r.id} value={r.id}>{(r.name || `Report ${r.id}`).substring(0, 35)}</option>)}
        </select>
      </td>
    </tr>
  )
}

function ReportRow({ expense }: { expense: Expense }) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)

  function Val({ ok, label }: { ok: boolean; label: string }) {
    if (!ok) return <Dot ok={false} />
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-green-500">✓</span>
        <span className="text-[10px] text-gray-400 max-w-[72px] truncate">{label}</span>
      </div>
    )
  }

  const catLabel = expense.category ? expense.category.substring(0, 14) + '…' : 'Abonnemen…'
  const tagLabel = 'MD00 - Alg…'
  const kpLabel = 'D18JPL - Bu…'
  const recLabel = hasReceipt ? '1 file' : ''

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0 align-middle">
      <td className="px-5 py-2.5 font-medium text-gray-800 max-w-[200px]"><div className="truncate">{expense.description || '—'}</div></td>
      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(expense.date)}</td>
      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{formatAmount(expense.amount, expense.currency)}</td>
      <td className="px-3 py-2.5 text-center"><Val ok={hasCategory} label={catLabel} /></td>
      <td className="px-3 py-2.5 text-center"><Val ok={hasKostendrager} label={tagLabel} /></td>
      <td className="px-3 py-2.5 text-center"><Val ok={hasKostenplaats} label={kpLabel} /></td>
      <td className="px-3 py-2.5 text-center"><Val ok={hasReceipt} label={recLabel} /></td>
    </tr>
  )
}

function Dot({ ok }: { ok: boolean }) {
  if (ok) return <span className="text-green-500">✓</span>
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-amber-400">⊗</span>
      <span className="text-[10px] text-amber-500">Missing</span>
    </div>
  )
}

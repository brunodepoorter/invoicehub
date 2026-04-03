import React, { useState, useMemo } from 'react'
import { ChevronRight, RefreshCw, ExternalLink, Zap } from 'lucide-react'
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
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-400">
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 8h6M5 5h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
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
        <button
          onClick={onRefresh}
          className={cn('p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500', loading && 'opacity-50')}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <a href="https://app.declaree.com" target="_blank" rel="noreferrer">
          <button className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            Open Declaree <ExternalLink size={12} />
          </button>
        </a>
      </div>

      {loading && (
        <div className="px-5 py-8 text-center text-sm text-gray-400">Loading expenses…</div>
      )}

      {!loading && (
        <div>
          {/* Zonder rapport section */}
          {filteredUnreported.length > 0 && (
            <ReportSection
              sectionKey="unreported"
              title={
                <span className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">Zonder Rapport</span>
                  <span className="text-xs text-gray-400 font-normal">Needs assignment</span>
                </span>
              }
              expenseCount={filteredUnreported.length}
              total={unreportedTotal}
              isOpen={openSections.has('unreported')}
              onToggle={() => toggleSection('unreported')}
              isWarning
            >
              <ExpenseTable
                expenses={filteredUnreported}
                reports={reports}
                showAssign
                autofilling={autofilling}
                assigning={assigning}
                onAutoFill={handleAutoFill}
                onAssign={handleAssign}
              />
            </ReportSection>
          )}

          {/* Report sections */}
          {reports.map(report => {
            const exps = (report.expenses || []).filter(filterExp)
            const total = exps.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0)
            return (
              <ReportSection
                key={report.id}
                sectionKey={String(report.id)}
                title={<span className="font-medium text-gray-900">{report.name || `Report ${report.id}`}</span>}
                expenseCount={exps.length}
                total={total}
                isOpen={openSections.has(String(report.id))}
                onToggle={() => toggleSection(String(report.id))}
              >
                <ExpenseTable
                  expenses={exps}
                  reports={reports}
                  showAssign={false}
                  autofilling={autofilling}
                  assigning={assigning}
                  onAutoFill={handleAutoFill}
                  onAssign={handleAssign}
                />
              </ReportSection>
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

// ── Report section wrapper ────────────────────────────────────────────────────
function ReportSection({ sectionKey, title, expenseCount, total, isOpen, onToggle, isWarning, children }: {
  sectionKey: string
  title: React.ReactNode
  expenseCount: number
  total: number
  isOpen: boolean
  onToggle: () => void
  isWarning?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={onToggle}
      >
        <ChevronRight
          size={14}
          className={cn('text-gray-400 transition-transform', isOpen && 'rotate-90')}
        />
        <div className="flex-1">{title}</div>
        <span className="text-xs text-gray-400">{expenseCount} expenses</span>
        <span className="text-sm font-semibold text-gray-800">€{total.toFixed(2)}</span>
      </div>
      {isOpen && children}
    </div>
  )
}

// ── Expense table ─────────────────────────────────────────────────────────────
function ExpenseTable({ expenses, reports, showAssign, autofilling, assigning, onAutoFill, onAssign }: {
  expenses: Expense[]
  reports: Report[]
  showAssign: boolean
  autofilling: Set<number>
  assigning: Set<number>
  onAutoFill: (e: Expense) => void
  onAssign: (e: Expense, reportId: number) => void
}) {
  if (expenses.length === 0) {
    return <div className="px-5 py-6 text-center text-sm text-gray-400">No expenses in this report yet</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-gray-100">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-2">Description</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Date</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Amount</th>
            <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Categorie</th>
            <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Kostendrager</th>
            <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Kostenplaats</th>
            <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Receipt</th>
            {showAssign && (
              <>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">Auto-fill</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2">→ Rapport</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {expenses.map(expense => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              reports={reports}
              showAssign={showAssign}
              isAutofilling={autofilling.has(expense.id)}
              isAssigning={assigning.has(expense.id)}
              onAutoFill={() => onAutoFill(expense)}
              onAssign={(rId) => onAssign(expense, rId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Expense row ───────────────────────────────────────────────────────────────
function ExpenseRow({ expense, reports, showAssign, isAutofilling, isAssigning, onAutoFill, onAssign }: {
  expense: Expense
  reports: Report[]
  showAssign: boolean
  isAutofilling: boolean
  isAssigning: boolean
  onAutoFill: () => void
  onAssign: (reportId: number) => void
}) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)
  const rule = matchRule(expense.description)
  const canAutoFill = !!rule && (!hasCategory || !hasKostendrager || !hasKostenplaats)

  function Check({ ok, label }: { ok: boolean; label?: string }) {
    return ok
      ? <span className="text-green-500 text-base">✓</span>
      : <span className="text-amber-400 text-xs">⊗ Missing</span>
  }

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0">
      <td className="px-5 py-2.5 font-medium text-gray-800 max-w-[200px] truncate">{expense.description || '—'}</td>
      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(expense.date)}</td>
      <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{formatAmount(expense.amount, expense.currency)}</td>
      <td className="px-3 py-2.5 text-center"><Check ok={hasCategory} /></td>
      <td className="px-3 py-2.5 text-center"><Check ok={hasKostendrager} /></td>
      <td className="px-3 py-2.5 text-center"><Check ok={hasKostenplaats} /></td>
      <td className="px-3 py-2.5 text-center">
        {hasReceipt
          ? <span className="text-green-500 text-xs">✓ 1 file</span>
          : <span className="text-amber-400 text-xs">⊗ Missing</span>}
      </td>
      {showAssign && (
        <>
          <td className="px-3 py-2.5">
            {canAutoFill ? (
              <button
                onClick={onAutoFill}
                disabled={isAutofilling}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
              >
                {isAutofilling ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                {rule?.label}
              </button>
            ) : hasCategory && hasKostendrager && hasKostenplaats ? (
              <span className="text-xs text-green-600">✓ Complete</span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </td>
          <td className="px-3 py-2.5">
            <select
              disabled={isAssigning}
              onChange={e => { if (e.target.value) onAssign(parseInt(e.target.value)) }}
              defaultValue=""
              className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-50 max-w-[160px]"
            >
              <option value="">Kies rapport...</option>
              {reports.map(r => (
                <option key={r.id} value={r.id}>{(r.name || `Report ${r.id}`).substring(0, 35)}</option>
              ))}
            </select>
          </td>
        </>
      )}
    </tr>
  )
}

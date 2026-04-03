import React, { useState, useEffect, useCallback } from 'react'
import { LayoutGrid, DollarSign, Zap } from 'lucide-react'
import { StatCard } from './components/StatCard'
import { InvoiceUpload } from './components/InvoiceUpload'
import { DeclareeExpenses } from './components/DeclareeExpenses'
import { getOrganizations, getReports, getReportExpenses, getUnreportedExpenses } from './lib/api'
import type { Organization, Report, Expense } from './lib/types'

export default function App() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgError, setOrgError] = useState('')
  const [reports, setReports] = useState<Report[]>([])
  const [unreported, setUnreported] = useState<Expense[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const allExpenses: Expense[] = [
    ...unreported,
    ...reports.flatMap(r => r.expenses || [])
  ]

  async function init() {
    try {
      const orgs = await getOrganizations()
      const arr = Array.isArray(orgs) ? orgs : (orgs as any).organizations || []
      if (!arr.length) throw new Error('No organization found')
      setOrg(arr[0])
      setInitialized(true)
    } catch (e: any) {
      setOrgError(e.message)
    }
  }

  const loadExpenses = useCallback(async () => {
    if (!org) return
    setLoadingExpenses(true)
    try {
      const [repsRaw, unrep] = await Promise.all([
        getReports(org.id),
        getUnreportedExpenses(org.id),
      ])

      const reps: Report[] = Array.isArray(repsRaw)
        ? repsRaw
        : (repsRaw as any).reports || []

      const unreportedArr: Expense[] = Array.isArray(unrep)
        ? unrep
        : (unrep as any).expenses || []

      // Load expenses for each report in parallel
      const repsWithExpenses = await Promise.all(
        reps.map(async rep => {
          try {
            const exps = await getReportExpenses(rep.id)
            const arr: Expense[] = Array.isArray(exps) ? exps : (exps as any).expenses || []
            return { ...rep, expenses: arr }
          } catch {
            return { ...rep, expenses: [] }
          }
        })
      )

      setReports(repsWithExpenses)
      setUnreported(unreportedArr)
    } catch (e: any) {
      console.error('Failed to load expenses:', e.message)
    } finally {
      setLoadingExpenses(false)
    }
  }, [org])

  useEffect(() => { init() }, [])
  useEffect(() => { if (org) loadExpenses() }, [org])

  const totalUnreported = unreported.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0)

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      <div className="max-w-[1140px] mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[#1a4a7a] flex items-center justify-center text-white font-semibold text-sm">IH</div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-none">InvoiceHub</h1>
            <p className="text-xs text-gray-400 mt-0.5">All your invoices, one place</p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Status"
            value={orgError ? 'Error' : 'Live'}
            sub={orgError || 'Connected to Declaree API'}
            icon={<LayoutGrid size={16} />}
            live={!orgError}
          />
          <StatCard
            label="Declaree org"
            value={org?.name || (orgError ? '—' : 'Loading…')}
            sub={org ? 'Connected' : orgError ? orgError : 'Connecting…'}
            icon={<DollarSign size={16} />}
          />
          <StatCard
            label="Sync"
            value="Real-time"
            sub="AI-powered invoice OCR"
            icon={<Zap size={16} />}
          />
        </div>

        {orgError && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <strong>Connection error:</strong> {orgError}. Check that the server is running and the Declaree API key is valid.
          </div>
        )}

        {initialized && org && (
          <div className="space-y-5">
            <InvoiceUpload
              orgId={org.id}
              allExpenses={allExpenses}
              reports={reports}
              onSubmitDone={loadExpenses}
            />

            <DeclareeExpenses
              orgId={org.id}
              reports={reports}
              unreported={unreported}
              allExpenses={allExpenses}
              loading={loadingExpenses}
              onRefresh={loadExpenses}
            />
          </div>
        )}
      </div>
    </div>
  )
}

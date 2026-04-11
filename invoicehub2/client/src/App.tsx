import React, { useState, useEffect, useCallback } from 'react'
import { Receipt, DollarSign, TrendingUp, Layers, Lock } from 'lucide-react'
import { StatCard } from './components/StatCard'
import { InvoiceUpload } from './components/InvoiceUpload'
import { DeclareeExpenses } from './components/DeclareeExpenses'
import { getOrganizations, getReports, getReportExpenses, getUnreportedExpenses } from './lib/api'
import type { Organization, Report, Expense } from './lib/types'

const PASSWORD = 'Vh9#mKqR2nXpL7wBt4Yd8Fs3Jc6Az1Eg5NhPuQo'
const SESSION_KEY = 'ih_auth'

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  function attempt() {
    if (value === PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setValue('')
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-card p-8 shadow-card">
          <div className="flex justify-center mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Lock className="h-6 w-6" />
            </div>
          </div>
          <h1 className="text-center text-xl font-bold font-display text-foreground mb-1">InvoiceHub</h1>
          <p className="text-center text-xs text-muted-foreground mb-6">Club Brugge — Declaree automation</p>
          <input
            type="password"
            placeholder="Enter password"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            className={`w-full rounded-lg border px-4 py-2.5 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 mb-3 ${error ? 'border-destructive' : 'border-border'}`}
            autoFocus
          />
          {error && <p className="text-xs text-destructive text-center mb-3">Incorrect password</p>}
          <button
            onClick={attempt}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
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
      const reps: Report[] = Array.isArray(repsRaw) ? repsRaw : (repsRaw as any).reports || []
      const unreportedArr: Expense[] = Array.isArray(unrep) ? unrep : (unrep as any).expenses || []
      const repsWithExpenses = await Promise.all(
        reps.map(async rep => {
          try {
            const exps = await getReportExpenses(rep.id)
            const arr: Expense[] = Array.isArray(exps) ? exps : (exps as any).expenses || []
            return { ...rep, expenses: arr }
          } catch { return { ...rep, expenses: [] } }
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

  useEffect(() => { if (authed) init() }, [authed])
  useEffect(() => { if (org) loadExpenses() }, [org])

  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display text-foreground">InvoiceHub</h1>
              <p className="text-xs text-muted-foreground">All your invoices, one place</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard title="Status" value={orgError ? 'Error' : 'Live'} subtitle={orgError || 'Connected to Declaree API'} icon={Layers} index={0} />
          <StatCard title="Declaree Org" value={org?.name || (orgError ? '—' : 'Loading…')} subtitle={org ? 'Connected' : 'Connecting…'} icon={DollarSign} index={1} />
          <StatCard title="Sync" value="Real-time" subtitle="AI-powered invoice OCR" icon={TrendingUp} index={2} />
        </div>

        {orgError && (
          <div className="px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            <strong>Connection error:</strong> {orgError}
          </div>
        )}

        {initialized && org && (
          <>
            <InvoiceUpload orgId={org.id} allExpenses={allExpenses} reports={reports} onSubmitDone={loadExpenses} />
            <DeclareeExpenses orgId={org.id} reports={reports} unreported={unreported} allExpenses={allExpenses} loading={loadingExpenses} onRefresh={loadExpenses} />
          </>
        )}
      </main>
    </div>
  )
}

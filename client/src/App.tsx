import React, { useState, useEffect, useCallback } from 'react'
import { Receipt, DollarSign, TrendingUp, Layers } from 'lucide-react'
import { StatCard } from './components/StatCard'
import { InvoiceUpload } from './components/InvoiceUpload'
import { DeclareeExpenses } from './components/DeclareeExpenses'
import type { Organization, Report, Expense } from './lib/types'
import { getCategories } from './lib/api'

const API = '/api'

async function apiFetch(path: string) {
  const r = await fetch(API + path)
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
}

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
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgError, setOrgError] = useState('')
  const [userId, setUserId] = useState<number | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [unreported, setUnreported] = useState<Expense[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  // category name → id map (built from fetched expenses + categories endpoint)
  const [categoryMap, setCategoryMap] = useState<Record<string, number>>({})

  const allExpenses: Expense[] = [...unreported, ...reports.flatMap(r => r.expenses || [])]

  async function init() {
    try {
      // GET /api/organizations → data.organizations[0]
      const data = await apiFetch('/organizations')
      const orgs = data.organizations || (Array.isArray(data) ? data : [])
      if (!orgs.length) throw new Error('No organization found')
      setOrg(orgs[0])
    } catch (e: any) {
      setOrgError(e.message)
    }
  }

  const loadExpenses = useCallback(async () => {
    if (!org) return
    setLoadingExpenses(true)
    try {
      // 1. Get reports
      const repData = await apiFetch(`/organizations/${org.id}/reports`)
      const allReports: any[] = repData.reports || []
      const openReports = allReports.filter((r: any) => r.state <= 1)

      // 2. Extract userId from report history_items
      let uid: number | null = userId
      if (!uid) {
        for (const report of openReports) {
          const actorId = report?.history_items?.[0]?.actor?.id
          if (actorId) { uid = actorId; setUserId(actorId); break; }
        }
      }

      // 3. Load report expenses in parallel (skip if billCount === 0)
      const repsWithExpenses = await Promise.all(
        openReports.map(async (rep: any) => {
          if (rep.billCount === 0) return { ...rep, expenses: [] }
          try {
            const d = await apiFetch(`/organizations/${org.id}/reports/${rep.id}/expenses`)
            return { ...rep, expenses: d.expenses || [] }
          } catch { return { ...rep, expenses: [] } }
        })
      )

      // 4. Load unreported expenses (requires userId)
      let unreportedList: Expense[] = []
      if (uid) {
        try {
          const d = await apiFetch(`/organizations/${org.id}/users/${uid}/expenses?selection=unreported`)
          unreportedList = d.expenses || []
        } catch {}
      }

      setReports(repsWithExpenses)
      setUnreported(unreportedList)

      // Build category name→id map from expense data + categories endpoint
      const map: Record<string, number> = {}
      const allExp = [...unreportedList, ...repsWithExpenses.flatMap((r: any) => r.expenses || [])]
      allExp.forEach((e: any) => {
        if (e.category && typeof e.category === 'object' && e.category.id && e.category.name) {
          map[e.category.name] = e.category.id
        }
      })
      // Also try the categories endpoint
      try {
        const catData = await getCategories(org.id)
        const cats = catData.expense_categories || catData.categories || []
        cats.forEach((c: { id: number; name: string }) => { map[c.name] = c.id })
      } catch {}
      setCategoryMap(map)
    } catch (e: any) {
      console.error('loadExpenses error:', e.message)
    } finally {
      setLoadingExpenses(false)
    }
  }, [org, userId])

  useEffect(() => { init() }, [])
  useEffect(() => { if (org) loadExpenses() }, [org])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display text-foreground flex items-center gap-2">
                InvoiceHub
                <span className="text-xs font-normal text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">v1.1 · {__COMMIT__}</span>
              </h1>
              <p className="text-xs text-muted-foreground">All your invoices, one place</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Status" value={orgError ? 'Error' : 'Live'} sub={orgError || 'Connected to Declaree API'} icon={<Layers className="h-5 w-5 text-accent" />} live={!orgError} />
          <StatCard label="Declaree Org" value={org?.name || (orgError ? '—' : 'Loading…')} sub={org ? 'Connected' : 'Connecting…'} icon={<DollarSign className="h-5 w-5 text-accent" />} />
          <StatCard label="Sync" value="Real-time" sub="AI-powered invoice OCR" icon={<TrendingUp className="h-5 w-5 text-accent" />} />
        </div>

        {orgError && (
          <div className="px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            Connection error: {orgError}
          </div>
        )}

        {org && (
          <>
            <InvoiceUpload
              orgId={org.id}
              allExpenses={allExpenses}
              reports={reports}
              categoryMap={categoryMap}
              onSubmitDone={loadExpenses}
            />
            <DeclareeExpenses
              orgId={org.id}
              reports={reports}
              unreported={unreported}
              allExpenses={allExpenses}
              loading={loadingExpenses}
              categoryMap={categoryMap}
              onRefresh={loadExpenses}
            />
          </>
        )}
      </main>
    </div>
  )
}

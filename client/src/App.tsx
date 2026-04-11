import React, { useState, useEffect, useCallback } from 'react'
import { Receipt, DollarSign, TrendingUp, Layers } from 'lucide-react'
import { StatCard } from './components/StatCard'
import { InvoiceUpload } from './components/InvoiceUpload'
import { DeclareeExpenses } from './components/DeclareeExpenses'
import type { Organization, Report, Expense } from './lib/types'

const API = '/api'

async function apiFetch(path: string) {
  const r = await fetch(API + path)
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
}

export default function App() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgError, setOrgError] = useState('')
  const [userId, setUserId] = useState<number | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [unreported, setUnreported] = useState<Expense[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)

  const allExpenses: Expense[] = [...unreported, ...reports.flatMap(r => r.expenses || [])]

  async function init() {
    try {
      const data = await apiFetch('/organizations')
      const orgs = data.organizations || (Array.isArray(data) ? data : [])
      if (!orgs.length) throw new Error('No organization found')
      setOrg(orgs[0])
    } catch (e: any) { setOrgError(e.message) }
  }

  const loadExpenses = useCallback(async () => {
    if (!org) return
    setLoadingExpenses(true)
    try {
      const repData = await apiFetch(`/organizations/${org.id}/reports`)
      const allReports: any[] = repData.reports || []
      const openReports = allReports.filter((r: any) => r.state <= 1)
      let uid: number | null = userId
      if (!uid) {
        for (const report of openReports) {
          const actorId = report?.history_items?.[0]?.actor?.id
          if (actorId) { uid = actorId; setUserId(actorId); break; }
        }
      }
      const repsWithExpenses = await Promise.all(
        openReports.map(async (rep: any) => {
          if (rep.billCount === 0) return { ...rep, expenses: [] }
          try {
            const d = await apiFetch(`/organizations/${org.id}/reports/${rep.id}/expenses`)
            return { ...rep, expenses: d.expenses || [] }
          } catch { return { ...rep, expenses: [] } }
        })
      )
      let unreportedList: Expense[] = []
      if (uid) {
        try {
          const d = await apiFetch(`/organizations/${org.id}/users/${uid}/expenses?selection=unreported`)
          unreportedList = d.expenses || []
        } catch {}
      }
      setReports(repsWithExpenses)
      setUnreported(unreportedList)
    } catch (e: any) {
      console.error('loadExpenses error:', e.message)
    } finally { setLoadingExpenses(false) }
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
              <h1 className="text-lg font-bold font-display text-foreground">InvoiceHub</h1>
              <p className="text-xs text-muted-foreground">All your invoices, one place</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Status" value={orgError ? 'Error' : 'Live'} sub={orgError || 'Connected to Declaree API'} icon={<Layers className="h-5&�-5 text-accent" />} live={!orgError} />
          <StatCard label="Declaree Org" value={org?.name || (orgError ? '—' : 'Loading…')} sub={org ? 'Connected' : 'Connecting…'} icon={<DollarSign className="h-5 w-5 text-accent" />} />
          <StatCard label="Sync" value="Real-time" sub="AI-powered invoice OCR" icon={<TrendingUp className="h-5 w-5 text-accent" />} />
        </div>
        {orgError && <div className="px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">Connection error: {orgError}</div>}
        {org && (<>
          <InvoiceUpload orgId={org.id} allExpenses={allExpenses} reports={reports} onSubmitDone={loadExpenses} />
          <DeclareeExpenses orgId={org.id} reports={reports} unreported={unreported} allExpenses={allExpenses} loading={loadingExpenses} onRefresh={loadExpenses} />
        </>)}
      </main>
    </div>
  )
}

import React from 'react'

interface Props {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  live?: boolean
}

export function StatCard({ label, value, sub, icon, live }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="mt-2 flex items-center gap-2">
            {live && <span className="w-2 h-2 rounded-full bg-accent inline-block" />}
            <p className="text-2xl font-bold font-display text-foreground">{value}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className="rounded-lg bg-accent/10 p-2.5">{icon}</div>
      </div>
    </div>
  )
}

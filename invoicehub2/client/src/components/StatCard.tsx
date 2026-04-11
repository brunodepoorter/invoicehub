import React from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  index: number
}

export function StatCard({ title, value, subtitle, icon: Icon, index }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-2xl font-bold font-display text-foreground">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-lg bg-accent/10 p-2.5">
          <Icon className="h-5 w-5 text-accent" />
        </div>
      </div>
    </div>
  )
}

export default StatCard

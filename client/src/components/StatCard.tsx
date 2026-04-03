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
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="flex items-center gap-2">
        {live && <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />}
        <span className="text-xl font-semibold text-gray-900">{value}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  )
}

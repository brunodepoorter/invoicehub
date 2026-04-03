import React from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import type { Expense } from '../lib/types'
import { expenseCompleteness } from '../lib/utils'

interface Props {
  expense: Expense
}

function Indicator({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {ok
        ? <CheckCircle size={14} className="text-green-500" />
        : <XCircle size={14} className="text-amber-400" />}
      <span className={`text-[10px] ${ok ? 'text-green-600' : 'text-amber-500'}`}>
        {ok ? '✓' : 'Missing'}
      </span>
    </div>
  )
}

export function CompletenessIndicators({ expense }: Props) {
  const { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt } = expenseCompleteness(expense)
  return (
    <div className="flex gap-3">
      <Indicator ok={hasCategory} label="Categorie" />
      <Indicator ok={hasKostendrager} label="Kostendrager" />
      <Indicator ok={hasKostenplaats} label="Kostenplaats" />
      <Indicator ok={hasReceipt} label="Receipt" />
    </div>
  )
}

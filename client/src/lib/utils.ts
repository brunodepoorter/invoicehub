import type { Expense } from './types'
import { KOSTENPLAATS_FIELD_ID } from './rules'

export function formatDate(d: string | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

export function formatAmount(amount: number | string | undefined, currency?: string): string {
  if (amount == null || amount === '') return '—'
  const n = parseFloat(String(amount))
  if (isNaN(n)) return String(amount)
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€'
  return `${sym}${n.toFixed(2)}`
}

export function expenseCompleteness(e: Expense) {
  return {
    hasCategory: !!(e.category_id || e.category),
    hasKostendrager: !!(e.tag1_id || (e.tags && e.tags.length > 0)),
    hasKostenplaats: !!(e.field_values?.some(f => f.field_id === KOSTENPLAATS_FIELD_ID)),
    hasReceipt: !!(e.attachment_count && e.attachment_count > 0 || e.has_attachment),
  }
}

export function isFullyComplete(e: Expense): boolean {
  const c = expenseCompleteness(e)
  return c.hasCategory && c.hasKostendrager && c.hasKostenplaats && c.hasReceipt
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

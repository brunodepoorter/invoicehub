import type { Expense } from './types'

export function formatDate(d: string | undefined): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export function formatAmount(amount: number | string | undefined, currency?: string): string {
  if (amount == null || amount === '') return '—'
  const n = parseFloat(String(amount))
  if (isNaN(n)) return String(amount)
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€'
  return `${sym}${n.toFixed(2)}`
}

export function getExpenseDate(e: Expense): string {
  return e.expense_date || e.date || ''
}

export function expenseCompleteness(e: Expense) {
  const hasCategory = !!(e.category && (typeof e.category === 'string' ? e.category : e.category.name))
  const hasKostendrager = !!(e.tag1 && (typeof e.tag1 === 'string' ? e.tag1 : e.tag1.name))
  const hasKostenplaats = !!(
    e.field_values?.some(fv => fv.field?.name === 'Kostenplaats' && (fv.option || fv.value)) ||
    e.custom_fields?.some(cf => cf.name === 'Kostenplaats' && cf.value)
  )
  const hasReceipt = !!(expense.resources && e.resources.length > 0)
  return { hasCategory, hasKostendrager, hasKostenplaats, hasReceipt }
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

export interface Organization {
  id: number
  name: string
}

export interface FieldValue {
  field_id?: number
  field?: { name: string }
  option?: { name: string }
  option_id?: number
  value?: string
}

export interface Resource {
  id: number
  filename?: string
  url?: string
}

export interface Expense {
  id: number
  description: string
  amount: number | string
  currency: string
  expense_date: string
  date?: string
  category?: { id: number; name: string } | string
  tag1?: { id: number; name: string } | string
  field_values?: FieldValue[]
  custom_fields?: { name: string; value?: string }[]
  resources?: Resource[]
  report?: { id: number; name: string } | null
  user_id?: number
  state?: number
}

export interface Report {
  id: number
  name: string
  state: number
  value?: number
  billCount?: number
  expenses?: Expense[]
  user?: { fullName: string; email: string; id?: number }
  history_items?: { actor?: { id: number } }[]
}

export interface OcrResult {
  total_amount: string
  currency: string
  date: string
  description: string
}

export type InvoiceStatus = 'pending' | 'scanning' | 'ready' | 'matching' | 'submitting' | 'done' | 'error'

export interface SplitMatch {
  expense: Expense
  selected: boolean
}

export interface InvoiceItem {
  id: string
  file: File
  status: InvoiceStatus
  ocr: OcrResult
  rule: AutoFillRule | null
  splitMatches: SplitMatch[]
  splitSumOk: boolean | null
  errorMsg: string
  submitMsg: string
}

export interface AutoFillRule {
  label: string
  category: string
  cat_code: string
}

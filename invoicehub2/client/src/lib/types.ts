export interface Organization {
  id: number
  name: string
}

export interface User {
  id: number
  name: string
  email: string
}

export interface FieldValue {
  field_id: number
  option_id?: number
  value?: string
}

export interface Expense {
  id: number
  description: string
  amount: number | string
  currency: string
  date: string
  category?: string
  category_id?: number
  tag1_id?: number
  tags?: { id: number; name: string }[]
  field_values?: FieldValue[]
  attachment_count?: number
  has_attachment?: boolean
  report_id?: number
  state?: number
}

export interface Report {
  id: number
  name: string
  state: number
  expenses?: Expense[]
  total?: number
}

export interface OcrResult {
  total_amount: string
  currency: string
  date: string
  description: string
}

export type InvoiceStatus =
  | 'pending'
  | 'scanning'
  | 'ready'
  | 'matching'
  | 'submitting'
  | 'done'
  | 'error'

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

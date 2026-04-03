import type { Organization, User, Report, Expense, OcrResult, FieldValue } from './types'

const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const r = await fetch(BASE + path, opts)
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error || data?.message || `API error ${r.status}`)
  return data as T
}

const get = <T>(path: string) => request<T>('GET', path)
const post = <T>(path: string, body: unknown) => request<T>('POST', path, body)
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body)
const del = <T>(path: string) => request<T>('DELETE', path)

// Organizations
export const getOrganizations = () => get<Organization[]>('/organizations')

export const getUsers = (orgId: number) =>
  get<User[]>(`/organizations/${orgId}/users`)

// Reports
export const getReports = (orgId: number, state = '0,1') =>
  get<Report[]>(`/organizations/${orgId}/reports?state=${state}`)

export const getReportExpenses = (reportId: number) =>
  get<Expense[]>(`/reports/${reportId}/expenses`)

// Expenses
export const getUnreportedExpenses = (orgId: number) =>
  get<Expense[]>(`/organizations/${orgId}/expenses?selection=unreported`)

export const getOrgExpenses = (orgId: number) =>
  get<Expense[]>(`/organizations/${orgId}/expenses`)

export const createExpense = (body: Partial<Expense> & { organization_id: number }) =>
  post<Expense>('/expenses', body)

export const updateExpense = (expId: number, body: Partial<Expense> & { field_values?: FieldValue[] }) =>
  put<Expense>(`/expenses/${expId}`, body)

export const deleteExpense = (expId: number) =>
  del<void>(`/expenses/${expId}`)

export const assignExpenseToReport = (expId: number, reportId: number) =>
  put<Expense>(`/expenses/${expId}/report`, { report_id: reportId })

// Attachments
export const uploadAttachment = (expId: number, base64: string, filename: string, contentType: string) =>
  post<{ id: number }>(`/expenses/${expId}/attachments`, {
    filename,
    content_type: contentType,
    data: base64,
  })

// OCR
export const runOcr = (base64: string, mimeType: string, filename: string) =>
  post<OcrResult>('/ocr', { data: base64, mime_type: mimeType, filename })

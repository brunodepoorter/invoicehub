import type { Organization, Report, Expense } from './types'

const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error || `API error ${r.status}`)
  return data as T
}

export const getOrganizations = () => req<{ organizations: Organization[] }>('GET', '/organizations')
export const getCategories = (orgId: number) =>
  req<{ expense_categories?: { id: number; name: string }[]; categories?: { id: number; name: string }[] }>('GET', `/organizations/${orgId}/categories`)
export const getReports = (orgId: number) => req<{ reports: Report[] }>('GET', `/organizations/${orgId}/reports`)
export const getReportExpenses = (orgId: number, reportId: number) => req<{ expenses: Expense[] }>('GET', `/organizations/${orgId}/reports/${reportId}/expenses`)
export const getUserExpenses = (orgId: number, userId: number, selection?: string) =>
  req<{ expenses: Expense[] }>('GET', `/organizations/${orgId}/users/${userId}/expenses${selection ? `?selection=${selection}` : ''}`)
export const createExpense = (orgId: number, body: any) => req<Expense>('POST', `/organizations/${orgId}/expenses`, body)
export const updateExpense = (orgId: number, expId: number, body: any) => req<Expense>('PUT', `/organizations/${orgId}/expenses/${expId}`, body)
export const assignToReport = (orgId: number, expId: number, reportId: number) =>
  req<Expense>('PUT', `/organizations/${orgId}/expenses/${expId}/report`, { reportId })
export const uploadReceipt = (orgId: number, expId: number, fileBase64: string, fileName: string, mimeType: string) =>
  req<any>('POST', `/organizations/${orgId}/expenses/${expId}/resources`, { fileBase64, fileName, mimeType })
export const runOcr = (fileBase64: string, mimeType: string, fileName: string) =>
  req<{ success: boolean; data: { total_amount: string; currency: string; date: string; description: string } }>('POST', '/ocr', { fileBase64, mimeType, fileName })

import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp } from 'lucide-react'
import type { InvoiceItem, OcrResult, SplitMatch, Expense } from '../lib/types'
import { matchRule, isGoogleAds, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { runOcr, createExpense, updateExpense, uploadReceipt, getUserExpenses } from '../lib/api'
import { fileToBase64, formatAmount, getExpenseDate, cn } from '../lib/utils'

interface Props {
  orgId: number
  allExpenses: Expense[]
  reports: import('../lib/types').Report[]
  onSubmitDone: () => void
}

export function InvoiceUpload({ orgId, allExpenses, reports, onSubmitDone }: Props) {
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function updateOcr(id: string, patch: Partial<OcrResult>) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const ocr = { ...i.ocr, ...patch }
      return { ...i, ocr, rule: matchRule(ocr.description) }
    }))
  }

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(f => processFile(f))
  }, [orgId])

  async function processFile(file: File) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item: InvoiceItem = {
      id, file, status: 'scanning',
      ocr: { total_amount: '', currency: 'EUR', date: '', description: '' },
      rule: null, splitMatches: [], splitSumOk: null, errorMsg: '', submitMsg: '',
    }
    setItems(prev => [item, ...prev])

    try {
      const b64 = await fileToBase64(file)
      const ocrRes = await runOcr(b64, file.type, file.name)
      const ocr = ocrRes.data
      const rule = matchRule(ocr.description)

      let splitMatches: SplitMatch[] = []
      let splitSumOk: boolean | null = null
      let status: InvoiceItem['status'] = 'ready'

      if (rule && isGoogleAds(ocr.description) && ocr.date) {
        status = 'matching'
        setItems(prev => prev.map(i => i.id === id ? { ...i, status, ocr, rule } : i))
        try {
          // Find userId from allExpenses or reports
          const userId = (allExpenses[0] as any)?.user_id
          if (userId) {
            const month = ocr.date.substring(0, 7)
            const d = await getUserExpenses(orgId, userId, 'unreported')
            const matched = (d.expenses || []).filter((e: Expense) =>
              /google.*ads|google\*ads/i.test(e.description || '') &&
              getExpenseDate(e).startsWith(month)
            )
            splitMatches = matched.map((e: Expense) => ({ expense: e, selected: true }))
            if (splitMatches.length > 0) {
              const sum = splitMatches.reduce((s, m) => s + parseFloat(String(m.expense.amount) || '0'), 0)
              splitSumOk = Math.abs(sum - parseFloat(ocr.total_amount || '0')) <= 1
            }
          }
        } catch {}
        status = 'ready'
      }

      setItems(prev => prev.map(i => i.id === id ? { ...i, status, ocr, rule, splitMatches, splitSumOk } : i))
    } catch (e: any) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'error', errorMsg: e.message } : i))
    }
  }

  async function submitItem(id: string) {
    const item = items.find(i => i.id === id)
    if (!item) return
    updateItem(id, { status: 'submitting', errorMsg: '' })

    try {
      const b64 = await fileToBase64(item.file)
      const isGSplit = item.splitMatches.length > 0

      if (isGSplit) {
        const selected = item.splitMatches.filter(m => m.selected)
        for (const m of selected) {
          await uploadReceipt(orgId, m.expense.id, b64, item.file.name, item.file.type)
          await updateExpense(orgId, m.expense.id, {
            category: item.rule?.category || 'CMH Content marketing',
            tag1_id: TAG1_ID,
            field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
          })
        }
        updateItem(id, { status: 'done', submitMsg: `Receipt + auto-fill applied to ${selected.length} Google Ads expenses` })
      } else {
        const basePayload = {
          description: item.ocr.description,
          amount: parseFloat(item.ocr.total_amount) || 0,
          currency: item.ocr.currency || 'EUR',
          expense_date: item.ocr.date,
        }

        // Dedup by description + date
        const existing = allExpenses.find(e =>
          (e.description || '').toLowerCase() === (item.ocr.description || '').toLowerCase() &&
          getExpenseDate(e).startsWith((item.ocr.date || '').substring(0, 10))
        )

        let expId: number
        let wasExisting = false
        if (existing) {
          await updateExpense(orgId, existing.id, basePayload)
          expId = existing.id
          wasExisting = true
        } else {
          const created = await createExpense(orgId, basePayload)
          expId = (created as any).id || (created as any).expense?.id
        }

        // Auto-fill in separate PUT
        if (item.rule) {
          await updateExpense(orgId, expId, {
            category: item.rule.category,
            tag1_id: TAG1_ID,
            field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
          })
        }

        // Upload receipt
        await uploadReceipt(orgId, expId, b64, item.file.name, item.file.type)

        updateItem(id, {
          status: 'done',
          submitMsg: wasExisting ? 'Updated + auto-fill + receipt' : 'Created + auto-fill + receipt',
        })
      }
      onSubmitDone()
    } catch (e: any) {
      updateItem(id, { status: 'error', errorMsg: e.message })
    }
  }

  function toggleSplit(itemId: string, expId: number) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      return { ...i, splitMatches: i.splitMatches.map(m => m.expense.id === expId ? { ...m, selected: !m.selected } : m) }
    }))
  }

  return (
    <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upload invoices to Declaree</span>
      </div>

      <div
        className={cn('mx-5 my-4 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-secondary/30')}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Drop invoice files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG — AI extracts amount & date, auto-fills fields. Google Ads invoices auto-match split payments.</p>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" multiple
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <div className="px-5 pb-4 space-y-3">
          {items.map(item => (
            <InvoiceCard key={item.id} item={item} reports={reports}
              onRemove={() => setItems(prev => prev.filter(i => i.id !== item.id))}
              onOcrChange={patch => updateOcr(item.id, patch)}
              onSubmit={() => submitItem(item.id)}
              onToggleSplit={expId => toggleSplit(item.id, expId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InvoiceCard({ item, reports, onRemove, onOcrChange, onSubmit, onToggleSplit }: {
  item: InvoiceItem; reports: any[]; onRemove: () => void
  onOcrChange: (p: Partial<OcrResult>) => void; onSubmit: () => void; onToggleSplit: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isLoading = ['scanning','matching','submitting'].includes(item.status)
  const isDone = item.status === 'done'
  const isReady = item.status === 'ready'

  const statusColors: Record<string, string> = {
    scanning: 'bg-warning/10 text-warning', matching: 'bg-warning/10 text-warning',
    ready: 'bg-accent/10 text-accent', submitting: 'bg-primary/10 text-primary',
    done: 'bg-accent/10 text-accent', error: 'bg-destructive/10 text-destructive',
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border-b border-border">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">{item.file.name}</span>
        {item.rule && <span className="text-xs text-accent font-medium shrink-0">→ {item.rule.label}</span>}
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', statusColors[item.status] || '')}>
          {isLoading && <Loader className="inline h-3 w-3 animate-spin mr-1" />}
          {item.status}
        </span>
        <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
      </div>

      {isLoading && <div className="h-0.5 bg-muted"><div className="h-full bg-accent w-2/3 animate-pulse" /></div>}

      {expanded && (
        <>
          <div className="grid grid-cols-4 gap-3 px-4 py-3">
            {(['total_amount','currency','date','description'] as const).map(key => (
              <div key={key}>
                <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">{key === 'total_amount' ? 'Amount' : key}</label>
                <input type={key === 'date' ? 'date' : 'text'} value={item.ocr[key]} disabled={isDone}
                  onChange={e => onOcrChange({ [key]: e.target.value })}
                  className="w-full text-sm px-2.5 py-1.5 border border-border rounded-md bg-card text-foreground focus:outline-none focus:border-accent disabled:opacity-50" />
              </div>
            ))}
          </div>

          {item.rule && (
            <div className="mx-4 mb-3 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg text-xs text-accent">
              <span className="font-medium">Auto-fill:</span> Categorie → {item.rule.category} · Kostendrager → MD00 - Algemeen · Kostenplaats → D18JPL
            </div>
          )}

          {item.splitMatches.length > 0 && (
            <div className="mx-4 mb-3 border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Split matches ({item.splitMatches.length})</span>
                {item.splitSumOk !== null && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', item.splitSumOk ? 'bg-accent/10 text-accent' : 'bg-destructive/10 text-destructive')}>
                    {item.splitSumOk ? '✓ Totals match' : '⚠ Mismatch'}
                  </span>
                )}
              </div>
              {item.splitMatches.map(m => (
                <label key={m.expense.id} className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/30 cursor-pointer border-b border-border last:border-0">
                  <input type="checkbox" checked={m.selected} onChange={() => onToggleSplit(m.expense.id)} />
                  <span className="text-xs text-foreground flex-1 truncate">{m.expense.description}</span>
                  <span className="text-xs font-medium text-foreground">{formatAmount(m.expense.amount, m.expense.currency)}</span>
                </label>
              ))}
            </div>
          )}

          {item.status === 'error' && item.errorMsg && (
            <div className="mx-4 mb-3 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{item.errorMsg}
            </div>
          )}

          <div className="flex items-center gap-3 px-4 pb-3">
            {isReady && (
              <button onClick={onSubmit}
                className="px-4 py-1.5 bg-accent text-accent-foreground text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors">
                Submit to Declaree →
              </button>
            )}
            {isDone && (
              <div className="flex items-center gap-1.5 text-sm text-accent">
                <CheckCircle className="h-4 w-4" />{item.submitMsg || 'Submitted successfully'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

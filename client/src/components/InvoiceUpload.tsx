import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { InvoiceItem, OcrResult, SplitMatch, Expense } from '../lib/types'
import { matchRule, isGoogleAds, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { runOcr, updateExpense, uploadReceipt, getUserExpenses } from '../lib/api'
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

  // Find the single best-matching unreported expense by amount + month
  function findMatchingExpense(ocr: OcrResult): Expense | null {
    const unreported = allExpenses.filter(e => !e.report)
    const ocrAmount = parseFloat(ocr.total_amount)
    const ocrMonth = ocr.date?.substring(0, 7)
    if (!ocrAmount || !ocrMonth) return null

    const matches = unreported.filter(e => {
      const expAmount = parseFloat(String(e.amount))
      const expMonth = getExpenseDate(e).substring(0, 7)
      const amountOk = Math.abs(expAmount - ocrAmount) / ocrAmount <= 0.02 // 2% tolerance
      return amountOk && expMonth === ocrMonth
    })
    return matches.length === 1 ? matches[0] : null
  }

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(f => processFile(f))
  }, [allExpenses, orgId])

  async function processFile(file: File) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item: InvoiceItem = {
      id, file, status: 'scanning',
      ocr: { total_amount: '', currency: 'EUR', date: '', description: '' },
      rule: null, matchedExpense: null, splitMatches: [], splitSumOk: null, errorMsg: '', submitMsg: '',
    }
    setItems(prev => [item, ...prev])

    try {
      const b64 = await fileToBase64(file)
      const ocrRes = await runOcr(b64, file.type, file.name)
      const ocr = ocrRes.data
      const rule = matchRule(ocr.description)

      let splitMatches: SplitMatch[] = []
      let splitSumOk: boolean | null = null
      let matchedExpense: Expense | null = null
      let status: InvoiceItem['status'] = 'ready'

      if (rule && isGoogleAds(ocr.description) && ocr.date) {
        // Google Ads: one invoice covers multiple split CC charges
        status = 'matching'
        setItems(prev => prev.map(i => i.id === id ? { ...i, status, ocr, rule } : i))
        try {
          const userId = (allExpenses.find(e => (e as any).user_id) as any)?.user_id
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
      } else {
        // All other invoices: match to a single existing expense by amount + month
        matchedExpense = findMatchingExpense(ocr)
      }

      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, status, ocr, rule, matchedExpense, splitMatches, splitSumOk } : i
      ))
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
        // Google Ads: apply receipt + auto-fill to each selected split expense
        const selected = item.splitMatches.filter(m => m.selected)
        for (const m of selected) {
          await uploadReceipt(orgId, m.expense.id, b64, item.file.name, item.file.type)
          if (item.rule) {
            await updateExpense(orgId, m.expense.id, {
              category: item.rule.category,
              tag1_id: TAG1_ID,
              field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
            })
          }
        }
        updateItem(id, {
          status: 'done',
          submitMsg: `Receipt + auto-fill applied to ${selected.length} Google Ads expense${selected.length !== 1 ? 's' : ''}`,
        })
      } else if (item.matchedExpense) {
        // Standard: upload receipt + auto-fill to matched expense
        await uploadReceipt(orgId, item.matchedExpense.id, b64, item.file.name, item.file.type)
        if (item.rule) {
          await updateExpense(orgId, item.matchedExpense.id, {
            category: item.rule.category,
            tag1_id: TAG1_ID,
            field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
          })
        }
        updateItem(id, { status: 'done', submitMsg: 'Receipt uploaded + auto-fill applied' })
      } else {
        throw new Error('No matching expense selected. Pick one from the list below.')
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

  function selectMatchedExpense(itemId: string, expense: Expense | null) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, matchedExpense: expense } : i))
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
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG — AI matches invoice to existing Declaree expense, auto-fills fields and attaches receipt. Google Ads invoices auto-match split payments.</p>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" multiple
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <div className="px-5 pb-4 space-y-3">
          {items.map(item => (
            <InvoiceCard key={item.id} item={item} allExpenses={allExpenses}
              onRemove={() => setItems(prev => prev.filter(i => i.id !== item.id))}
              onOcrChange={patch => updateOcr(item.id, patch)}
              onSubmit={() => submitItem(item.id)}
              onToggleSplit={expId => toggleSplit(item.id, expId)}
              onSelectMatch={expense => selectMatchedExpense(item.id, expense)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InvoiceCard({ item, allExpenses, onRemove, onOcrChange, onSubmit, onToggleSplit, onSelectMatch }: {
  item: InvoiceItem
  allExpenses: Expense[]
  onRemove: () => void
  onOcrChange: (p: Partial<OcrResult>) => void
  onSubmit: () => void
  onToggleSplit: (id: number) => void
  onSelectMatch: (e: Expense | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const isLoading = ['scanning', 'matching', 'submitting'].includes(item.status)
  const isDone = item.status === 'done'
  const isReady = item.status === 'ready'
  const isGSplit = item.splitMatches.length > 0

  // Unreported candidates for manual match
  const unreported = allExpenses.filter(e => !e.report)
  const ocrMonth = item.ocr.date?.substring(0, 7)
  const sameMonthCandidates = ocrMonth
    ? unreported.filter(e => getExpenseDate(e).startsWith(ocrMonth))
    : unreported
  const displayCandidates = showAll ? unreported : sameMonthCandidates

  const canSubmit = isReady && (
    item.matchedExpense !== null ||
    item.splitMatches.filter(m => m.selected).length > 0
  )

  const statusColors: Record<string, string> = {
    scanning: 'bg-warning/10 text-warning',
    matching: 'bg-warning/10 text-warning',
    ready: 'bg-accent/10 text-accent',
    submitting: 'bg-primary/10 text-primary',
    done: 'bg-accent/10 text-accent',
    error: 'bg-destructive/10 text-destructive',
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
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
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="h-0.5 bg-muted">
          <div className="h-full bg-accent w-2/3 animate-pulse" />
        </div>
      )}

      {expanded && (
        <>
          {/* OCR fields */}
          <div className="grid grid-cols-4 gap-3 px-4 py-3">
            {(['total_amount', 'currency', 'date', 'description'] as const).map(key => (
              <div key={key}>
                <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
                  {key === 'total_amount' ? 'Amount' : key}
                </label>
                <input
                  type={key === 'date' ? 'date' : 'text'}
                  value={item.ocr[key]}
                  disabled={isDone}
                  onChange={e => onOcrChange({ [key]: e.target.value })}
                  className="w-full text-sm px-2.5 py-1.5 border border-border rounded-md bg-card text-foreground focus:outline-none focus:border-accent disabled:opacity-50"
                />
              </div>
            ))}
          </div>

          {/* Auto-fill preview */}
          {item.rule && (
            <div className="mx-4 mb-3 px-3 py-2 bg-accent/5 border border-accent/20 rounded-lg text-xs text-accent">
              <span className="font-medium">Auto-fill:</span> Categorie → {item.rule.category} · Kostendrager → MD00 - Algemeen · Kostenplaats → D18JPL
            </div>
          )}

          {/* Google Ads: split matches */}
          {isGSplit && (
            <div className="mx-4 mb-3 border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Split matches ({item.splitMatches.length})</span>
                {item.splitSumOk !== null && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                    item.splitSumOk ? 'bg-accent/10 text-accent' : 'bg-destructive/10 text-destructive')}>
                    {item.splitSumOk ? '✓ Totals match' : '⚠ Mismatch'}
                  </span>
                )}
              </div>
              {item.splitMatches.map(m => (
                <label key={m.expense.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-secondary/30 cursor-pointer border-b border-border last:border-0">
                  <input type="checkbox" checked={m.selected} onChange={() => onToggleSplit(m.expense.id)} />
                  <span className="text-xs text-foreground flex-1 truncate">{m.expense.description}</span>
                  <span className="text-xs font-medium text-foreground">{formatAmount(m.expense.amount, m.expense.currency)}</span>
                </label>
              ))}
            </div>
          )}

          {/* Standard: single expense match */}
          {!isGSplit && item.ocr.total_amount && (
            <div className="mx-4 mb-3">
              {item.matchedExpense ? (
                /* Matched — show the expense */
                <div className="border border-accent/30 bg-accent/5 rounded-lg px-3 py-2.5 flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.matchedExpense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {getExpenseDate(item.matchedExpense)} · {formatAmount(item.matchedExpense.amount, item.matchedExpense.currency)}
                    </p>
                  </div>
                  <span className="text-xs text-accent font-medium shrink-0">matched</span>
                  {!isDone && (
                    <button onClick={() => onSelectMatch(null)}
                      className="text-xs text-muted-foreground hover:text-destructive ml-1">
                      ×
                    </button>
                  )}
                </div>
              ) : (
                /* No match — show candidate list for manual selection */
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-secondary/50 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Search className="h-3 w-3" />
                      <span>
                        No auto-match — select manually
                        {ocrMonth ? ` (${ocrMonth})` : ''}
                      </span>
                    </div>
                    {sameMonthCandidates.length < unreported.length && (
                      <button onClick={() => setShowAll(v => !v)}
                        className="text-xs text-accent hover:underline shrink-0">
                        {showAll ? 'show less' : `show all (${unreported.length})`}
                      </button>
                    )}
                  </div>
                  {displayCandidates.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No unreported expenses found.</p>
                  ) : (
                    displayCandidates.slice(0, 15).map(e => (
                      <button key={e.id} onClick={() => onSelectMatch(e)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent/5 border-b border-border last:border-0 text-left transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{e.description}</p>
                          <p className="text-xs text-muted-foreground">{getExpenseDate(e)}</p>
                        </div>
                        <span className="text-xs font-medium text-foreground shrink-0">
                          {formatAmount(e.amount, e.currency)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {item.status === 'error' && item.errorMsg && (
            <div className="mx-4 mb-3 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-lg text-xs text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {item.errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 px-4 pb-3">
            {isReady && canSubmit && (
              <button onClick={onSubmit}
                className="px-4 py-1.5 bg-accent text-accent-foreground text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors">
                Apply receipt & auto-fill →
              </button>
            )}
            {isReady && !canSubmit && item.ocr.total_amount && !isGSplit && (
              <p className="text-xs text-muted-foreground italic">Select a matching expense above to continue</p>
            )}
            {isDone && (
              <div className="flex items-center gap-1.5 text-sm text-accent">
                <CheckCircle className="h-4 w-4" />
                {item.submitMsg || 'Applied successfully'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

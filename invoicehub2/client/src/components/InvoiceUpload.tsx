import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp } from 'lucide-react'
import type { InvoiceItem, OcrResult, SplitMatch } from '../lib/types'
import { matchRule, isGoogleAds, TAG1_ID, KOSTENPLAATS_FIELD_ID, KOSTENPLAATS_OPTION_ID } from '../lib/rules'
import { runOcr, createExpense, updateExpense, uploadAttachment, getUnreportedExpenses } from '../lib/api'
import { fileToBase64, formatAmount, cn } from '../lib/utils'

interface Props {
  orgId: number
  allExpenses: import('../lib/types').Expense[]
  reports: import('../lib/types').Report[]
  onSubmitDone: () => void
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', scanning: 'Scanning…', ready: 'Ready',
  matching: 'Matching…', submitting: 'Submitting…', done: 'Submitted', error: 'Error'
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
    const arr = Array.from(files)
    arr.forEach(file => processFile(file))
  }, [orgId, allExpenses])

  async function processFile(file: File) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item: InvoiceItem = {
      id, file,
      status: 'scanning',
      ocr: { total_amount: '', currency: 'EUR', date: '', description: '' },
      rule: null,
      splitMatches: [],
      splitSumOk: null,
      errorMsg: '',
      submitMsg: '',
    }
    setItems(prev => [item, ...prev])

    try {
      const b64 = await fileToBase64(file)
      const ocr = await runOcr(b64, file.type, file.name)
      const rule = matchRule(ocr.description)

      let splitMatches: SplitMatch[] = []
      let splitSumOk: boolean | null = null
      let status: InvoiceItem['status'] = 'ready'

      if (rule && isGoogleAds(ocr.description) && ocr.date) {
        status = 'matching'
        setItems(prev => prev.map(i => i.id === id ? { ...i, status, ocr, rule } : i))
        try {
          const month = ocr.date.substring(0, 7)
          const unreported = await getUnreportedExpenses(orgId)
          const matched = unreported.filter(e =>
            /google[\s*]?ads|google\*ads/i.test(e.description || '') &&
            (e.date || '').startsWith(month)
          )
          splitMatches = matched.map(e => ({ expense: e, selected: true }))
          if (splitMatches.length > 0) {
            const sum = splitMatches.reduce((s, m) => s + parseFloat(String(m.expense.amount) || '0'), 0)
            const inv = parseFloat(ocr.total_amount || '0')
            splitSumOk = Math.abs(sum - inv) <= 1
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
        // Google Ads split: attach receipt + apply auto-fill to ALL selected expenses
        const selected = item.splitMatches.filter(m => m.selected)
        for (const m of selected) {
          // 1. Attach receipt
          await uploadAttachment(m.expense.id, b64, item.file.name, item.file.type)
          // 2. Apply auto-fill: category, kostendrager (tag1), kostenplaats
          await updateExpense(m.expense.id, {
            category: item.rule?.category || 'CMH Content marketing',
            tag1_id: TAG1_ID,
            field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
          })
        }
        updateItem(id, {
          status: 'done',
          submitMsg: `Receipt + auto-fill applied to ${selected.length} Google Ads expenses`,
        })
      } else {
        // Standard flow:
        // 1. Dedup check by description + date
        // 2. Create (POST) or update (PUT) base expense fields
        // 3. Apply auto-fill fields in separate PUT (Declaree requires category/tag1/field_values separately)
        // 4. Attach receipt

        const basePayload = {
          description: item.ocr.description,
          amount: parseFloat(item.ocr.total_amount) || 0,
          currency: item.ocr.currency || 'EUR',
          date: item.ocr.date,
          organization_id: orgId,
        }

        // Step 1: Dedup
        const existing = allExpenses.find(e =>
          (e.description || '').toLowerCase() === (item.ocr.description || '').toLowerCase() &&
          (e.date || '').startsWith((item.ocr.date || '').substring(0, 10))
        )

        // Step 2: Create or update
        let expId: number
        let wasExisting = false
        if (existing) {
          await updateExpense(existing.id, basePayload)
          expId = existing.id
          wasExisting = true
        } else {
          const created = await createExpense(basePayload)
          expId = created.id
        }

        // Step 3: Auto-fill in separate PUT
        if (item.rule) {
          await updateExpense(expId, {
            category: item.rule.category,
            tag1_id: TAG1_ID,
            field_values: [{ field_id: KOSTENPLAATS_FIELD_ID, option_id: KOSTENPLAATS_OPTION_ID }],
          })
        }

        // Step 4: Attach receipt
        await uploadAttachment(expId, b64, item.file.name, item.file.type)

        updateItem(id, {
          status: 'done',
          submitMsg: wasExisting
            ? 'Updated existing expense + auto-fill + receipt'
            : 'Created new expense + auto-fill + receipt',
        })
      }
      onSubmitDone()
    } catch (e: any) {
      updateItem(id, { status: 'error', errorMsg: e.message })
    }
  }

  function toggleSplitMatch(itemId: string, expId: number) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      return {
        ...i,
        splitMatches: i.splitMatches.map(m =>
          m.expense.id === expId ? { ...m, selected: !m.selected } : m
        )
      }
    }))
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <Upload size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload invoices to Declaree</span>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          'mx-5 my-4 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={24} className="mx-auto mb-2 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">Drop invoice files here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG — AI extracts amount & date, auto-fills fields. Google Ads invoices auto-match split payments.</p>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" multiple
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      {/* Invoice items */}
      {items.length > 0 && (
        <div className="px-5 pb-4 space-y-3">
          {items.map(item => (
            <InvoiceCard
              key={item.id}
              item={item}
              reports={reports}
              onRemove={() => setItems(prev => prev.filter(i => i.id !== item.id))}
              onOcrChange={(patch) => updateOcr(item.id, patch)}
              onSubmit={() => submitItem(item.id)}
              onToggleSplit={(expId) => toggleSplitMatch(item.id, expId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Invoice Card ──────────────────────────────────────────────────────────────
interface CardProps {
  item: InvoiceItem
  reports: import('../lib/types').Report[]
  onRemove: () => void
  onOcrChange: (patch: Partial<OcrResult>) => void
  onSubmit: () => void
  onToggleSplit: (expId: number) => void
}

function InvoiceCard({ item, reports, onRemove, onOcrChange, onSubmit, onToggleSplit }: CardProps) {
  const [expanded, setExpanded] = useState(true)

  const statusColors: Record<string, string> = {
    scanning: 'bg-amber-50 text-amber-700',
    matching: 'bg-amber-50 text-amber-700',
    ready: 'bg-green-50 text-green-700',
    submitting: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
    error: 'bg-red-50 text-red-700',
    pending: 'bg-gray-100 text-gray-500',
  }

  const isLoading = item.status === 'scanning' || item.status === 'matching' || item.status === 'submitting'
  const isDone = item.status === 'done'
  const isReady = item.status === 'ready'

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <FileText size={14} className="text-gray-400 shrink-0" />
        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{item.file.name}</span>
        {item.rule && (
          <span className="text-xs text-green-600 font-medium shrink-0">→ {item.rule.label}</span>
        )}
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', statusColors[item.status] || 'bg-gray-100 text-gray-500')}>
          {isLoading && <Loader size={10} className="inline animate-spin mr-1" />}
          {STATUS_LABEL[item.status]}
        </span>
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-400">
          <X size={14} />
        </button>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 bg-gray-100">
          <div className="h-full bg-blue-500 animate-pulse w-2/3" />
        </div>
      )}

      {expanded && (
        <>
          {/* OCR fields */}
          <div className="grid grid-cols-4 gap-3 px-4 py-3">
            <Field label="Amount" value={item.ocr.total_amount} onChange={v => onOcrChange({ total_amount: v })} disabled={isDone} />
            <Field label="Currency" value={item.ocr.currency} onChange={v => onOcrChange({ currency: v })} disabled={isDone} />
            <Field label="Date" value={item.ocr.date} type="date" onChange={v => onOcrChange({ date: v })} disabled={isDone} />
            <Field label="Description" value={item.ocr.description} onChange={v => onOcrChange({ description: v })} disabled={isDone} />
          </div>

          {/* Auto-fill info */}
          {item.rule && (
            <div className="mx-4 mb-3 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
              <span className="font-medium">Auto-fill:</span> Categorie → {item.rule.category} · Kostendrager → MD00 - Algemeen · Kostenplaats → D18JPL - Business Innovation & Marketing competitie
            </div>
          )}

          {/* Google Ads split matches */}
          {item.splitMatches.length > 0 && (
            <div className="mx-4 mb-3 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Split payment matches ({item.splitMatches.length} transactions)</span>
                {item.splitSumOk !== null && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', item.splitSumOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {item.splitSumOk ? '✓ Totals match' : '⚠ Total mismatch'}
                  </span>
                )}
              </div>
              {item.splitMatches.map(m => (
                <label key={m.expense.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                  <input type="checkbox" checked={m.selected} onChange={() => onToggleSplit(m.expense.id)} className="rounded" />
                  <span className="text-xs text-gray-700 flex-1 truncate">{m.expense.description}</span>
                  <span className="text-xs font-medium text-gray-900">{formatAmount(m.expense.amount, m.expense.currency)}</span>
                </label>
              ))}
            </div>
          )}

          {/* Error */}
          {item.status === 'error' && item.errorMsg && (
            <div className="mx-4 mb-3 px-3 py-2 bg-red-50 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {item.errorMsg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 px-4 pb-3">
            {isReady && (
              <button
                onClick={onSubmit}
                className="px-4 py-1.5 bg-[#1a4a7a] text-white text-sm font-medium rounded-lg hover:bg-[#153d66] transition-colors"
              >
                Submit to Declaree →
              </button>
            )}
            {isDone && (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle size={14} />
                {item.submitMsg || 'Submitted successfully'}
              </div>
            )}
            {item.status === 'error' && (
              <button
                onClick={onSubmit}
                className="px-4 py-1.5 border border-gray-200 text-sm rounded-lg hover:bg-gray-50"
              >
                Retry
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  )
}

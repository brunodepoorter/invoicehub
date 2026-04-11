import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3456;

const DECLAREE_KEY = process.env.DECLAREE_API_KEY || 'NJWB0qJswx0pbZg3MxGu7iL+NQXWqjeAtUZhTQ46Jp8=';
const BASE = 'https://app.declaree.com';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../client/dist')));

const headers = () => ({
  'Authorization': `Bearer ${DECLAREE_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

async function dFetch(url, method = 'GET', body = null) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`[${method}] ${url.replace(BASE,'')} → ${r.status}`);
  if (!r.ok) throw new Error(`Declaree ${r.status}: ${text.substring(0,200)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Organizations ─────────────────────────────────────────────────────────────
app.get('/api/organizations', async (req, res) => {
  try {
    const data = await dFetch(`${BASE}/api/v41/organizations?limit=100`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/reports', async (req, res) => {
  try {
    const data = await dFetch(`${BASE}/api/v4/organizations/${req.params.orgId}/reports?limit=100`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Report expenses ───────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/reports/:reportId/expenses', async (req, res) => {
  try {
    const data = await dFetch(`${BASE}/api/v41/organizations/${req.params.orgId}/reports/${req.params.reportId}/expenses`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── User expenses (unreported) ────────────────────────────────────────────────
app.get('/api/organizations/:orgId/users/:userId/expenses', async (req, res) => {
  try {
    const params = new URLSearchParams({ limit: '200', sort: 'e.expenseDate', dir: 'desc' });
    if (req.query.selection) params.set('selection', req.query.selection);
    const data = await dFetch(`${BASE}/api/v41/organizations/${req.params.orgId}/users/${req.params.userId}/expenses?${params}`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Org-wide expenses ─────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/expenses', async (req, res) => {
  try {
    const params = new URLSearchParams({ limit: '200', sort: 'e.expenseDate', dir: 'desc' });
    if (req.query.selection) params.set('selection', req.query.selection);
    const data = await dFetch(`${BASE}/api/v41/organizations/${req.params.orgId}/expenses?${params}`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Create expense ────────────────────────────────────────────────────────────
app.post('/api/organizations/:orgId/expenses', async (req, res) => {
  try {
    const data = await dFetch(`${BASE}/api/v4/organizations/${req.params.orgId}/expenses`, 'POST', req.body);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Update expense ────────────────────────────────────────────────────────────
app.put('/api/organizations/:orgId/expenses/:expId', async (req, res) => {
  try {
    const data = await dFetch(`${BASE}/api/v4/expenses/${req.params.expId}`, 'PUT', req.body);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Assign to report ──────────────────────────────────────────────────────────
app.put('/api/organizations/:orgId/expenses/:expId/report', async (req, res) => {
  try {
    const { reportId } = req.body;
    const data = await dFetch(`${BASE}/api/v4/organizations/${req.params.orgId}/expenses/${req.params.expId}`, 'PUT', { report: reportId });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Upload receipt ────────────────────────────────────────────────────────────
// Declaree uses multipart form upload to /resources with api_key as query param
app.post('/api/organizations/:orgId/expenses/:expId/resources', async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    const buffer = Buffer.from(fileBase64, 'base64');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const createdAt = new Date().toISOString().split('T')[0];

    const form = new FormData();
    form.append('file', buffer, { filename: fileName, contentType: mimeType || 'application/pdf' });
    form.append('creation_date', createdAt);
    form.append('hash', hash);

    const uploadUrl = `${BASE}/api/v41/organizations/${req.params.orgId}/expenses/${req.params.expId}/resources?api_key=${DECLAREE_KEY}`;
    const r = await fetch(uploadUrl, { method: 'POST', body: form });
    const text = await r.text();
    console.log(`[UPLOAD] expense ${req.params.expId} → ${r.status}: ${text.substring(0,100)}`);
    try { res.status(r.status).json(JSON.parse(text)); }
    catch { res.status(r.status).json({ raw: text }); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── OCR ───────────────────────────────────────────────────────────────────────
app.post('/api/ocr', async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    const isImage = (mimeType || '').startsWith('image/');
    const ocrPrompt = `Extract from this invoice and respond ONLY with valid JSON, no markdown:
{"total_amount":"<decimal number only, no commas or symbols>","currency":"<EUR/USD/GBP>","date":"<YYYY-MM-DD>","description":"<vendor name: ActiveCampaign/Meta Ads/Google Ads/LinkedIn/etc, max 50 chars>"}
Strip commas from numbers. Google invoices → 'Google Ads'. Meta/Facebook → 'Meta Ads'.`;

    const content = isImage
      ? [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }, { type: 'text', text: ocrPrompt }]
      : [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }, { type: 'text', text: ocrPrompt }];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': process.env.ANTHROPIC_API_KEY || '' },
      body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 300, messages: [{ role: 'user', content }] })
    });
    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const text = d.content?.find(c => c.type === 'text')?.text || '{}';
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (parsed.total_amount) parsed.total_amount = String(parsed.total_amount).replace(/[,$€£\s]/g, '');
      res.json({ success: true, data: parsed });
    } catch { res.json({ success: true, data: { total_amount: '', currency: 'EUR', date: '', description: '' } }); }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));

app.listen(PORT, () => console.log(`\n✅ InvoiceHub running at http://localhost:${PORT}\n`));

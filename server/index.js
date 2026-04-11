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
  if (!r.ok) {
    console.error(`[${method}] ERROR body:`, text.substring(0, 500));
    if (body) console.error(`[${method}] sent body:`, JSON.stringify(body).substring(0, 300));
    throw new Error(`Declaree ${r.status}: ${text.substring(0, 400)}`);
  }
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

// ── Categories ────────────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/categories', async (req, res) => {
  try {
    // Try v41 endpoint names; fall back gracefully
    let data;
    try { data = await dFetch(`${BASE}/api/v41/organizations/${req.params.orgId}/expense_categories?limit=200`); }
    catch { data = await dFetch(`${BASE}/api/v4/organizations/${req.params.orgId}/categories?limit=200`); }
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
    // Declaree v4 uses "date" not "expense_date" for creation
    const body = { ...req.body };
    if (body.expense_date && !body.date) { body.date = body.expense_date; delete body.expense_date; }
    console.log('[POST] creating expense with body:', JSON.stringify(body));
    const data = await dFetch(`${BASE}/api/v4/organizations/${req.params.orgId}/expenses`, 'POST', body);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Update expense ────────────────────────────────────────────────────────────
// Try multiple strategies: PATCH/PUT on v4 and v41, with and without orgId
app.put('/api/organizations/:orgId/expenses/:expId', async (req, res) => {
  const { orgId, expId } = req.params;
  const strategies = [
    ['PATCH', `${BASE}/api/v4/expenses/${expId}`],
    ['PUT',   `${BASE}/api/v4/expenses/${expId}`],
    ['PATCH', `${BASE}/api/v41/expenses/${expId}`],
    ['PUT',   `${BASE}/api/v41/expenses/${expId}`],
    ['PATCH', `${BASE}/api/v4/organizations/${orgId}/expenses/${expId}`],
    ['PUT',   `${BASE}/api/v4/organizations/${orgId}/expenses/${expId}`],
    ['PATCH', `${BASE}/api/v41/organizations/${orgId}/expenses/${expId}`],
    ['PUT',   `${BASE}/api/v41/organizations/${orgId}/expenses/${expId}`],
  ];
  let lastErr = null;
  for (const [method, url] of strategies) {
    try {
      const data = await dFetch(url, method, req.body);
      console.log(`[UPDATE] success with ${method} ${url.replace(BASE,'')}`);
      return res.json(data);
    } catch (e) {
      console.log(`[UPDATE] ${method} ${url.replace(BASE,'')} → ${e.message.substring(0,60)}`);
      lastErr = e;
    }
  }
  res.status(500).json({ error: lastErr?.message || 'All update strategies failed' });
});

// ── Assign to report ──────────────────────────────────────────────────────────
app.put('/api/organizations/:orgId/expenses/:expId/report', async (req, res) => {
  const { orgId, expId } = req.params;
  const { reportId } = req.body;
  const strategies = [
    ['PATCH', `${BASE}/api/v4/expenses/${expId}`,                                  { report_id: reportId }],
    ['PUT',   `${BASE}/api/v4/expenses/${expId}`,                                  { report_id: reportId }],
    ['PATCH', `${BASE}/api/v41/expenses/${expId}`,                                 { report_id: reportId }],
    ['PATCH', `${BASE}/api/v4/organizations/${orgId}/expenses/${expId}`,            { report_id: reportId }],
    ['PUT',   `${BASE}/api/v4/organizations/${orgId}/expenses/${expId}`,            { report_id: reportId }],
    ['PATCH', `${BASE}/api/v41/organizations/${orgId}/expenses/${expId}`,           { report_id: reportId }],
    // Some APIs use "report" not "report_id"
    ['PATCH', `${BASE}/api/v4/expenses/${expId}`,                                  { report: reportId }],
    ['PATCH', `${BASE}/api/v41/organizations/${orgId}/expenses/${expId}`,           { report: reportId }],
  ];
  let lastErr = null;
  for (const [method, url, body] of strategies) {
    try {
      const data = await dFetch(url, method, body);
      console.log(`[ASSIGN] success with ${method} ${url.replace(BASE,'')} body:${JSON.stringify(body)}`);
      return res.json(data);
    } catch (e) {
      console.log(`[ASSIGN] ${method} ${url.replace(BASE,'')} → ${e.message.substring(0,60)}`);
      lastErr = e;
    }
  }
  res.status(500).json({ error: lastErr?.message || 'All assign strategies failed' });
});

// ── Upload receipt ────────────────────────────────────────────────────────────
app.post('/api/organizations/:orgId/expenses/:expId/resources', async (req, res) => {
  try {
    const { fileBase64, fileName, mimeType } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'No file data' });

    const { orgId, expId } = req.params;
    const buffer = Buffer.from(fileBase64, 'base64');
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const md5    = crypto.createHash('md5').update(buffer).digest('hex');
    const createdAt = new Date().toISOString().split('T')[0];
    const ct = mimeType || 'application/pdf';

    function makeForm(hashVal) {
      const f = new FormData();
      f.append('file', buffer, { filename: fileName, contentType: ct });
      f.append('creation_date', createdAt);
      if (hashVal !== null) f.append('hash', hashVal);
      return f;
    }

    // Try multiple strategies: v4/v41, Bearer/api_key, sha256/md5/no-hash
    const strategies = [
      [`${BASE}/api/v4/organizations/${orgId}/expenses/${expId}/resources`,  'Bearer', sha256],
      [`${BASE}/api/v4/organizations/${orgId}/expenses/${expId}/resources`,  'Bearer', md5],
      [`${BASE}/api/v4/organizations/${orgId}/expenses/${expId}/resources`,  'Bearer', null],
      [`${BASE}/api/v41/organizations/${orgId}/expenses/${expId}/resources?api_key=${encodeURIComponent(DECLAREE_KEY)}`, 'apikey', sha256],
      [`${BASE}/api/v41/organizations/${orgId}/expenses/${expId}/resources?api_key=${encodeURIComponent(DECLAREE_KEY)}`, 'apikey', md5],
      [`${BASE}/api/v41/organizations/${orgId}/expenses/${expId}/resources?api_key=${encodeURIComponent(DECLAREE_KEY)}`, 'apikey', null],
    ];

    for (const [url, authType, hashVal] of strategies) {
      const form = makeForm(hashVal);
      const hdrs = authType === 'Bearer'
        ? { ...form.getHeaders(), 'Authorization': `Bearer ${DECLAREE_KEY}` }
        : { ...form.getHeaders() };
      const r = await fetch(url, { method: 'POST', headers: hdrs, body: form });
      const text = await r.text();
      const label = `${url.replace(BASE,'')} hash=${hashVal?.substring(0,6) ?? 'none'}`;
      console.log(`[UPLOAD] ${label} → ${r.status}: ${text.substring(0,150)}`);
      if (r.ok) {
        try { return res.json(JSON.parse(text)); }
        catch { return res.json({ raw: text }); }
      }
    }
    res.status(500).json({ error: 'All upload strategies failed — check server logs' });
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
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, messages: [{ role: 'user', content }] })
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

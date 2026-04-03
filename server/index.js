import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3456;

const DECLAREE_KEY = process.env.DECLAREE_API_KEY || 'NJWB0qJswx0pbZg3MxGu7iL+NQXWqjeAtUZhTQ46Jp8=';
const DECLAREE_V4 = 'https://app.declaree.com/api/v4';
const DECLAREE_V41 = 'https://app.declaree.com/api/v41';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../client/dist')));

const declareeHeaders = (extra = {}) => ({
  'Authorization': `Bearer ${DECLAREE_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...extra
});

// Generic proxy helper
async function proxyRequest(method, url, body, res) {
  try {
    const opts = {
      method,
      headers: declareeHeaders(),
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Organizations ────────────────────────────────────────────────────────────
app.get('/api/organizations', (req, res) =>
  proxyRequest('GET', `${DECLAREE_V4}/organizations`, null, res));

app.get('/api/organizations/:orgId/users', (req, res) =>
  proxyRequest('GET', `${DECLAREE_V4}/organizations/${req.params.orgId}/users`, null, res));

// ── Reports ──────────────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/reports', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  proxyRequest('GET', `${DECLAREE_V4}/organizations/${req.params.orgId}/reports${qs ? '?' + qs : ''}`, null, res);
});

app.get('/api/reports/:reportId/expenses', (req, res) =>
  proxyRequest('GET', `${DECLAREE_V4}/reports/${req.params.reportId}/expenses`, null, res));

// ── Expenses ─────────────────────────────────────────────────────────────────
app.get('/api/organizations/:orgId/expenses', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  proxyRequest('GET', `${DECLAREE_V4}/organizations/${req.params.orgId}/expenses${qs ? '?' + qs : ''}`, null, res);
});

app.get('/api/expenses/:expId', (req, res) =>
  proxyRequest('GET', `${DECLAREE_V4}/expenses/${req.params.expId}`, null, res));

app.post('/api/expenses', (req, res) =>
  proxyRequest('POST', `${DECLAREE_V4}/expenses`, req.body, res));

app.put('/api/expenses/:expId', (req, res) =>
  proxyRequest('PUT', `${DECLAREE_V4}/expenses/${req.params.expId}`, req.body, res));

app.delete('/api/expenses/:expId', (req, res) =>
  proxyRequest('DELETE', `${DECLAREE_V4}/expenses/${req.params.expId}`, null, res));

// Assign expense to report
app.put('/api/expenses/:expId/report', (req, res) =>
  proxyRequest('PUT', `${DECLAREE_V4}/expenses/${req.params.expId}/report`, req.body, res));

// ── Attachments ──────────────────────────────────────────────────────────────
// Upload attachment - expects { filename, content_type, data (base64) }
app.post('/api/expenses/:expId/attachments', async (req, res) => {
  try {
    const { filename, content_type, data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const buffer = Buffer.from(data, 'base64');
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: content_type });

    const url = `${DECLAREE_V41}/expenses/${req.params.expId}/attachments`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DECLAREE_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });
    const text = await r.text();
    let result;
    try { result = JSON.parse(text); } catch { result = { raw: text }; }
    res.status(r.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── OCR via Claude API ────────────────────────────────────────────────────────
app.post('/api/ocr', async (req, res) => {
  try {
    const { data, mime_type, filename } = req.body;
    if (!data) return res.status(400).json({ error: 'No file data' });

    const isImage = (mime_type || '').startsWith('image/');
    const ocrPrompt = `Extract from this invoice and respond ONLY with valid JSON, no markdown, no explanation:
{"total_amount":"<final total as plain decimal, NO commas, NO symbols, e.g. 2509.00>","currency":"<3-letter ISO: EUR/USD/GBP>","date":"<YYYY-MM-DD>","description":"<vendor name only: e.g. ActiveCampaign, Meta Ads, Google Ads, LinkedIn — NOT the document title, max 50 chars>"}
Rules: strip commas from numbers (2,509.00 → 2509.00). Google invoices → 'Google Ads'. Meta/Facebook invoices → 'Meta Ads'.`;
    const content = isImage
      ? [
          { type: 'image', source: { type: 'base64', media_type: mime_type, data } },
          { type: 'text', text: ocrPrompt }
        ]
      : [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
          { type: 'text', text: ocrPrompt }
        ];

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 300,
        messages: [{ role: 'user', content }]
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const text = d.content?.find(c => c.type === 'text')?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(clean);
      // Sanitize amount: strip commas, currency symbols, spaces
      if (parsed.total_amount) {
        parsed.total_amount = String(parsed.total_amount)
          .replace(/[,$€£\s]/g, '')
          .replace(/,/g, '');
      }
      res.json(parsed);
    } catch {
      res.json({ total_amount: '', currency: 'EUR', date: '', description: '' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback → serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ InvoiceHub running at http://localhost:${PORT}\n`);
});

# InvoiceHub — Club Brugge

Internal tool to automate vendor invoice processing into Declaree.

## Quick start

```bash
chmod +x start.sh
./start.sh
```

Then open **http://localhost:3456**

## What it does

- **Invoice upload & OCR** — drag & drop PDF/PNG/JPG, AI extracts amount, date, vendor
- **Auto-fill rules** — matches vendor to Declaree category, kostendrager, kostenplaats automatically
- **Google Ads split matching** — one invoice → multiple card charges, auto-matches and attaches receipt to all
- **Declaree dashboard** — all reports + unreported expenses, completeness indicators
- **One-click auto-fill** — fills missing category/kostendrager/kostenplaats for matched expenses
- **Assign to report** — move unreported expenses into any open report

## Dev mode

```bash
# Terminal 1
cd server && npm install && node --watch index.js

# Terminal 2  
cd client && npm install && npm run dev
# Open http://localhost:5173
```

## Configuration

API key is embedded in `server/index.js`. To change it, set the env variable:

```bash
DECLAREE_API_KEY=your_key_here node server/index.js
```

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express (CORS proxy to Declaree + OCR via Claude API)
- **OCR**: Claude claude-opus-4-5-20251101 via Anthropic API
- **Expense management**: Declaree API v4 + v41

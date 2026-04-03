import type { AutoFillRule } from './types'

export const TAG1_ID = 8499471
export const KOSTENPLAATS_FIELD_ID = 17333
export const KOSTENPLAATS_OPTION_ID = 201996

interface RuleEntry {
  pattern: RegExp
  label: string
  category: string
  cat_code: string
}

export const RULES: RuleEntry[] = [
  // Abonnementen (611010)
  { pattern: /figma/i,                          label: 'Figma',           category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /openai|chatgpt/i,                 label: 'OpenAI',          category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /cursor/i,                         label: 'Cursor',          category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /deepl/i,                          label: 'DeepL',           category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /typeform/i,                       label: 'Typeform',        category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /manus/i,                          label: 'Manus',           category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /activecampaign/i,                 label: 'ActiveCampaign',  category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /lovable/i,                        label: 'Lovable',         category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /airtable/i,                       label: 'Airtable',        category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /claude|anthropic/i,               label: 'Claude',          category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /productboard/i,                   label: 'Productboard',    category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /growth.?team/i,                   label: 'Growth Team',     category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /linear/i,                         label: 'Linear',          category: 'Abonnementen',        cat_code: '611010' },
  { pattern: /apple/i,                          label: 'Apple',           category: 'Abonnementen',        cat_code: '611010' },
  // CMH Content marketing (612130)
  { pattern: /google.{0,5}ads|google\*ads/i,    label: 'Google Ads',      category: 'CMH Content marketing', cat_code: '612130' },
  { pattern: /microsoft.{0,5}ads/i,             label: 'Microsoft Ads',   category: 'CMH Content marketing', cat_code: '612130' },
  { pattern: /spryng/i,                         label: 'Spryng',          category: 'CMH Content marketing', cat_code: '612130' },
  { pattern: /twilio/i,                         label: 'Twilio',          category: 'CMH Content marketing', cat_code: '612130' },
  { pattern: /\bmeta\b|facebook/i,              label: 'Meta Ads',        category: 'CMH Content marketing', cat_code: '612130' },
  { pattern: /linkedin/i,                       label: 'LinkedIn Ads',    category: 'CMH Content marketing', cat_code: '612130' },
]

export function matchRule(description: string): AutoFillRule | null {
  if (!description) return null
  const r = RULES.find(r => r.pattern.test(description))
  return r ? { label: r.label, category: r.category, cat_code: r.cat_code } : null
}

export function isGoogleAds(description: string): boolean {
  return /google.{0,5}ads|google\*ads/i.test(description)
}

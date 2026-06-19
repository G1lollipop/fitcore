// @ts-nocheck
/**
 * One-time backfill: translate system exercise names into English and store
 * them in `exercises.name_en`. The bilingual UI reads `name_en` for English
 * users and falls back to the original `name`, so this only needs to run once
 * (and again whenever new system exercises are added without an English name).
 *
 * Usage (Node >= 20.6, run from the `web/` directory):
 *
 *   # Preview without writing (recommended first):
 *   DRY_RUN=1 node --env-file=.env.local scripts/backfill-exercise-name-en.mjs
 *
 *   # Actually write name_en:
 *   node --env-file=.env.local scripts/backfill-exercise-name-en.mjs
 *
 *   # Re-translate everything, overwriting existing name_en:
 *   OVERWRITE=1 node --env-file=.env.local scripts/backfill-exercise-name-en.mjs
 *
 * Required env (already in web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_AI_STUDIO_API_KEY
 * Optional env: AI_CHAT_MODEL (default gemini-2.5-flash), BATCH_SIZE (default 40)
 */

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY
const MODEL = process.env.AI_CHAT_MODEL || 'gemini-2.5-flash'
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 40)
const DRY_RUN = !!process.env.DRY_RUN
const OVERWRITE = !!process.env.OVERWRITE

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`)
  process.exit(1)
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}
if (!GEMINI_KEY) fail('Missing GOOGLE_AI_STUDIO_API_KEY')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const model = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({
  model: MODEL,
  generationConfig: { temperature: 0, responseMimeType: 'application/json' },
})

/** Ask Gemini to translate a batch of exercise names; returns {id: english}. */
async function translateBatch(rows) {
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment,
    muscles: r.muscle_groups,
  }))
  const prompt = [
    'You are a professional fitness translator. Translate each Chinese exercise',
    'name into its standard, concise English gym name (e.g. "杠铃卧推" -> "Barbell Bench Press").',
    'Use widely recognized English terminology, Title Case, no trailing punctuation.',
    'If a name is already English, return it unchanged.',
    'The category/equipment/muscles fields are context only — do not translate them.',
    '',
    'Return ONLY a JSON array of objects: [{"id": "<id>", "name_en": "<english>"}].',
    '',
    JSON.stringify(items),
  ].join('\n')

  const res = await model.generateContent(prompt)
  const text = res.response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Model did not return valid JSON:\n${text.slice(0, 500)}`)
  }
  const map = new Map()
  for (const entry of parsed) {
    if (entry && entry.id && typeof entry.name_en === 'string' && entry.name_en.trim()) {
      map.set(entry.id, entry.name_en.trim())
    }
  }
  return map
}

async function main() {
  console.log(
    `Backfill exercise name_en — model=${MODEL} batch=${BATCH_SIZE} ` +
      `${DRY_RUN ? '[DRY RUN] ' : ''}${OVERWRITE ? '[OVERWRITE] ' : ''}`
  )

  let query = supabase
    .from('exercises')
    .select('id, name, name_en, category, equipment, muscle_groups')
    .eq('is_system', true)
    .order('created_at', { ascending: true })
  if (!OVERWRITE) query = query.is('name_en', null)

  const { data: rows, error } = await query
  if (error) fail(`Query failed: ${error.message}`)
  if (!rows || rows.length === 0) {
    console.log('Nothing to translate. ✔')
    return
  }
  console.log(`Found ${rows.length} system exercise(s) to translate.`)

  let updated = 0
  let failed = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const label = `batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`
    let map
    try {
      map = await translateBatch(batch)
    } catch (err) {
      console.error(`  ${label}: translation failed — ${err.message}`)
      failed += batch.length
      continue
    }

    for (const row of batch) {
      const nameEn = map.get(row.id)
      if (!nameEn) {
        console.warn(`  - no translation for "${row.name}" (${row.id})`)
        failed += 1
        continue
      }
      console.log(`  ${row.name}  ->  ${nameEn}`)
      if (DRY_RUN) {
        updated += 1
        continue
      }
      const { error: upErr } = await supabase
        .from('exercises')
        .update({ name_en: nameEn })
        .eq('id', row.id)
      if (upErr) {
        console.error(`    update failed (${row.id}): ${upErr.message}`)
        failed += 1
      } else {
        updated += 1
      }
    }
  }

  console.log(
    `\nDone. ${DRY_RUN ? 'would update' : 'updated'}=${updated} failed=${failed}` +
      `${DRY_RUN ? '  (no changes written)' : ''}`
  )
}

main().catch((err) => fail(err?.stack || String(err)))

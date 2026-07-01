#!/usr/bin/env npx tsx
/* eslint-disable no-console -- CLI eval harness: console output is the intended report surface */
/**
 * Agent Step-1 tool-selection offline eval.
 *
 * Usage (from web/):
 *   npm run eval:agent
 *   npm run eval:agent -- --gate
 *   npm run eval:agent -- --limit 5
 *
 * Requires GOOGLE_AI_STUDIO_API_KEY (or OPENAI_API_KEY) in env / .env.local.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

// Load .env.local when running standalone (Next.js does this automatically in dev).
try {
  const envPath = resolve(process.cwd(), ".env.local")
  const raw = readFileSync(envPath, "utf8")
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
} catch {
  // .env.local optional for CI secrets injection
}

import { planAgentStep } from "../plan-step"
import {
  type AgentGoldenCase,
  scoreCase,
  summarizeAgentEval,
} from "./metrics"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET = resolve(__dirname, "agent-golden-set.json")
const BASELINE = resolve(__dirname, "agent-baseline.json")

function parseArgs(argv: string[]) {
  const gate = argv.includes("--gate")
  const limitIdx = argv.indexOf("--limit")
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1]
      ? parseInt(argv[limitIdx + 1], 10)
      : undefined
  const tagIdx = argv.indexOf("--tag")
  const tag = tagIdx >= 0 ? argv[tagIdx + 1] ?? "" : ""
  return { gate, limit, tag }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const { gate, limit, tag } = parseArgs(process.argv.slice(2))
  const apiKey =
    process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error(
      "GOOGLE_AI_STUDIO_API_KEY (or OPENAI_API_KEY) is required for agent eval."
    )
    process.exit(1)
  }

  const dataset: AgentGoldenCase[] = JSON.parse(
    readFileSync(DATASET, "utf8")
  )
  const cases = limit ? dataset.slice(0, limit) : dataset

  console.log("=== FitCore Agent Tool-Selection Eval ===")
  console.log(`Cases: ${cases.length} / ${dataset.length}`)
  console.log("")

  const rows = []
  for (const item of cases) {
    process.stdout.write(`${item.id} … `)
    try {
      const plan = await planAgentStep({
        message: item.message,
      })
      const row = scoreCase(item, plan.tools, plan.retrievalK)
      rows.push({ ...row, finish_reason: plan.finishReason })
      const mark = row.tool_set_match ? "OK" : "MISS"
      console.log(`${mark}  tools=[${plan.tools.join(", ")}]  k=${plan.retrievalK ?? "-"}`)
    } catch (err) {
      console.log(`ERROR  ${err instanceof Error ? err.message : err}`)
      rows.push({
        ...scoreCase(item, [], undefined),
        error: String(err),
        finish_reason: "error",
      })
    }
    await sleep(400)
  }

  const summary = summarizeAgentEval(rows)
  console.log("\n--- Summary ---")
  console.log(`tool_selection_accuracy : ${summary.tool_selection_accuracy}`)
  console.log(`k_hit_rate              : ${summary.k_hit_rate ?? "n/a"}`)
  console.log(
    `false_tool_call_rate    : ${summary.false_tool_call_rate ?? "n/a"}`
  )
  console.log("per_tool F1:")
  for (const [tool, m] of Object.entries(summary.per_tool)) {
    console.log(`  ${tool}: P=${m.precision.toFixed(2)} R=${m.recall.toFixed(2)} F1=${m.f1.toFixed(2)}`)
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const reportName = `agent_eval_report_${tag ? tag + "_" : ""}${ts}.json`
  const reportPath = resolve(__dirname, reportName)
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        evaluated_at: new Date().toISOString(),
        summary,
        results: rows,
      },
      null,
      2
    )
  )
  console.log(`\nReport: ${reportPath}`)

  if (gate) {
    const baseline = JSON.parse(readFileSync(BASELINE, "utf8"))
    const t = baseline.thresholds ?? {}
    const failures: string[] = []

    if (
      summary.tool_selection_accuracy <
      (t.tool_selection_accuracy ?? 0) - 1e-9
    ) {
      failures.push(
        `tool_selection_accuracy ${summary.tool_selection_accuracy} < ${t.tool_selection_accuracy}`
      )
    }
    if (
      summary.k_hit_rate !== null &&
      t.k_hit_rate !== undefined &&
      summary.k_hit_rate < t.k_hit_rate - 1e-9
    ) {
      failures.push(`k_hit_rate ${summary.k_hit_rate} < ${t.k_hit_rate}`)
    }
    if (
      summary.false_tool_call_rate !== null &&
      t.max_false_tool_call_rate !== undefined &&
      summary.false_tool_call_rate > t.max_false_tool_call_rate + 1e-9
    ) {
      failures.push(
        `false_tool_call_rate ${summary.false_tool_call_rate} > ${t.max_false_tool_call_rate}`
      )
    }

    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (summaryPath) {
      const lines = [
        "## Agent tool-selection gate",
        "",
        "| Metric | Value | Floor/Cap |",
        "|---|---|---|",
        `| tool_selection_accuracy | ${summary.tool_selection_accuracy} | ≥ ${t.tool_selection_accuracy ?? "-"} |`,
        `| k_hit_rate | ${summary.k_hit_rate ?? "n/a"} | ≥ ${t.k_hit_rate ?? "-"} |`,
        `| false_tool_call_rate | ${summary.false_tool_call_rate ?? "n/a"} | ≤ ${t.max_false_tool_call_rate ?? "-"} |`,
      ]
      try {
        writeFileSync(summaryPath, lines.join("\n") + "\n", { flag: "a" })
      } catch {
        // ignore
      }
    }

    if (failures.length) {
      console.error("\n[gate] FAIL:", failures.join("; "))
      process.exit(1)
    }
    console.log("\n[gate] PASS")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

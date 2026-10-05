# AI logging measurement

This is an initial measurement plan for the home and floating text loggers, meal-photo flow, and Record corrections. The targets below are provisional hypotheses; set a baseline with real usage before treating them as release gates.

## Events

The client emits Vercel custom events through the existing `@vercel/analytics` integration, using the documented `track(name, properties)` API ([Vercel custom events](https://vercel.com/docs/analytics/custom-events)). Event names and allowed properties are defined in `lib/analytics/logging-events.ts`.

| Event | Meaning | Properties |
| --- | --- | --- |
| `FitCore Logging Attempt` | A non-empty home or floating text submission, or a selected meal photo starts processing. | `source`: `text` or `photo`; `entry_point`: `home_log_bar`, `floating_quick_log`, or `meal_photo` |
| `FitCore Logging Completed` | The text action reports success, a high-confidence photo is saved, or a reviewed low-confidence photo is saved. | `source`, `entry_point`, `elapsed_ms`; `item_count` for successful writes; `confidence_band` for photos |
| `FitCore Logging Failed` | A text action, photo parse, photo save, or photo processing fails. | `source`, `entry_point`, coarse `failure_reason`, `elapsed_ms` when available |
| `FitCore Logging Review Required` | A photo parse completes below the auto-save confidence threshold and needs user confirmation. This is an intermediate state, not a saved log. | `source=photo`, `entry_point=meal_photo`, `confidence_band=low`, parse `elapsed_ms` |
| `FitCore Logging Review Cancelled` | The user explicitly closes a photo confirmation or adjustment review without saving that review. | `source=photo`, `entry_point=meal_photo_review`, `review_type` |
| `FitCore Logging Correction` | A photo review or Record editor successfully saves one or more values that differ from the values shown when editing began. | `source=photo` or `record`, `entry_point`, `log_type=food` or `workout`, `changed_field_count`, review/edit `elapsed_ms` |

`source` identifies the current flow (`text`, `photo`, or a later `record` edit); `entry_point` distinguishes where the event occurred. A `record` correction does not identify the original entry modality. `elapsed_ms` is measured with the browser's monotonic clock. For text, it starts when the user submits; for photos, it starts when the selected file begins processing. Low-confidence photo completion includes the user's review time. These are flow timings, not full time from deciding to log: text composition and opening the camera are not measured.

## Privacy boundaries

Events do not include the text prompt, food or workout name, nutrition or workout values, image bytes, filename, user ID, or raw error message. Correction telemetry reports only the broad log type and how many editable fields changed. Keep future logging events within this boundary.

## Reading the baseline

- **Attempt volume:** count attempts by `source` and `entry_point`; the home and floating text bars are separate entry points.
- **Observed completion share:** completed events divided by attempts in the same reporting window, by `source`. Retries count as new attempts. A low-confidence photo may complete after its review event, so short windows can undercount completions.
- **Failure share:** failed events divided by attempts in the same reporting window. Treat this as directional because events do not carry a per-attempt identifier and a late completion cannot be matched to its original attempt.
- **Flow latency:** median and 90th percentile `elapsed_ms` among completed events. Report text and photo separately; photo latency for low-confidence entries includes human review time.
- **Photo correction share:** correction events with `source=photo` divided by completed photo events. A correction is recorded only when a saved photo review changes at least one AI-produced field; canceled reviews and unchanged confirmations are not corrections.
- **Record edit corrections:** count events with `source=record` separately, grouped by `log_type`. The current row model has no provenance field, so a Record correction cannot be attributed safely to a text log, photo log, or manual entry.

The aggregate event model intentionally avoids a per-attempt or per-user key. It therefore supports directional funnel and latency trends, not exact attempt-level conversion or user cohort analysis. Explicit review cancellations are observable; closing the page before a review is resolved is not.

## Provisional first-study targets

Use these as starting hypotheses for a small phone-based study, then revise them after the baseline:

- At least 80% observed completion share for each entry point (`home_log_bar`, `floating_quick_log`, and `meal_photo`).
- Median submit-to-saved latency below 10 seconds for each text entry point and below 20 seconds for high-confidence photo logs.
- No repeated photo corrections for the same field pattern during moderated sessions; review each correction qualitatively before setting a numeric production target.
- No duplicate or partial records during mixed text-log scenarios; validate this separately with persistence checks because client analytics cannot establish data integrity.

These targets are provisional and should not be interpreted as measured current performance.

## Coverage limits

Photo corrections are captured in the upload review flow. The Record editor reports successful food and workout changes, but its rows can come from AI text, AI photo, AI workout, or manual entry, and the stored row has no provenance. Treat these Record corrections as a separate quality signal until provenance can be captured safely. Vercel's documentation currently lists custom events for Pro and Enterprise plans; confirm the project's plan before relying on dashboard event reports.

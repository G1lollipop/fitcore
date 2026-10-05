# Mobile AI logging usability test

Use this script with five participants on their own phones. Give each person a separate test account and the same prepared meal photo. Reset the test account between sessions. Use fictional food and exercise details; do not collect participants' health information.

## Setup

1. Confirm Today and Record load on the test phone and the AI services are available.
2. Prepare a photo of a meal with rice that can plausibly be corrected to a half portion.
3. For the recovery task, interrupt the phone's network for one submission, then restore it before the participant retries. To test an ambiguous response after a successful commit, use a staging-only proxy that drops the response after the server finishes. Keep the database integrity check separate from the participant session if that proxy is unavailable. Record the resulting food and workout rows before and after retry.
4. Start a screen recording with the participant's consent, or take timestamped notes. Do not record credentials.

## Moderator script

Say: “Please do these tasks as you normally would. Think aloud. I won't show you where the controls are, but you may stop at any time.” Give one task at a time, without pointing to a button.

| Task | Prompt | Check |
| --- | --- | --- |
| Text | “Log a banana and a cup of Greek yogurt for breakfast.” | Participant finds Today quick log; food appears in Record. |
| Photo | “Log this lunch from the photo.” | Participant finds the camera flow and understands the saved estimate or review request. |
| Correction | “You ate about half the rice shown. Update the record.” | Participant finds the adjustment control and the saved value changes. |
| Mixed | “I had a turkey sandwich, then walked for 30 minutes.” | A single sentence creates one food entry and one workout entry. |
| Failure and retry | Ask for another mixed log while the network interruption is enabled; then restore service and ask the participant to finish. | Error is understandable; retry creates the complete log once, with no partial or duplicate rows. |

After each task, ask: “How sure are you that it saved the right thing?” Record the answer on a 1–5 scale and what caused any doubt. At the end, ask what they would change first.

## Results sheet

For each participant and task, record: phone/browser, independent completion (yes/no), manual-entry fallback (yes/no), help requested, seconds from task prompt to visible confirmation, correction made (yes/no), confidence (1–5), and a short observation. For failure/retry, also record database row counts before failure, after failure, and after retry.

Provisional release bar: at least four of five participants independently complete each normal task without manual entry; every tested failure has no false success, partial log, or duplicate; and at least four of five can retry without help. Treat timing from this round as a baseline, then set a numeric speed target. Review event counts alongside observations using [AI logging metrics](./ai-logging-metrics.md).

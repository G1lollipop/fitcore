# AI Coach: Strip logging & plan capabilities, keep Q&A only

## Context

The AI coach currently handles 3 responsibilities: Q&A (knowledge + personal stats), logging (food/workout/water), and plan generation/adjustment. The product decision is to make the coach a pure Q&A surface — logging already has dedicated first-class entry points (Quick Log bar, meal photo), and plan management lives in the Home Plan Section. The "/" slash commands are also being removed since this is a mobile app where they add friction.

**Remaining tools (3):** `set_retrieval_params`, `query_knowledge_base`, `get_user_stats`
**Removed tools (4):** `log_food`, `log_workout`, `log_water`, `adjust_plan`

---

## 1. Server: Remove logging/plan tools from agent

### `web/lib/ai/agent-tools.ts`
- Remove the 4 tool definitions (`log_food`, `log_workout`, `log_water`, `adjust_plan`) from `AGENT_TOOLS` array (lines 71-159)
- Rewrite `SYSTEM_PROMPT` (lines 162-187):
  - Remove references to logging and plan tools from the tool list
  - Remove tool-calling rules for logging/plan
  - Remove "After a successful log, confirm in one line" answer requirement
  - Keep knowledge + personal stats + small talk rules

### `web/lib/ai/agent.ts`
- Remove imports: `logFood`, `logWorkout`, `logWater`, `previewWorkoutPlan`, `PlanPreviewPayload` (lines 14-18)
- Remove `loggedActivity` and `planPreview` from `AgentResult` interface (lines 64-65, 74-75)
- Remove `LOG_TOOLS` constant (line 78)
- Remove `loggedActivity` and `planPreview` local variables (lines 100-101)
- Remove tool execution branches: `log_food` (152-165), `log_workout` (167-181), `log_water` (183-195), `adjust_plan` (197-215)
- Simplify mode classification (line 258): remove `LOG_TOOLS.has(tn)` check — `hasPersonal` = only `get_user_stats`
- Remove `loggedActivity` and `planPreview` from return object (lines 269-270)

### `web/lib/ai/types.ts`
- Remove `PlanPreviewPayload` import (line 2)
- Remove `loggedActivity` and `planPreview` from `AIChatMeta` (lines 28, 30)

### `web/app/api/ai/chat/route.ts`
- Remove `loggedActivity` and `planPreview` from the `done` event meta (lines 171, 173)

---

## 2. Client: Remove slash commands entirely

### Delete file: `web/components/ai-chat/slash-menu.tsx`

### `web/components/ai-chat/types.ts`
- Remove `SlashCommand` interface, `buildSlashCommands()`, `filterSlashCommands()` (lines 20-59)
- Remove `Dictionary` import (line 2)

### `web/components/ai-chat/chat-input.tsx`
- Remove imports: `AnimatePresence`, `Sparkles`, `SlashMenu`, `buildSlashCommands`, `filterSlashCommands`, `SlashCommand`
- Remove all slash-related state/effects/callbacks: `highlight`, `wasOpenRef`, `commands`, `slashOpen`, `filtered`, `filteredCount`, `closeMenu`, `selectCommand`
- Remove slash menu rendering (AnimatePresence + SlashMenu block, lines 102-118)
- Remove `SlashChip` from the suggestion chips row (line 121)
- Remove `SlashChip` component definition (lines 172-190)
- Remove slash-related keyboard handling from `handleKeyDown`
- Remove `aria-autocomplete`, `aria-expanded`, `aria-haspopup`, `aria-controls` from input (no longer a combobox)
- Simplify: just suggestion chips + text input + send button

### `web/lib/i18n/dictionaries/en.ts`
- Remove: `openSlashMenu`, `slashChip`, `slashTitle`, `slashAria`, `noMatchCommands`, `slashHint`, `slash` object (lines 938-960)
- Update `inputPlaceholder`: `'Ask the AI coach a fitness question…'`
- Update `suggested` array: remove `'Help me plan this week's workouts'`, replace with a Q&A suggestion
- Update `home.subtitle`: remove "or plan your training"
- Update `home.placeholder`: remove plan references
- Update `home.chips`: remove `'Plan my workout for today'`, replace with a Q&A chip

---

## 3. Client: Remove plan preview from coach context & widget

### `web/components/ai-chat/coach-context.tsx`
- Remove `PlanPreviewPayload` import
- Remove `planPreview`, `openPlanPreview`, `clearPlanPreview` from `CoachContextValue` interface
- Remove `planPreview` state and related callbacks
- Remove from `value` memo and dependency array

### `web/components/ai-chat/hooks/use-chat-stream.ts`
- Remove `PlanPreviewPayload` import
- Remove `onLoggedActivity` and `onPlanPreview` from `UseChatStreamArgs` interface
- Remove them from `applyEvent` function signature and body (lines 54-55, 82-83)
- Remove them from hook params and dependency array (lines 111-112, 176, 185, 207)

### `web/components/ai-chat/ai-chat-widget.tsx`
- Remove `useDashboardActions` import
- Remove `openPlanPreview` from `useCoach()` destructuring
- Remove `invalidate` / `useDashboardActions()` call
- Remove `onLoggedActivity` and `onPlanPreview` from `useChatStream` call

### `web/components/dashboard/dashboard-client.tsx`
- Remove `planPreview`, `clearPlanPreview` from `useCoach()` destructuring (line 68)
- Remove `confirmingPlan` state (line 70)
- Remove `handleConfirmPlan` callback (lines 100-123)
- Remove `PlanPreviewPayload` import (line 19)
- Remove `confirmWorkoutPlan` import (line 20)
- Remove the coach-driven `<PlanDetailSheet>` at lines 188-197
- Check if `useCoach` is still needed; if not, remove import

---

## 4. Eval: No golden set changes needed

The golden set (`agent-golden-set.json`) has no logging/plan test cases — all entries are knowledge, personal, hybrid, or small_talk. The baseline thresholds (`agent-baseline.json`) remain unchanged.

---

## Files changed (summary)

| File | Action |
|------|--------|
| `web/lib/ai/agent-tools.ts` | Edit: remove 4 tools + rewrite system prompt |
| `web/lib/ai/agent.ts` | Edit: remove logging/plan execution + imports |
| `web/lib/ai/types.ts` | Edit: remove planPreview/loggedActivity from meta |
| `web/app/api/ai/chat/route.ts` | Edit: remove planPreview/loggedActivity from SSE done event |
| `web/components/ai-chat/slash-menu.tsx` | **Delete** |
| `web/components/ai-chat/types.ts` | Edit: remove SlashCommand + helpers |
| `web/components/ai-chat/chat-input.tsx` | Edit: remove slash menu + chip, simplify |
| `web/components/ai-chat/coach-context.tsx` | Edit: remove plan preview state |
| `web/components/ai-chat/hooks/use-chat-stream.ts` | Edit: remove onLoggedActivity + onPlanPreview |
| `web/components/ai-chat/ai-chat-widget.tsx` | Edit: remove dashboard refresh + plan preview wiring |
| `web/components/dashboard/dashboard-client.tsx` | Edit: remove coach plan preview sheet + confirm logic |
| `web/lib/i18n/dictionaries/en.ts` | Edit: remove slash strings, update suggestions/placeholders |

---

## Verification

1. `cd web && npm run typecheck` — must pass (no broken imports/types)
2. `cd web && npm run lint` — must pass
3. `cd web && npm run build` — must succeed
4. Manual: open the coach, verify slash chip is gone, starters still show, sending a question works

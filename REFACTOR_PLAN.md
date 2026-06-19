# FitCore 重构 / 修复计划

本计划基于一次全面代码审查，按「不修会出事 → 影响正确性 → 可维护性 → 健壮性 → 清理」五个阶段推进。
每个阶段可独立交付、独立验收。建议严格按阶段顺序，因为 P0 会改动所有 server action 的签名，后续阶段都建立在新签名上。

> 统一验收门：
> - 前端：`cd web && npm run typecheck && npm run lint && npm run build`
> - 后端：`cd rag && ruff check . && pytest`

## 阶段总览

| 阶段 | 主题 | 风险 |
|------|------|------|
| P0 | 安全加固（必做） | 高（改全部 action 签名） |
| P1 | 正确性修复 | 中 |
| P2 | 可维护性重构 | 中 |
| P3 | 健壮性 | 低 |
| P4 | 清理 | 极低 |

---

## P0 — 安全加固（必做）

### P0-1 服务端鉴权：消除越权（IDOR）
- **问题**：全部 ~30 个 action 从客户端参数接收 `userId`，无 `auth()` 校验。
- **改法**：
  1. 新建 `web/lib/auth/require-user.ts`，导出 `requireUserId()`（内部 Supabase `auth.getUser()` 从会话 cookie 解析身份，无 user 抛 `UNAUTHORIZED`）。
  2. 改造所有「按用户」的 action：删除 `userId` 形参，函数体内 `const userId = await requireUserId()`。
  3. 改所有调用点（客户端组件）去掉传 `userId` 实参。
  4. 统一返回：未登录 `{ success: false, error: 'UNAUTHORIZED' }`（getter 返回 `null`）。
- **验收**：篡改请求无法访问他人数据；`typecheck` 通过（签名变更暴露漏改调用点）。

### P0-2 资源归属校验（plan / exercise mutation）
- **问题**：`getPlanById/updatePlan/deletePlan`、`updateExercise/deleteExercise` 仅凭 id 操作。
- **改法**：操作前查 `creator_id`/`created_by` 与 `requireUserId()` 比对，不符返回 `FORBIDDEN`；系统模板/公共动作只读或管理员判断。

### P0-3 Supabase 访问改为带身份
- **问题**：全局 anon 客户端，服务端无用户 JWT，安全全靠 RLS（仓库无 RLS 定义）。
- **改法**：服务端用 service-role 客户端 + 已验证 `userId`（Supabase Auth 会话）应用层过滤；补 RLS migration；客户端直查（`nutrition-center.tsx`、`training-history.tsx`）改走 server action。

### P0-4 后端 sessionId 路径穿越
- **问题**：`history_store.py` 用 `session_id` 直接拼文件名。
- **改法**：校验 `^[A-Za-z0-9_-]{1,128}$`，`Path.resolve()` 后断言仍在 storage_path 下。
- **验收**：新增 `tests/test_history_store.py` 覆盖 `../`、绝对路径、超长、合法 UUID。

### P0-5 RAG 接口鉴权 + 限流 + 错误不外泄
- **问题**：`/v1/retrieve`、`/v1/chat` 无鉴权无限流；500 返回 `str(e)`；CORS `allow_credentials=True` + `*`。
- **改法**：
  1. `X-API-Key` 校验依赖（前端 `rag-client.ts` 带上 header）。
  2. 进程内简易限流（按 IP/key）。
  3. 异常：服务端 log 全栈，客户端只回稳定 code + 通用文案。
  4. CORS：生产显式 origin；用 `*` 时 `allow_credentials=False`。

---

## P1 — 正确性修复

- **P1-1 灌库后缓存失效打通**：灌库脚本与 API 共享 `CacheManager`；灌库后 `invalidate_cache()` + 清查询缓存。
- **P1-2 Chroma 重灌去重**：写入前按 `source` 删除旧记录，或用确定性 chunk id upsert。
- **P1-3 SSE 收尾丢事件**：`use-chat-stream.ts` 读循环结束后，buffer 非空再解析一次。
- **P1-4 消息持久化别 fire-and-forget**：`route.ts` 发 `done` 前 `await` 持久化；失败在 meta 返回 `persisted:false`。
- **P1-5 错误处理不再吞 error**：去掉 `.single() as { data; error: null }`，正常解构并区分「无数据」与真错误。

---

## P2 — 可维护性重构

- **P2-1 收敛「今日训练」三份逻辑**：以 `lib/plans/today-workout.ts` 纯函数为唯一来源，两个 action 只取数后调用；补单测。
- **P2-2 消除 `as any` / `@ts-ignore`**：重新生成 `database.types.ts`；为 nested join 定义关系类型；JSONB 用 `satisfies Json`。
- **P2-3 统一 action 模板**：抽共享鉴权 helper（`authedUserId()` 返回结果型 shape、`getUserIdOrNull()` 返回 null 型），替换各 action 重复的 `try{ requireUserId() }catch{}` 样板；因 action 返回 shape 异构（null / 数组 / 默认值 / 结果对象），采用轻量 helper 而非统一 HOF 包装，保证返回 shape 与调用点零改动。
- **P2-4 首页拆 RSC**：`getDashboardData` 提到 server component，数据作 props；交互部分保留 client 子组件。

---

## P3 — 健壮性

- **P3-1 Zod 校验**：高风险 action 加 schema（onboarding 范围、饮食/训练宏量、plan 创建）。
- **P3-2 时区**：`getTodayDate()` 改本地 / `Asia/Shanghai`，审查调用点。
- **P3-3 PostgREST 过滤注入**：`exercises.ts` 的 `.or(...)` 转义 `,%'` 或改 `textSearch`/RPC。
- **P3-4 并发与冗余**：`incrementExerciseUsage` 改 RPC 原子自增；`getDashboardData` 合并重复的 weekly 查询。

---

## P4 — 清理

- **P4-1 死代码**：`rag-client.ts` 的 `chatWithRag`、后端 `similarity_threshold`、未用的 `nltk`。
- **P4-2 元信息**：包名 `my-project` → `fitcore-web`；`eslint-config-next` 对齐 16.x。
- **P4-3 日志**：去掉打印 userId/完整 payload 的 `console.log`，统一走 `lib/logger.ts`。
- **P4-4 可访问性**：流式气泡 `aria-live`；`confirm()` 换 Radix `AlertDialog`；`TOAST_REMOVE_DELAY` 改合理值。
- **P4-5 杂项**：后端 `/v1/health/ready`；retrieve 超时进 settings；`markdown_parser` 的 `link_count` 修正；`docx_parser` 的 `.doc` 误判。

---

## 执行进度

- [x] P0-1 服务端鉴权 requireUserId（所有 action 移除客户端 userId 形参，改 Supabase `auth.getUser()`；调用点全部修正；typecheck + lint 0 error）
- [x] P0-2 资源归属校验（plan: updatePlan/deletePlan/setCurrentPlan/getPlanById；exercise: update/delete 校验 created_by + is_system）
- [x] P0-3（方案 A）服务端化 Supabase 访问：`supabaseClient.ts` 改 `import 'server-only'` + service-role key（anon key 不再进浏览器）；新增 `app/actions/history.ts`（`getNutritionByDate` / `getWorkoutHistory`，按 `getUserIdOrNull` 限定本人 + 日期正则校验），`nutrition-center.tsx` / `training-history.tsx` 的客户端直查全部改走 action；middleware `proxy.ts` 改用 service-role key；env 示例/README 同步（移除前端 anon key）；typecheck + lint 0 error
  - [ ] P0-3（方案 B，待你连库）叠加纵深防御：业务表全表开 RLS，策略用 Supabase Auth 身份（`auth.uid() = user_id`，user_id 列为 Supabase user uuid）。方案 A 已堵住公开 anon key 的全表泄露，B 作为数据库层兜底，建议有测试环境后再加。
- [x] P0-4 sessionId 路径穿越（正则白名单 + resolve 越界检查；新增 tests/test_history_store.py）
- [x] P0-5 RAG 接口鉴权 / 限流 / 错误处理（X-API-Key 依赖 + 滑窗限流 + 422/500 错误映射 + CORS 凭证修正；前端 rag-client 带 header）
- [x] P1-1 灌库缓存失效（ingest 脚本共享 CacheManager；按 backend 提示是否需重启 API）
- [x] P1-2 Chroma 重灌去重（add_texts 前按 source delete，杜绝重复片段）
- [x] P1-3 SSE 收尾（读循环结束后 flush 残留 buffer，最后的 done/error 不再丢）
- [x] P1-4 消息持久化 await（发 done 前 await 写库，meta.persisted 反馈结果）
- [x] P1-5 错误处理（getUserGoals/getDailyStats/getDailyWorkoutStats 去掉吞 error 的 cast，区分 PGRST116）
- [x] P2-1 今日训练逻辑收敛（两处 server 实现统一委托 `lib/plans/today-workout.ts` 纯函数；文案格式对齐）
- [x] P2-2 消除 any / ts-ignore（**已完成，无需重生成类型**：`database.types.ts` 本就完整，`@ts-ignore`/`(supabase as any)` 是 supabase-js 写入泛型的老毛病而非类型过期。写入路径删除全部 `@ts-ignore` 并简化 JSONB cast 为直接赋值；`exercises.ts`/`plans.ts` 去掉 `(supabase as any)`，nested join 改为「保留类型化 client + 结果用手写关系类型 `as unknown as`」，并补 `WorkoutDayInsert`/`PlanExerciseInsert` 等别名；`lib/ai` 的 `any[]` 收敛为 `DietLogItem[]`/`WorkoutLogItem[]`（顺带修正 agent.ts 读错字段导致运动记录恒显示「运动 0分钟」的潜在 bug）。server actions + lib/ai 内 `any`/`@ts-ignore` 归零；typecheck 0 error、lint 0 error（warning 18→5）。）
- [x] P2-3 统一 action 鉴权（新增 `authedUserId()` / `getUserIdOrNull()` 共享 helper，替换 9 个 action 文件里的 `let userId; try{}catch{}` 样板；保持各 action 返回 shape 不变，调用点零改动；lint 0 error）
- [x] P2-4 首页拆 RSC（`app/page.tsx` 改 async server component：`auth()` 服务端鉴权 + `redirect`、`currentUser()` 取用户名、服务端 `getDashboardData()` 首屏直出，去掉骨架闪烁；交互逻辑（nav 切换 / 重取 / 浮层）下沉到新 `components/dashboard/dashboard-client.tsx`；重取改用 `useTransition`；typecheck 0 error）
- [x] P3-1 Zod 入参校验（新增 `lib/validation/schemas.ts`：`dietLogInputSchema`/`onboardingDataSchema`/`nutritionRecommendationSchema`/`planMetaSchema`；应用到 `saveDietLog`/`updateDietLog`(宏量非负+食物名)、`calculateNutritionRecommendation`/`saveOnboardingData`(年龄/身高/体重范围+枚举)、`createPlan`/`createCustomPlan`(名称非空+频次1-7)；失败回 `{success:false,error}`，调用点零改动；typecheck 0 error）
- [x] P3-2 时区（`getTodayDate` 改 `Asia/Shanghai`，修每日记录跨午夜串行问题；周聚合的 UTC 边界为次要项，暂留）
- [x] P3-3 过滤注入（exercises 搜索 `.or()` 入参做转义/清洗，提前在 P0 一并修复）
- [~] P3-4 并发与冗余（已去掉 getDashboardData 内重复的 getWeeklyActivity；incrementExerciseUsage 原子自增需 RPC migration，**infra 阻塞**）
- [~] P4 清理项
  - [x] retrieve 超时入 settings；删除死代码 `chatWithRag`；包名 `my-project`→`fitcore-web`
  - [x] P4-3 日志：移除 logFood/logWorkout/logWater 中打印 userId/完整 payload 的 `console.log`，并把 query/update/insert 的 `console.error` 收敛为只打 `.message`（不再 dump 整个 error 对象）
  - [x] P4-4（部分）`TOAST_REMOVE_DELAY` 1_000_000ms → 5000ms；AI 流式气泡加 `aria-live="polite"` + `role="status"`，光标 `aria-hidden`
  - [x] P4-5 后端：删死代码 `similarity_threshold` / 未用依赖 `nltk`；新增 `/v1/health/ready` 就绪探针（+test）；`markdown_parser` 的 `link_count` 修为 `count('](')`；`docx_parser` 不再认领旧版 `.doc`/`application/msword`（python-docx 只支持 .docx）
  - [ ] P4-4（待办）`confirm()` → Radix `AlertDialog`（涉及 UI 组件，留待后续）
  - [ ] P4-3（待办）其余 catch 块 `console.error` 统一走 `lib/logger.ts`（低价值、改动面大，暂留）

> 说明：后端验收门已可本地跑——`rag/.venv`（Python 3.11）下 `ruff check .` 干净、`pytest` 全绿（52 passed），CI（`rag-ci.yml`）每 PR 也会跑。

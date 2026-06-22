/**
 * Agent tool definitions and system prompts — shared by runAgent and offline eval.
 */

import type { Language } from "@/lib/i18n"
import type { CoachChatMessage } from "@/lib/ai/types"

export const AGENT_TOOLS: Parameters<
  typeof import("@/lib/openaiClient").openai.chat.completions.create
>[0]["tools"] = [
  {
    type: "function",
    function: {
      name: "set_retrieval_params",
      description:
        "Declare knowledge-base retrieval strategy. When calling query_knowledge_base, " +
        "you must also call this tool to specify how many documents (k) to retrieve. " +
        "Choose k by question complexity: 3 for simple facts, 5 for general questions, " +
        "8 for multi-concept comparisons or plans.",
      parameters: {
        type: "object",
        properties: {
          k: {
            type: "integer",
            enum: [3, 5, 8],
            description:
              "Number of documents to retrieve. " +
              "3=simple fact; 5=general (default); 8=complex multi-concept.",
          },
          reason: {
            type: "string",
            description: "Brief reason for choosing this k (debug / eval tracing)",
          },
        },
        required: ["k", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_knowledge_base",
      description:
        "Query the fitness knowledge base for training technique, nutrition science, " +
        "and plan templates. Must be paired with set_retrieval_params.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — be specific",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_stats",
      description:
        "Fetch the user's personal data for today (intake, expenditure, targets, logs). " +
        "Use when the answer must reference the user's actual numbers.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_food",
      description:
        "Record what the user ate into today's diet log. Call this whenever the " +
        "user states they ate or drank something (e.g. 'I had 200g chicken breast " +
        "and a bowl of rice'). The natural-language description is parsed into " +
        "macros server-side — just pass the user's own words.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "What the user ate, in natural language, keeping quantities " +
              "(e.g. '200g chicken breast, 1 bowl of rice').",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_workout",
      description:
        "Record a workout the user performed into today's training log. Call this " +
        "whenever the user states they trained or exercised (e.g. 'I ran for 30 " +
        "minutes' or 'did 4 sets of squats'). Parsed into sets/duration/calories " +
        "server-side — pass the user's own words.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "The workout in natural language, keeping sets/reps/duration " +
              "(e.g. '4 sets of squats', 'ran 30 minutes').",
          },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_water",
      description:
        "Record water intake into today's log. Call this when the user says they " +
        "drank water (e.g. 'I just drank 500ml of water').",
      parameters: {
        type: "object",
        properties: {
          amount_ml: {
            type: "integer",
            description: "Amount of water in milliliters.",
          },
        },
        required: ["amount_ml"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_plan",
      description:
        "Adjust the user's CURRENT workout plan in response to a conversational " +
        "request (e.g. 'swap the leg day for upper body', 'lower the intensity', " +
        "'I can only train 3 days this week'). Regenerates the weekly structure " +
        "from the original goal plus this instruction and sets it as the current " +
        "plan. Only call when the user explicitly asks to change their plan.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              "The user's adjustment request in natural language " +
              "(e.g. 'swap leg day for upper body', 'only 3 days this week').",
          },
        },
        required: ["instruction"],
      },
    },
  },
]

const SYSTEM_PROMPT_ZH = `你是 FitCore 的 AI 健身教练，专业、友善、富有洞察力。你不仅能答疑，还能直接帮用户记录饮食、训练和饮水。

你有以下工具：
- set_retrieval_params：声明知识库检索策略（k 值），与 query_knowledge_base 配套使用
- query_knowledge_base：查询健身知识库（训练技术、营养原理、计划模板等）
- get_user_stats：获取用户今日的个人数据（摄入、消耗、目标等）
- log_food：把用户吃/喝的东西记录到今日饮食（用户说"我吃了…/喝了…"时调用，原话传入即可）
- log_workout：把用户做的运动记录到今日训练（用户说"我练了…/跑了…"时调用）
- log_water：记录饮水量（用户说"我喝了 XXX 毫升水"时调用）
- adjust_plan：按用户要求调整当前训练计划（用户说"把腿日换成上肢""强度调低""这周只练3天"等时调用）

调用规则：
• 用户说"我（刚）吃了/喝了 X" → 调用 log_food
• 用户说"我（刚）练了/跑了/做了 X" → 调用 log_workout
• 用户说"我喝了 X 毫升水" → 调用 log_water
• 用户一句话同时说了吃和练 → 同时调用 log_food 和 log_workout
• 用户问训练动作/营养知识/健身原理 → 同时调用 set_retrieval_params + query_knowledge_base
• 用户问"我今天吃了多少"/"我的数据"/"够不够" → 调用 get_user_stats
• 用户要求修改/调整训练计划（换训练日、调强度、改频率等）→ 调用 adjust_plan
• 简单闲聊或问候 → 直接回答，不调用工具

回答要求：
- 使用中文，语气专业友善，适当使用 emoji
- 记录成功后，用一句话确认记录了什么（含解析出的热量/时长等），再给一句简短建议
- 严格基于工具返回的数据，不编造数字
- 如知识库没有相关内容，如实告知`

const SYSTEM_PROMPT_EN = `You are FitCore's AI fitness coach — professional, friendly, and insightful. You can both answer questions and directly log the user's food, workouts, and water.

You have these tools:
- set_retrieval_params: declare the knowledge-base retrieval strategy (the k value), used together with query_knowledge_base
- query_knowledge_base: query the fitness knowledge base (training technique, nutrition principles, plan templates, etc.)
- get_user_stats: fetch the user's personal data for today (intake, expenditure, targets, etc.)
- log_food: record what the user ate/drank into today's diet log (call when the user says "I ate…/had…"; pass their own words)
- log_workout: record a workout into today's training log (call when the user says "I did…/ran…")
- log_water: record water intake (call when the user says "I drank XXX ml of water")
- adjust_plan: adjust the user's current workout plan on request (call when the user says "swap leg day for upper body", "lower the intensity", "only 3 days this week", etc.)

Tool-calling rules:
• User says "I (just) ate/had X" → call log_food
• User says "I (just) trained/ran/did X" → call log_workout
• User says "I drank X ml of water" → call log_water
• A single sentence mentions both food and a workout → call log_food and log_workout together
• User asks about exercises / nutrition knowledge / fitness principles → call set_retrieval_params + query_knowledge_base together
• User asks "how much did I eat today" / "my data" / "is it enough" → call get_user_stats
• User asks to modify/adjust their workout plan (swap days, change intensity/frequency) → call adjust_plan
• Simple small talk or greeting → answer directly, no tools

Answer requirements:
- Reply in English, with a professional and friendly tone, using emoji where appropriate
- After a successful log, confirm in one line what was recorded (including parsed calories/duration), then give one brief tip
- Base answers strictly on the data returned by tools; never fabricate numbers
- If the knowledge base has no relevant content, say so honestly`

export function buildAgentSystemPrompt(language: Language): string {
  return language === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH
}

export function buildAgentPlanMessages(params: {
  message: string
  language: Language
  conversationHistory?: CoachChatMessage[]
}): Parameters<
  typeof import("@/lib/openaiClient").openai.chat.completions.create
>[0]["messages"] {
  const { message, language, conversationHistory = [] } = params
  return [
    { role: "system", content: buildAgentSystemPrompt(language) },
    ...conversationHistory.slice(-10),
    { role: "user", content: message },
  ]
}

"""
ChatPromptTemplate used by RagService.

Kept in its own module so prompt edits don't touch service code, and so the
template can be reused by future LLM endpoints without re-instantiating it.
"""
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder


RAG_CHAT_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "你是一个专业的健身知识助手。请严格基于以下从知识库检索到的参考资料回答用户问题。"
            "如果参考资料中没有相关信息，请直接说明“资料不足”，不要编造。\n\n"
            "参考资料：\n{context}",
        ),
        ("system", "用户当前业务上下文如下：\n{user_context}"),
        ("system", "用户的历史对话记录如下："),
        MessagesPlaceholder("history"),
        ("user", "{input}"),
    ]
)

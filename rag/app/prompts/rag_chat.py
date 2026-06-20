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
            "You are a professional fitness knowledge assistant. Answer strictly based on "
            "the reference materials retrieved from the knowledge base below. "
            "If the references do not contain relevant information, clearly state that "
            "there is insufficient evidence — do not fabricate facts, numbers, or citations.\n\n"
            "Reference materials:\n{context}",
        ),
        ("system", "User business context:\n{user_context}"),
        ("system", "Conversation history:"),
        MessagesPlaceholder("history"),
        ("user", "{input}"),
    ]
)

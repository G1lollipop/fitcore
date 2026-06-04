"""
Pure-static knobs for the RAG pipeline.

Anything that comes from an env var lives in app.core.settings instead;
this module is just for compile-time constants the codebase references.
"""

# ── MD5 dedupe state ──────────────────────────────────────────────────────
md5_path = "./md5.text"

# ── Vector store (Chroma local) ───────────────────────────────────────────
collection_name = "rag"
persist_directory = "./chroma"

# ── Chunking ──────────────────────────────────────────────────────────────
chunk_size = 1000
chunk_overlap = 100
separators = ["\n\n", "\n", ".", "!", "?", "。", "！", "？", " ", ""]
max_split_char_number = 1000

similarity_threshold = 1

# ── Embedding model ───────────────────────────────────────────────────────
# Hardcoded — DashScope's text-embedding-v4 is the only model the Supabase
# migration's vector(1024) is dimensioned for. Changing this requires also
# rerunning the SQL migration with the new dim.
embedding_model_name = "text-embedding-v4"

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

# ── Embedding model ───────────────────────────────────────────────────────
# The embedding model + output dimension now live in app.core.settings
# (EMBEDDING_MODEL / EMBEDDING_DIM) because the dimension must stay in sync with
# the Supabase migration's vector(N) and is therefore env-tunable. See
# app/infra/embeddings.py.

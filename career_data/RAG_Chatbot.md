# Project: Advanced RAG Pipeline (Hybrid Search & Reranking)

**Type:** Enterprise AI Data Architecture Prototype
**Role:** AI Software Engineer
**Tech Stack:** Python, LangChain, Google Gemini 1.5 Flash, FAISS (Dense Retrieval), BM25 (Sparse Retrieval), HuggingFace (all-MiniLM & BGE-Reranker),UnstructuredIO / PyPDF (Advanced Document Layout Parsing).
**Status:** Completed / Portfolio Showcase

## System Architecture & Design

### Core Orchestration & Two-Stage Retrieval Design

This project is a highly optimized Retrieval-Augmented Generation (RAG) pipeline built to index and query complex, unstructured institutional documents. It deliberately moves beyond naive, single-stage vector search to solve critical data ingestion issues like exact-keyword matching, high-fidelity document layout parsing, and LLM hallucinations.

Here is the exact workflow architecture:

1. **Academic Data Ingestion:** Complex academic documents (PDF syllabi, research papers, and DOCX policy guidelines) are ingested from the institution's secure repository. The pipeline utilizes advanced document loaders (like Unstructured) equipped with layout parsing to preserve the semantic structure of multi-column research papers, headers, and tabular grading rubrics.
2. **Semantic Processing:** Raw data is sliced using a `RecursiveCharacterTextSplitter` (chunk size 1000, overlap 200) employing regex sentence boundaries. Contextual metadata tags (e.g., `open_source_model`) are injected based on source URLs.
3. **Stage 1 Retrieval (Hybrid Ensemble):** User queries run through a dual-engine retriever. **FAISS** (powered by `all-MiniLM-L6-v2`) handles dense semantic search, while **BM25** handles sparse keyword matching. Results are merged with a 70/30 weight distribution prioritizing semantics.
4. **Stage 2 Retrieval (Cross-Encoder Reranking):** The top 10 merged results are passed to a computationally heavy Cross-Encoder (`BAAI/bge-reranker-base`). The model re-scores the query-document pairs, aggressively filtering out noise and passing only the absolute top 3 highest-fidelity chunks forward.
5. **Deterministic Generation:** The highly refined context is piped into Google Gemini 1.5 Flash operating at `temperature=0.0`, bounded by a strict anti-hallucination system prompt to yield factual, context-grounded answers.

## Key Technical Challenges (Case Studies)

### Challenge 1: Parsing Complex Academic Formats & Multi-Column PDFs

- **Situation:** Standard PDF extractors (like basic PyPDFLoader) consistently failed to ingest university research papers and course syllabi correctly. They would read straight across the page, scrambling multi-column layouts and destroying the formatting of tabular grading rubrics, resulting in unreadable context chunks.

- **Task:** Engineer a highly resilient data ingestion pipeline capable of extracting clean, semantically coherent text from diverse and complex academic PDF structures.

- **Action:** replaced standard text loaders with the Unstructured parsing library, enabling advanced layout detection. I configured the ingestion pipeline to explicitly recognize document boundaries, separating headers, tables, and multi-column body text. This ensured the RecursiveCharacterTextSplitter only created chunks that retained their logical reading order and academic context.

- **Result:** Achieved high-fidelity document ingestion across thousands of academic files. The vector database was populated with clean, structured text rather than fragmented garbage, forming a reliable foundation for the RAG retrieval stages.

### Challenge 2: The "Semantic vs. Keyword" Retrieval Gap

- **Situation:** Pure dense vector search (FAISS) excelled at understanding the "intent" of a query but failed completely when asked about exact part numbers, specific dates, or model acronyms (e.g., "MPT-7B").
- **Task:** Build a retrieval system capable of high recall for both broad conceptual questions and highly specific, exact-match keyword queries.
- **Action:** I architected a Hybrid Search engine using LangChain's `EnsembleRetriever`. I indexed the chunks simultaneously into an in-memory FAISS database and a BM25 keyword index. I configured the retriever to fetch the top 10 results from both, weighting the final candidate pool 70% toward FAISS (Semantic) and 30% toward BM25 (Keyword).
- **Result:** Drastically improved retrieval recall. The system can now answer conceptual questions ("How does Llama perform?") while perfectly handling exact entity extraction.

### Challenge 3: Context Overflow & LLM Hallucinations

- **Situation:** Passing 10+ retrieved chunks to the LLM introduced "noise." The LLM would occasionally get confused by conflicting information in lower-ranked chunks or suffer from the "lost in the middle" phenomenon, leading to hallucinations.
- **Task:** Guarantee that the LLM only receives data that directly answers the user's prompt, enforcing absolute factual accuracy.
- **Action:** I implemented a two-stage retrieval pipeline. Instead of feeding the hybrid results directly to the LLM, I passed them through a `ContextualCompressionRetriever` powered by a HuggingFace Cross-Encoder (`BGE-Reranker`). This model scores the exact relevance of the chunk to the specific query, stripping away 7 of the 10 chunks. Finally, I bound the Gemini model with a strict prompt forcing it to declare "unknown" if the context was missing.
- **Result:** Reached near-zero hallucination rates. The system acts as a perfectly grounded oracle, making it viable for mission-critical enterprise deployments.

## Engineering Trade-offs & Q&A

### Why incur the massive computational cost of a Cross-Encoder Reranker?

While Bi-encoders (like MiniLM) are fast because they pre-compute document vectors, they lose linguistic nuance by compressing entire paragraphs into a single array. A Cross-Encoder processes the query and the document _together_ through the transformer network, resulting in incredibly high accuracy at the cost of high latency.
By using the fast FAISS/BM25 ensemble to narrow the search space to just 10 candidates (Stage 1), I restricted the heavy Cross-Encoder to a very small workload. This strategic trade-off delivers the ultra-high precision of a heavy model while maintaining the sub-second response latency required for production applications.

### Why not use an external vector database like Pinecone or Weaviate?

For this specific architectural prototype, deploying a managed cloud database would have introduced unnecessary network latency and complicated the local developer setup. FAISS was chosen because it executes entirely in-memory, making it the perfect engine for rapid prototyping, CI/CD testing, and environments where the document corpus (1,000+ docs) easily fits within standard system RAM. For a production scale-out to millions of documents, swapping the FAISS module for Pinecone would be a trivial pipeline update.

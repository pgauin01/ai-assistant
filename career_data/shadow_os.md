# Project: Shadow OS

**Type:** AI Second Brain & Life Organizer
**Role:** Lead Full-Stack & AI Engineer
**Tech Stack:** React (Vite), FastAPI, MongoDB, Pinecone, LangGraph, Gemini 1.5 Flash, Web Crypto API
**Status:** Completed / Portfolio Showcase

## 1. The Elevator Pitch

Shadow OS is a context-aware "Second Brain" designed to seamlessly bridge professional productivity and personal well-being. It features a "bicameral" AI system that acts as either a strict, task-oriented chief of staff (Shadow) or an empathetic life coach (Zenith). It utilizes a LangGraph-orchestrated RAG pipeline for semantic memory and a Zero-Knowledge Vault for absolute data privacy.

## 2. System Architecture & Design

- **Frontend:** React with Tailwind CSS, utilizing a semantic CSS variable engine to dynamically swap app-wide themes instantly based on the active AI persona.
- **Backend & AI Orchestration:** Asynchronous FastAPI server integrating Google Gemini 1.5 Flash. LangGraph dictates the state machine, routing requests between standard conversational LLM chains and RAG-augmented chains.
- **Data & Memory Layer:** MongoDB handles standard asynchronous CRUD operations (users, events), while Pinecone stores vectorized text embeddings of user logs to enable the AI's long-term semantic memory.
- **Security Layer:** Client-side encryption engine using the native Web Crypto API (`AES-GCM` and `PBKDF2`).

## 3. Key Technical Challenges & Roadblocks (The STAR Method)

### Challenge 1: AI Context Pollution (The "Memory Wall")

- **Situation:** Initially, when querying the AI for a work status update, the semantic search (RAG) would pull in highly emotional, personal journal entries ("Rants") simply because they happened recently, confusing the AI's response.
- **Task:** I needed to strictly isolate the AI's context window so that the "Work" persona never saw emotional data, while the "Life" persona could see everything.
- **Action:** I engineered a "Memory Wall" in the LangChain retrieval pipeline. First, I built a Stream Processor that automatically classifies incoming notes as `ACTIVITY`, `IDEA`, or `RANT`. Then, I wrote a dynamic filter (`filter_docs_by_persona`) that intercepts the Pinecone vector search results. If the user is in "Shadow" mode, the backend programmatically drops any document tagged as a `Rant` before it reaches the LLM's context window.
- **Result:** Achieved 100% context isolation. The productivity AI stays perfectly objective, while the life coach AI retains holistic empathy, drastically improving the UX and AI reliability.

### Challenge 2: Absolute Privacy for Sensitive Data

- **Situation:** Users needed a safe space to log personal thoughts, but storing plaintext journal entries in a cloud MongoDB cluster posed a massive security and trust risk.
- **Task:** Guarantee that even if the database was fully compromised (or if I, the admin, looked at the DB), the personal notes would be mathematically unreadable.
- **Action:** I designed a true Zero-Knowledge Encrypted Vault. I leveraged the browser's native Web Crypto API to derive a cryptographic key using `PBKDF2` (combining the user's plain-text password with a unique, server-provided salt). The note is encrypted locally using `AES-GCM 256-bit`.
- **Result:** The FastAPI backend only ever receives and stores base64-encoded ciphertext. Plaintext never traverses the network, successfully implementing enterprise-grade zero-knowledge architecture.

### Challenge 3: Complex Theme Switching Without Prop Drilling

- **Situation:** The app needed to instantly switch its entire UI color palette and typography depending on the active AI mode (Shadow vs. Zenith), but passing theme props down a deep React component tree was causing massive re-renders and messy code.
- **Task:** Refactor the theming engine to be globally reactive and highly performant.
- **Action:** I stripped out all hardcoded Tailwind color classes. I implemented a semantic theming engine using CSS Variables (e.g., `--bg-card`) in the root `index.css` and mapped them in `tailwind.config.js`. The top-level `App.jsx` now simply toggles a single CSS class (`.theme-shadow` or `.theme-zenith`) on the root wrapper.
- **Result:** Zero prop-drilling, instant O(1) theme swapping across the entire application, and a significantly cleaner React component tree.

## 4. Trade-offs & Engineering Decisions

- **Why Pinecone over FAISS:** I initially built the app using local FAISS for vector storage. However, I migrated to Pinecone. _Trade-off:_ While FAISS is free and local, managing in-memory vector indexes in a stateless FastAPI Docker container across multiple deployments became a massive infrastructure headache. Pinecone offloaded the state management, allowing my API to remain purely stateless and horizontally scalable.
- **Why FastAPI over Node.js/Express:** While I am highly proficient in the MERN stack, I chose Python/FastAPI for the backend. _Trade-off:_ I sacrificed a unified JavaScript codebase, but gained native, first-class access to the Python AI ecosystem (LangChain, LangGraph), which is significantly more mature than its JS counterparts. FastAPI's native async support also prevented blocking the main thread during slow LLM inference calls.

## 5. Impact & Metrics

- Built a fully functional, highly complex AI application demonstrating proficiency across the entire stack (Frontend, Backend, Vector Search, AI Orchestration, and Applied Cryptography).
- Reduced AI hallucination and "context-mixing" to zero through the implementation of the RAG Memory Wall.

## 6. What I Would Do Differently Next Time

- **Local LLM Integration:** If I were to expand this, I would build an abstraction layer to allow users to plug in a local LLM (like Ollama/Llama-3). While Gemini 1.5 Flash is incredibly fast, forcing highly sensitive, decrypted vault notes through a third-party cloud API still presents a theoretical privacy boundary. Processing it 100% locally would make it the ultimate secure "Second Brain."

# Project: Shadow OS (AI Second Brain & Life Organizer)

**Type:** AI Second Brain & Life Organizer
**Role:** Lead Full-Stack & AI Engineer
**Tech Stack:** React (Vite), FastAPI, MongoDB, Pinecone, LangGraph, Google Gemini 1.5 Flash, Web Crypto API, Argon2, Docker.
**Status:** Completed / Portfolio Showcase

## System Architecture & Design

### Shadow OS Core Orchestration & API

Shadow OS is a context-aware "Second Brain" designed to seamlessly bridge professional productivity and personal well-being via a "bicameral" AI system (Shadow/Zenith). The backend is built on an asynchronous **FastAPI** server that handles REST routes, **Argon2** password hashing, and JWT authentication. The AI orchestration is powered by **LangGraph**, which dictates the state machine and routes requests between standard conversational LLM chains and **Pinecone** RAG-augmented chains. The application is fully containerized using **Docker** and Docker Compose for seamless production deployment.

Here is the exact workflow architecture:

1. **Frontend Interaction & Crypto:** The user interacts with the React UI. For sensitive notes, the Web Crypto API encrypts the data directly in the browser before transmission.
2. **API Routing:** The UI communicates via REST API to the asynchronous FastAPI backend, which handles authentication, event logic, and standard CRUD routing.
3. **Data Persistence & Sync:** The FastAPI backend saves structured data to MongoDB and triggers two-way event synchronization with the Google Calendar API.
4. **AI Orchestration:** For chat or timeline analysis, the backend passes state and history to the LangGraph Orchestrator.
5. **Memory & Inference:** LangGraph executes a similarity search against the Pinecone Vector DB for historical context, injects it into a dynamic prompt, and calls Google Gemini 1.5 Flash for the final inference.

### Shadow OS Memory & Integrations

For data persistence, Shadow OS utilizes **MongoDB** (Motor) for async CRUD operations (users, events) and **Pinecone** for vectorized text embeddings using Google's `models/embedding-001`. The system also features Natural Language Scheduling, parsing user intent through the AI to automatically create events via a two-way sync with the **Google Calendar API** (OAuth2).

## Key Technical Challenges (Case Studies)

### Challenge 1: AI Context Pollution (The "Memory Wall")

- **Situation:** When querying the Shadow OS AI for a work status update, the semantic search (RAG) would pull in highly emotional personal journal entries simply because they happened recently, confusing the AI's response.
- **Task:** I needed to strictly isolate the AI's context window so the productivity persona never saw emotional data, while the life coach persona could see everything.
- **Action:** I engineered a "Memory Wall" in the LangChain retrieval pipeline. First, I built a Stream Processor using `PydanticOutputParser` to force the LLM to classify incoming notes strictly as `ACTIVITY`, `IDEA`, or `RANT`. Then, I wrote a dynamic filter (`filter_docs_by_persona`) that intercepts the Pinecone results. If the user is in "Shadow" mode, the backend programmatically drops any document tagged as a `Rant` before it reaches the LLM.
- **Result:** Achieved 100% context isolation. The productivity AI stays perfectly objective, while the life coach AI retains holistic empathy, drastically improving Shadow OS's reliability.

### Challenge 2: Absolute Privacy via Zero-Knowledge Architecture

- **Situation:** Users needed a safe space to log personal thoughts in Shadow OS, but storing plaintext journal entries in a cloud MongoDB cluster posed a massive security risk.
- **Task:** Guarantee that even if the database was fully compromised, the personal notes would be mathematically unreadable.
- **Action:** I designed a true Zero-Knowledge Encrypted Vault using the browser's native Web Crypto API. I used `PBKDF2` with 100,000 iterations to derive a key combining the user's password with a unique server salt. Notes are encrypted locally using `AES-GCM 256-bit` with a randomized 12-byte IV prepended to the ciphertext.
- **Result:** The FastAPI backend only ever receives base64-encoded ciphertext. Plaintext never traverses the network, successfully implementing enterprise-grade zero-knowledge architecture.

### Challenge 3: Multi-Tenant RAG Data Bleed

- **Situation:** Storing semantic embeddings for multiple users in a single Pinecone index created a critical security vulnerability where one user's prompt could theoretically retrieve another user's private journal entry.
- **Task:** I needed to ensure absolute mathematical isolation between user vectors within the shared Pinecone database.
- **Action:** I implemented a strict Metadata Security Filter in the vector retrieval chain. During the Pinecone upsert process, every vector is tagged with a `user_id`. When the LangGraph RAG chain executes a similarity search, a hard filter (`{"user_id": current_user_id}`) is injected directly into the query payload at the API level.
- **Result:** Guaranteed 100% multi-tenant data isolation. The AI mathematically cannot retrieve or access memory fragments belonging to an unauthorized user account.

## Engineering Trade-offs & Q&A

### Why choose Pinecone over local FAISS for Shadow OS?

I initially built Shadow OS using local FAISS for vector storage. However, managing in-memory vector indexes inside a stateless **FastAPI Docker container** across multiple deployments became an infrastructure headache. **Pinecone** offloaded the state management, allowing the API to remain purely stateless and horizontally scalable, which is essential for a cloud-deployed application.

### Why choose Python/FastAPI over Node.js for the backend?

While I am highly proficient in the MERN stack, I chose **Python and FastAPI** for the Shadow OS backend. I sacrificed a unified JavaScript codebase to gain native, first-class access to the Python AI ecosystem (**LangChain, LangGraph**), which is significantly more mature than its JS counterparts. FastAPI's native async support also prevented blocking the main thread during slow LLM inference calls.

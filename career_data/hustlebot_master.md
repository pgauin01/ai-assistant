# Project: HustleBot (Autonomous AI Job Search Orchestrator)

**Role:** Lead AI & Full-Stack Engineer
**Type:** Production-grade autonomous AI agent for pipeline automation and semantic data evaluation.
**Tech Stack:** Python, LangGraph, Google Gemini 2.0 Flash, OpenRouter (Llama 3.3 70B Instruct), Playwright, BeautifulSoup, Streamlit, GitHub Actions, Google Sheets API, Telegram API.

## System Architecture & Design

### HustleBot Core Orchestration (LangGraph & GitHub Actions)

HustleBot operates on a dual-trigger system. The core logic is designed as a Directed Acyclic Graph (DAG) state machine using **LangGraph**.

Here is the exact workflow architecture:

1. **Multi-Source Scrapers:** The pipeline begins by pulling raw HTML data from various job boards.
2. **Deduplication Node:** Jobs are immediately checked against the CRM memory grid to drop duplicates.
3. **Strict Keyword Filter:** A hard-coded gatekeeper drops jobs missing essential tech stack requirements.
4. **Gemini 2.0 Scorer:** Jobs that pass the filter are sent to the LLM for semantic evaluation and scored from 0 to 100.
5. **Google Sheets CRM:** Only elite jobs (Score > 80) are appended to the persistent database.
6. **Telegram Exec Summary:** The system fires an HTML-formatted alert to the user's phone for immediate review.

### HustleBot Intelligence Engine & Persistence

HustleBot acts as an automated technical recruiter. It pulls data from Wellfound, Y Combinator, RemoteOK, and LinkedIn, then passes it to **Google Gemini 2.0 Flash**. Gemini scores the jobs (0-100), and a strict Gatekeeper node ensures only jobs scoring 80+ are saved. To manage these records, HustleBot implements the **Google Sheets API** as a persistent CRM database, while alerting the user via formatted **Telegram** HTML notifications (featuring unicorn badges for 90+ scores and One-Click Apply links).

## Key Technical Challenges (Case Studies)

### Challenge 1: Bypassing Enterprise Anti-Bot Protection (Cloudflare)

- **Situation:** Dynamic React SPAs like Y Combinator and Wellfound utilized enterprise-grade bot protection (Cloudflare, DataDome) that instantly blocked HustleBot's standard HTTP requests.
- **Task:** I needed to engineer a scraping mechanism for HustleBot that could bypass these walls without getting IP banned.
- **Action:** I architected a two-phase **Playwright** extraction strategy for HustleBot. Phase 1 mimics human interaction (custom headers, viewport sizing, programmatic lazy-load scrolling). Phase 2 utilizes a "Deep Fetch" loop with custom `PlaywrightTimeoutError` handling.
- **Result:** Successfully bypassed anti-bot walls, allowing the script to snatch DOM text even if heavy tracking scripts timed out, achieving a 100% successful extraction rate.

### Challenge 2: LLM Rate Limiting and Failover Architecture

- **Situation:** Relying solely on Google Gemini for HustleBot created a single point of failure. Hitting a 429 Rate Limit during a 150-job batch would crash the entire pipeline.
- **Task:** I needed to build a highly fault-tolerant AI routing system that could seamlessly switch models mid-execution if the primary API failed.
- **Action:** I built a **Hybrid AI Router** inside the LangGraph pipeline. If Gemini 2.0 fails or is rate-limited, the system dynamically catches the error and pipes the exact same prompt configuration into OpenRouter's API, utilizing Meta's `Llama-3.3-70B-Instruct` as a fallback.
- **Result:** Eliminated pipeline crashes due to upstream rate limits, ensuring HustleBot maintains 24/7 reliability at zero additional infrastructure cost.

### Challenge 3: API Quota Exhaustion (Google Sheets 429 Errors)

- **Situation:** Writing to the CRM database on every single job match quickly exhausted Google Cloud's API write quotas for HustleBot.
- **Task:** I had to optimize the database write frequency without losing any scraped job data.
- **Action:** I implemented a **"Shift-Left Deduplication"** architecture. HustleBot downloads the entire sheet into a memory grid once per run. Jobs are deduplicated in-memory using an MD5 hash (`platform_title_url`). Finally, a safety valve enforces a single `append_rows` bulk API call, capped at 30 jobs per day.
- **Result:** Reduced API write calls by 98%, ensuring the CRM scales infinitely without hitting Google's rate limits.

### Challenge 4: Open-Source LLM JSON Parsing Hallucinations

- **Situation:** While proprietary models return strict JSON, open-source fallback models (like Llama 3) frequently hallucinated Markdown formatting (e.g., wrapping outputs in ` ```json `), causing HustleBot's `json.loads()` pipelines to crash.
- **Task:** I needed to build a fault-tolerant parsing mechanism to guarantee strict JSON output from unpredictable open-source models.
- **Action:** I developed a robust, custom JSON extraction utility for HustleBot. The parser actively strips markdown backticks and utilizes string traversal (`str.find('{')` and `str.rfind('}')`) to isolate and extract the core JSON dictionary from noisy text streams.
- **Result:** Completely eliminated LLM-induced pipeline crashes caused by conversational filler or markdown, ensuring data flows smoothly into the Google Sheets CRM.

## Engineering Trade-offs & Q&A

### Why choose LangGraph over a standard LangChain chain for HustleBot?

Job hunting is a stateful, cyclic process. **LangGraph** allowed me to manage the state of the data between disparate nodes (Scrapers -> Deduplication -> LLM Gatekeeper -> Persistence) in HustleBot. It also provided the necessary cyclic routing so I could implement batch-retry logic (like the Hybrid AI Router failover to Llama 3) if an LLM failed to parse a specific job description.

### How does HustleBot handle unformatted or messy data from web scraping?

The data pipeline passes all HTML through **BeautifulSoup** to strip tags, then uses a custom Regex normalizer to remove excess whitespace and newline characters. This drastically reduces the token count before the data is injected into the Gemini 2.0 prompt, saving context window space and improving the LLM's attention on the actual technical requirements.

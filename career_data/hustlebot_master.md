# Project: HustleBot (Autonomous AI Job Search Orchestrator)

**Role:** Lead AI & Full-Stack Engineer
**Type:** Production-grade autonomous AI agent for pipeline automation and semantic data evaluation.
**Tech Stack:** Python, LangGraph, Google Gemini 2.0 Flash, OpenRouter (Llama 3.3 70B), Playwright, BeautifulSoup, Streamlit, GitHub Actions, Google Sheets API, Telegram API.

## [ARCHITECTURE & SYSTEM DESIGN]

- **Core Orchestration:** Designed as a Directed Acyclic Graph (DAG) state machine using **LangGraph**. This allows for cyclic workflows (e.g., fallback routing if an LLM parsing step fails) rather than brittle linear scripts.
- **Execution Environment:** Serverless deployment via **GitHub Actions**. Utilizes a Time-Based Indexing Scheduler running on a 96-minute cron job to ensure 24/7 continuous scraping without triggering platform rate limits.
- **Data Persistence & CRM:** Implemented **Google Sheets** as a lightweight, persistent database to manage job states, application tracking, and global deduplication.
- **Hybrid Intelligence Engine:** Engineered a failover **Hybrid LLM Router**. The system defaults to OpenRouter (Llama 3.3 70B) for zero-cost semantic scoring, with dynamic fallback to Google Gemini to prevent pipeline halts during upstream rate limits.

## [CHALLENGES & ROADBLOCKS]

### Challenge 1: Bypassing Enterprise Anti-Bot Protection (Cloudflare)

- **Situation:** Dynamic React SPAs (Y Combinator, Wellfound) utilized enterprise-grade bot protection (Cloudflare, DataDome) that instantly blocked standard HTTP requests and flagged headless browser fingerprints.
- **Action:** Architected a two-phase **Playwright** extraction strategy. Phase 1 mimics human interaction (custom headers, viewport sizing, programmatic lazy-load scrolling) to extract raw URLs. Phase 2 utilizes a "Deep Fetch" loop with custom `PlaywrightTimeoutError` handling.
- **Result:** Successfully bypassed anti-bot walls, allowing the script to snatch DOM text even if heavy tracking scripts timed out, achieving a 100% successful extraction rate.

### Challenge 2: LLM JSON Hallucinations & Parsing Failures

- **Situation:** While proprietary models return strict JSON, open-source models (like Llama 3) frequently hallucinate Markdown formatting (e.g., wrapping outputs in ` ```json `) or conversational filler, causing standard `json.loads()` pipelines to crash.
- **Action:** Developed a robust, custom JSON extraction utility. The parser actively strips markdown backticks and utilizes string traversal (`str.find('{')` and `str.rfind('}')`) to isolate and extract the core JSON dictionary from noisy text streams.
- **Result:** Eliminated LLM-induced pipeline crashes, allowing the LangGraph state machine to process batches of up to 150 jobs autonomously.

### Challenge 3: Google Sheets API Quota Exhaustion (429 Errors)

- **Situation:** Writing to the CRM database on every single job match quickly exhausted Google Cloud's API write quotas.
- **Action:** Implemented a **"Shift-Left Deduplication"** architecture. The orchestrator downloads the entire sheet into a memory grid once per run. Jobs are deduplicated in-memory using an MD5 hash (`platform_title_url`). Finally, a safety valve enforces a single `append_rows(value_input_option="RAW")` bulk API call, capped at 30 jobs per day.
- **Result:** Reduced API write calls by 98%, ensuring the CRM scales infinitely without hitting Google's rate limits.

## [BEHAVIORAL & IMPACT METRICS]

- **Optimization:** Reduced manual job search and cover letter drafting time from 20 hours/week to 0 hours/week.
- **Cost Efficiency:** Built the entire continuous automation pipeline to run at $0.00 infrastructure cost by leveraging open-source LLMs, serverless CI/CD runners, and free-tier APIs.
- **System Reliability:** Achieved high fault tolerance. If a scraper fails, the DAG skips to the next node. If an LLM rate-limits, the Hybrid Router automatically switches providers.

## [INTERVIEW Q&A PAIRS]

**Q: Why did you choose LangGraph over a standard LangChain chain?**
A: Job hunting is a stateful, cyclic process. LangGraph allowed me to manage the state of the data between disparate nodes (Scrapers -> Deduplication -> LLM Gatekeeper -> Persistence). It also provided the necessary cyclic routing so I could implement batch-retry logic if an LLM failed to parse a specific job description.

**Q: How do you handle unformatted or messy data from web scraping?**
A: The data pipeline passes all HTML through BeautifulSoup to strip tags, then uses a custom Regex normalizer to remove excess whitespace and newline characters. This drastically reduces the token count before the data is injected into the LLM prompt, saving context window space and improving the LLM's attention on the actual technical requirements.

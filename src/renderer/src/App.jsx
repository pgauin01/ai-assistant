import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism' // VS Code Dark Theme
import mermaid from 'mermaid'

const SLASH_COMMANDS = [
  { id: 'explain', icon: '📖', label: 'Explain', desc: 'Deep technical explanation' },
  { id: 'fix', icon: '🛠️', label: 'Fix', desc: 'Fix and explain broken code' },
  { id: 'create', icon: '✨', label: 'Create', desc: 'Write a production-ready program' },
  { id: 'stack', icon: '🧱', label: 'Stack', desc: 'Configure core tech stack' },
  { id: 'clear', icon: '🗑️', label: 'Clear', desc: 'Clear the chat history' },
  // { id: 'system', icon: '🎧', label: 'Wiretap', desc: 'Listen to system audio (10s)' },
  { id: 'exit', icon: '🚪', label: 'Exit', desc: 'Save transcript and close app' },
  // --- NEW: Z-Macro Commands for fast testing ---
  { id: 'z-hustlebot', icon: '🤖', label: 'HustleBot', desc: 'tell me about hustle bot' },
  { id: 'z-shadowos', icon: '🧠', label: 'Shadow OS', desc: 'tell me about shadow os' },
  { id: 'z-kirana', icon: '🛒', label: 'Kirana', desc: 'tell me about kirana store' },
  { id: 'z-rag', icon: '🎓', label: 'RAG Chatbot', desc: 'tell me about my RAG project' }
]

const BACKEND_BASE_URL = 'http://127.0.0.1:8000'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const createMeetingSessionId = () =>
  `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const fetchBackend = async (path, options = {}, retries = 4, retryDelayMs = 250) => {
  let lastError
  const url = `${BACKEND_BASE_URL}${path}`

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await delay(retryDelayMs)
    }
  }

  throw lastError
}

function App() {
  const [input, setInput] = useState('')
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const inputRef = useRef(null)
  const dragStateRef = useRef(null)
  const transcriptRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const stopRecordingTimeoutRef = useRef(null)
  const micToastTimeoutRef = useRef(null)
  const isRecordingRef = useRef(false)
  const isThinkingRef = useRef(false)
  const [showVisionMenu, setShowVisionMenu] = useState(false)
  const recordingStartTimeRef = useRef(null)
  const [pendingCommand, setPendingCommand] = useState(null)
  const [micToast, setMicToast] = useState('')
  const abortControllerRef = useRef(null)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [visionMode, setVisionMode] = useState('create')
  const [isLiveTranscribing, setIsLiveTranscribing] = useState(false)
  const isLiveTranscribingRef = useRef(false)
  const liveWsRef = useRef(null)
  const meetingSessionIdRef = useRef(createMeetingSessionId())
  const [isSaving, setIsSaving] = useState(false)
  const [isBackendReady, setIsBackendReady] = useState(false)
  const messagesRef = useRef([])
  const DEFAULT_STACK = `- Backend: Python, FastAPI, Node.js, Express, Django\n- Frontend: React, JavaScript, modern web standards, Streamlit\n- Cloud & DevOps: AWS, Azure, GCP, Docker, Kubernetes, CI/CD pipelines\n- AI/ML: Generative AI, Advanced RAG, LangGraph, LangChain, Vector DBs, LiteLLM, AWS Bedrock, Azure AI services`

  // Load from local storage, or use default
  const [techStack, setTechStack] = useState(
    () => localStorage.getItem('userTechStack') || DEFAULT_STACK
  )
  const [selectedModel, setSelectedModel] = useState('lightning:lightning-ai/gpt-oss-20b')
  const [showSettings, setShowSettings] = useState(false)
  const [editableSummary, setEditableSummary] = useState('')

  // Save to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('userTechStack', techStack)
  }, [techStack])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    isLiveTranscribingRef.current = isLiveTranscribing
  }, [isLiveTranscribing])

  // --- NEW: Listen for Global Scroll Hotkeys ---
  useEffect(() => {
    if (window.api && window.api.onScrollAction) {
      const cleanup = window.api.onScrollAction((direction) => {
        if (transcriptRef.current) {
          // 300px is a smooth, readable jump. Increase to 400 for faster scrolling.
          const scrollAmount = 300
          transcriptRef.current.scrollBy({
            top: direction === 'down' ? scrollAmount : -scrollAmount,
            behavior: 'smooth'
          })
        }
      })
      return () => cleanup?.()
    }
  }, [])

  useEffect(() => {
    let pollInterval

    const checkBackendHealth = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/health')
        if (response.ok) {
          console.log('Backend is online!')
          setIsBackendReady(true)
          // Stop polling once we get a successful response
          clearInterval(pollInterval)
        }
      } catch (error) {
        // Expected behavior while the Python server is still booting up
        console.log('Waiting for backend to start...')
      }
    }

    // Poll every 1 second (1000ms) until connected
    if (!isBackendReady) {
      pollInterval = setInterval(checkBackendHealth, 1000)

      // Fire it once immediately so we don't wait a full second for the first check
      checkBackendHealth()
    }

    return () => clearInterval(pollInterval) // Cleanup on unmount
  }, [isBackendReady])

  const showMicToast = (message, duration = 1200) => {
    if (micToastTimeoutRef.current) {
      clearTimeout(micToastTimeoutRef.current)
      micToastTimeoutRef.current = null
    }

    setMicToast(message)
    micToastTimeoutRef.current = setTimeout(() => {
      setMicToast('')
      micToastTimeoutRef.current = null
    }, duration)
  }

  // --- NEW: Render Mermaid Diagrams ---
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#1F2937',
        primaryTextColor: '#FFFFFF',
        primaryBorderColor: '#3B82F6',
        lineColor: '#9CA3AF',
        textColor: '#FFFFFF',
        background: 'transparent',

        // 1. THE FIX: Stop using 'inherit'. Force the measuring engine to use a modern, wide font.
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

        // 2. THE FIX: Sync the internal math font-size with the CSS font-size below
        fontSize: '12px'
      },
      themeCSS: `
        .node text, .nodeLabel { 
          font-size: 12px !important; 
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }
        .edgeLabel text { 
          font-size: 11px !important; 
        }
      `,
      flowchart: {
        htmlLabels: false, // MUST remain false
        padding: 20, // Bumped up slightly to 20 to give extra breathing room
        nodeSpacing: 50,
        rankSpacing: 50
      },
      securityLevel: 'loose'
    })

    // Re-render Mermaid blocks when their source text changes (streaming-safe).
    const timer = setTimeout(
      async () => {
        try {
          const nodes = Array.from(document.querySelectorAll('.mermaid'))
          for (const node of nodes) {
            const source = (
              node.getAttribute('data-mermaid-definition') ||
              node.textContent ||
              ''
            ).trim()
            const prevSource = node.getAttribute('data-mermaid-source') || ''
            if (source && source !== prevSource) {
              node.textContent = source
              node.removeAttribute('data-processed')
              node.setAttribute('data-mermaid-source', source)
            }
          }
          await mermaid.run({ nodes })
        } catch (e) {
          console.error('Mermaid rendering failed:', e)
        }
      },
      isThinking ? 220 : 80
    )

    return () => clearTimeout(timer)
  }, [messages, isThinking])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    isThinkingRef.current = isThinking
  }, [isThinking])

  useEffect(() => {
    setInputText(input)
  }, [input])

  useEffect(() => {
    if (window.api && window.api.onFocusInput) {
      const cleanup = window.api.onFocusInput(() => {
        inputRef.current?.focus()
      })

      return () => cleanup?.()
    }

    return undefined
  }, [])

  // Listen for the Global Hotkey from Electron
  useEffect(() => {
    if (window.api && window.api.onToggleMic) {
      const cleanup = window.api.onToggleMic(() => {
        // Because we are in a closure, we use a ref to check the current recording state
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording()
        } else {
          startRecording()
        }
      })

      return () => cleanup?.()
    }

    return undefined
  }, [])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages, isThinking])

  useEffect(() => {
    return () => {
      if (stopRecordingTimeoutRef.current) {
        clearTimeout(stopRecordingTimeoutRef.current)
        stopRecordingTimeoutRef.current = null
      }
      if (micToastTimeoutRef.current) {
        clearTimeout(micToastTimeoutRef.current)
        micToastTimeoutRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  // 1. Listen for Ctrl+T
  useEffect(() => {
    if (window.api && window.api.onToggleLiveTranscription) {
      const cleanup = window.api.onToggleLiveTranscription(() => {
        toggleLiveTranscription()
      })
      return () => cleanup?.()
    }
  }, [])

  useEffect(() => {
    if (window.api && window.api.onTriggerSmartVision) {
      const cleanup = window.api.onTriggerSmartVision(() => {
        handleSmartVision()
      })
      return () => cleanup?.()
    }
  }, [])

  useEffect(() => {
    if (window.api && window.api.onMoondreamTrigger) {
      const cleanup = window.api.onMoondreamTrigger(() => {
        void (async () => {
          const tempId = Date.now()
          setMessages((prev) => [
            ...prev,
            {
              id: tempId,
              role: 'system',
              content: '📸 Capturing screen & running Moondream analysis...'
            }
          ])
          setIsThinking(true)

          try {
            const response = await fetchBackend('/agent/moondream-pipeline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model_name: selectedModel,
                tech_stack: techStack
              })
            })

            if (!response.ok || !response.body) {
              throw new Error(`Moondream pipeline request failed (${response.status})`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder('utf-8')
            let aiText = ''

            setMessages((prev) => [
              ...prev.filter((msg) => msg.id !== tempId),
              { role: 'assistant', content: '' }
            ])

            while (true) {
              const { value, done } = await reader.read()
              if (done) break
              aiText += decoder.decode(value, { stream: true })
              setMessages((prev) => {
                const newMsgs = [...prev]
                const lastIndex = newMsgs.length - 1
                if (lastIndex >= 0) {
                  newMsgs[lastIndex] = {
                    ...newMsgs[lastIndex],
                    content: aiText
                  }
                }
                return newMsgs
              })
              await new Promise((resolve) => requestAnimationFrame(resolve))
            }
          } catch (error) {
            console.error('Moondream Pipeline Failed:', error)
            setMessages((prev) => [
              ...prev.filter((msg) => msg.id !== tempId),
              {
                role: 'assistant',
                content: 'Moondream pipeline failed. Check backend logs and retry.'
              }
            ])
          } finally {
            setIsThinking(false)
          }
        })()
      })
      return () => cleanup?.()
    }

    return undefined
  }, [selectedModel, techStack])

  // 2. Stream the Rust audio to Python
  useEffect(() => {
    if (window.api && window.api.onLiveSystemAudioChunk) {
      const cleanup = window.api.onLiveSystemAudioChunk((chunk) => {
        if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN) {
          liveWsRef.current.send(chunk)
        }
      })
      return () => cleanup?.()
    }
  }, [])

  const endMeeting = async () => {
    if (isSaving) return

    setIsSaving(true)

    try {
      const response = await fetchBackend('/agent/export-markdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: meetingSessionIdRef.current,
          messages: messagesRef.current
        })
      })

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to export Markdown archive:', error)
    } finally {
      const ws = liveWsRef.current
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
      liveWsRef.current = null
      setIsLiveTranscribing(false)
      window.api.stopLiveSystemCapture()
      setIsSaving(false)
      meetingSessionIdRef.current = createMeetingSessionId()
    }
  }

  const toggleLiveTranscription = () => {
    if (isLiveTranscribingRef.current) {
      void endMeeting()
    } else {
      // START LIVE TRANSCRIPTION
      meetingSessionIdRef.current = createMeetingSessionId()
      const ws = new WebSocket('ws://127.0.0.1:8000/ws/live-transcribe')
      liveWsRef.current = ws

      ws.onopen = () => {
        setIsLiveTranscribing(true)

        // --- THE FIX: Inject a fresh message into the chat UI to hold the stream ---
        setMessages((prev) => [...prev, { role: 'user', content: '🎧 **[Live System Audio]:** ' }])

        // Tell the Rust backend to start capturing OS audio!
        window.api.startLiveSystemCapture()
      }

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.text) {
          setMessages((prev) => {
            const newMessages = [...prev]
            const lastIndex = newMessages.length - 1

            // --- THE FIX: Check ONLY the very last message ---
            // If the absolute last message is our active audio block, append to it.
            if (
              lastIndex >= 0 &&
              newMessages[lastIndex].content?.includes('🎧 **[Live System Audio]:**')
            ) {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content: newMessages[lastIndex].content + ' ' + data.text
              }
            } else {
              // If the last message is an AI reply (or anything else),
              // spawn a BRAND NEW audio block at the bottom of the chat!
              newMessages.push({
                role: 'user',
                content: '🎧 **[Live System Audio]:** ' + data.text
              })
            }

            return newMessages
          })
        }
      }

      ws.onclose = () => {
        setIsLiveTranscribing(false)
        liveWsRef.current = null
        window.api.stopLiveSystemCapture()
      }
    }
  }

  const appendLastSentences = (count) => {
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]

    // Make sure we are extracting from the live audio bubble
    if (!lastMsg.content.includes('[Live System Audio]')) return

    // Strip the prefix out
    const rawText = lastMsg.content.replace('🎧 **[Live System Audio]:**', '').trim()

    // This matches sentences ending in punctuation OR the unpunctuated fragment at the end!
    const sentences = rawText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)

    let textToAppend = ''
    if (!sentences) {
      // If there's no punctuation yet, just grab whatever words are there
      textToAppend = rawText
    } else {
      // Grab the last X sentences, trim extra spaces, and join them
      textToAppend = sentences
        .slice(-count)
        .map((s) => s.trim())
        .join(' ')
    }

    if (textToAppend) {
      // --- THE FIX: Replace the input instead of appending ---
      setInput(textToAppend + ' ')
      setInputText(textToAppend + ' ')
      // -------------------------------------------------------

      // Auto-focus the input box so you can keep typing immediately
      inputRef.current?.focus()
    }
  }

  const handleContextualAction = async (actionType) => {
    const summaryContext = editableSummary.trim()
    const liveMsg = [...messages].reverse().find((m) => m.content?.includes('[Live System Audio]'))
    const rawText = liveMsg ? liveMsg.content.replace('🎧 **[Live System Audio]:**', '').trim() : ''

    // Build the Hybrid Context Block
    let contextBlock = ''
    if (summaryContext && rawText) {
      contextBlock = `[PRIMARY INTENT - User Summary]:\n"${summaryContext}"\n\n[SUPPORTING DETAILS - Raw Audio Transcript]:\n"${rawText}"`
    } else if (summaryContext) {
      contextBlock = `[PRIMARY INTENT - User Summary]:\n"${summaryContext}"`
    } else if (rawText) {
      contextBlock = `[Raw Audio Transcript]:\n"${rawText}"`
    }

    if (!contextBlock) {
      showMicToast('No active context found.')
      return
    }
    // 3. Define the prompts based on the action
    let displayCommand = ''
    let augmentedPrompt = ''

    switch (actionType) {
      case 'behavioral':
        displayCommand = 'Behavioral & Leadership (STAR Method)'

        try {
          const ragResponse = await fetch('http://localhost:8000/search-career', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: rawText })
          })
          const ragData = await ragResponse.json()
          console.log('RAG Data:', ragData)

          // Overwrite the default context with the hydrated RAG context
          contextBlock = `
[RELEVANT PAST EXPERIENCE]
${ragData.context}

[LIVE INTERVIEW TRANSCRIPT]
${rawText}
`
        } catch (error) {
          console.error('FAISS DB unreachable, falling back to default context.', error)
        }

        displayCommand = 'Behavioral & Leadership (STAR Method)'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: Provide a behavioral interview answer using the STAR method designed specifically as a SPOKEN INTERVIEW SCRIPT.

CRITICAL CONTEXT RULE: 
If both a "User Summary" and "Raw Audio Transcript" are provided below, use the User Summary to identify the user's real past projects to use as the realistic setting for the story. Use the Raw Transcript to identify the core behavioral question being asked (e.g., conflict, failure, leadership, tight deadlines).

Rules:
1. Tone & Style: Act as a pragmatic Senior Software Engineer. Use first-person ("I realized we had a bottleneck..."). Be humble, highly collaborative, but explicitly own your impact. Avoid arrogant phrasing.
2. NO chatbot fluff. Start immediately with heading 1.
3. DYNAMIC FORMATTING: Format EXACTLY with these markdown headings IN THIS EXACT ORDER:
   ### 1. The Hook (TL;DR)
   ### 2. Situation & Task
   ### 3. Action (My Contribution)
   ### 4. Result & Metrics
   ### 5. The Retrospective (The Senior Perspective)
4. Under "The Hook", write 1 punchy spoken sentence summarizing the story (e.g., "This reminds me of a time I had to push back on a product manager to prevent a major production outage...").
5. Under "Situation & Task", write 2 sentences setting the stage. Keep the context brief and focused on the business problem.
6. Under "Action", use a standard Markdown bulleted list (*) of 3 specific technical or communicative steps YOU took. Bold the first few words of each bullet. Focus on pragmatic problem-solving, compromise, and communication.
7. Under "Result & Metrics", write 2 sentences detailing the positive business outcome. Include realistic, grounded metrics (e.g., "We hit the deadline and reduced deployment time by 40%").
8. Under "The Retrospective", write 1 or 2 sentences explaining what this taught you or what processes you changed because of it. (e.g., "Because of that incident, I now enforce early alignment meetings..."). This is critical for showing Senior-level growth.

Context Provided:
${contextBlock}`
        break
      case 'quick_answer':
        displayCommand = 'Quick Answer'
        augmentedPrompt = `[Quick Command: QUICK_ANSWER]
You are a pragmatic Senior Software Engineer. The user needs an immediate, on-the-spot answer to survive a live conversation or interview.

Task:
${contextBlock}

CRITICAL RULES FOR SPEED:
1. EXTREME BREVITY: Your entire response MUST be 5 sentences or less. CRITICAL: Use short, punchy sentences (max 15-20 words per sentence). Write exactly like a spoken conversation, do NOT output dense, robotic run-on sentences.
2. NO FORMATTING OVERHEAD: Do NOT use markdown headings, code blocks, or lists. Output plain text only. 
3. DIRECT ANSWER FIRST: Sentence 1 must definitively answer what the code does, what the bug is, or what the core concept is. 
4. THE "WHY" SECOND: Sentence 2 and 3 should state the "why" or the immediate fix in a grounded, conversational tone.
5. NO FLUFF: No greetings, no "Here is the answer." Start typing the solution on the very first word. 
6. PERSONA: Sound like a colleague whispering the answer to you across the desk. Use collaborative phrasing ("Looks like...", "I'd just...").`
        break
      case 'full_analysis':
        displayCommand = 'Full Interview Analysis'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: You are an elite Technical Interview Assistant. Analyze the provided interview context and generate a complete tactical breakdown.

CRITICAL CONTEXT RULE (THE "CONTEXT DRIFT" CHECK): 
First, compare the "User Summary" and the "Raw Audio Transcript" (if both exist).
- SOFT PIVOT: If they are related, the User Summary is the overarching goal. Use the Transcript to identify the current sub-topic or interruption.
- HARD PIVOT (BRAND NEW QUESTION): If the Transcript is completely unrelated to the User Summary, ASSUME THE SUMMARY IS OUTDATED. You MUST ignore the old User Summary completely and base your entire analysis on the Raw Audio.

Rules:
1. NO chatbot fluff. NO introductory sentences. Start immediately with heading 1.
2. Format EXACTLY with these headings:
   ### 1. The True Intent
   ### 2. The Current Pivot & Cheat Sheet
   ### 3. Architect Follow-Ups
   ### 4. Category

3. Under "The True Intent", write EXACTLY 1 to 2 clear sentences extracting the main task. CRITICAL: If they use misleading words (like "design" when asking about metrics), explicitly call out the true intent here. If a Hard Pivot occurred, explicitly state: "[HARD PIVOT] The interviewer has moved to a brand new question: [New Task]."
4. Under "Category", output EXACTLY ONE tag based on the CURRENT Question:
   - [CODING] (Algorithms, data structures, writing code)
   - [STRATEGY] (Product metrics, evaluating success, user satisfaction, telemetry. CRITICAL: If they ask HOW TO MEASURE or EVALUATE something, it is ALWAYS [STRATEGY].)
   - [CONCEPT] (Explaining how a technology works, comparing tools, selecting a specific technology like a database, or discussing trade-offs/criteria for a single component. CRITICAL: Use this if they ask "Which tool should we use and why?")
   - [SYSTEM DESIGN] (End-to-end technical architecture, system scaling, connecting APIs, drawing flowcharts. CRITICAL: Do NOT use this tag if they are just asking you to compare tools or list selection criteria for a single component.)
5. Under "The Current Pivot & Cheat Sheet", first write EXACTLY 1 bolded sentence stating what they are asking for right this second. Immediately below that, write EXACTLY 3 short bullet points in a first-person spoken tone that the candidate can read directly out loud to answer it.
6. Under "Architect Follow-Ups", write 2 highly intelligent clarifying questions tailored to the CURRENT question.

Context Provided:
${contextBlock}`
        break

      case 'design':
        displayCommand = 'System Design'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: Provide a SYSTEM DESIGN architecture designed specifically as a SPOKEN INTERVIEW SCRIPT.

CRITICAL CONTEXT RULE: 
If both a "User Summary" and "Raw Audio Transcript" are provided below, the User Summary (which may contain OCR text) is the ABSOLUTE TRUTH regarding the core question. Use the Raw Transcript ONLY to hunt for extra technical constraints.

Rules:
1. Tone & Style: Act as a pragmatic Senior Software Engineer with ~6 years of hands-on experience. Speak in a grounded, practical tone. Avoid grandiose 'Principal Architect' enterprise jargon (e.g., do not talk about "multi-year organizational migrations" or "abstract platform meshes"). 
2. Use collaborative phrasing ("I'd want to double-check the exact read-volume..."). CRITICAL: Actively suggest simpler, 'good enough' alternatives for early-stage scaling (e.g., "We could use Flink here, but honestly a simple Lambda might be enough for V1"). Do not sound like an overly confident textbook. Focus on getting the job done efficiently.
3. Format EXACTLY with these headings:
   ### 1. High-Level Architecture (Spoken overview)
   ### 2. End-to-End Data Flow (Conversational walkthrough)
   ### 3. Architecture Diagram
   ### 4. Database Strategy (Spoken justification)
   ### 5. Scalability & Bottlenecks
3. Under "Architecture Diagram", you MUST provide a valid Mermaid.js flowchart. 
   - CRITICAL: You MUST wrap the diagram EXACTLY in markdown code blocks like this:
   \`\`\`mermaid
   flowchart TD
   A["Node 1"] --> B["Node 2"]
   \`\`\`
   - Use double quotes around all node names to prevent syntax errors.
   - CRITICAL: For any node label longer than 3 words, you MUST insert a <br/> tag to logically wrap the text to the next line (e.g., A["Stream Processor:<br/>Quality Eval"]). Do not let single lines get too long.
4. CRITICAL: Output the structure EXACTLY ONCE. STOP generating immediately after section 5.
5. NO chatbot fluff. NO introductory sentences. NO code snippets EXCEPT for the Mermaid diagram block.

Context Provided:
${contextBlock}`
        break

      // 4. CODING DEEP DIVE ANSWER
      case 'coding':
        displayCommand = 'Coding Deep Dive'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: Provide a coding solution or explanation designed specifically as a SPOKEN INTERVIEW SCRIPT.

CRITICAL CONTEXT RULE: 
If both a "User Summary" and "Raw Audio Transcript" are provided below, the User Summary is the ABSOLUTE TRUTH. Use the Raw Transcript to detect if this is a FOLLOW-UP question.

Rules:
1. Tone & Style: Act as a pragmatic Senior Software Engineer with ~6 years of experience. Use first-person ("Since we need O(N) time, I'd reach for...").
2. Explain trade-offs practically. Mention that while a hyper-optimized solution exists, you generally prefer readable, maintainable code for the team unless performance is a strict bottleneck.
3. ZERO IMPORTS OR LIBRARIES: Solve problems using strictly built-in language features.
4. DYNAMIC FORMATTING: 
   - IF solving a new problem: Format EXACTLY with: ### 1. Optimal Approach, ### 2. Detailed Complexity Analysis, ### 3. Code Implementation.
   - IF answering a FOLLOW-UP: DO NOT generate a code block unless asked to write new code. Format EXACTLY with: ### 1. Spoken Explanation. Write a 2-paragraph conversational answer.
5. COMPLEXITY RULE: Under "### 2. Detailed Complexity Analysis",you MUST start by explicitly stating the final Big-O notation in bold (e.g., "**Time Complexity:** O(N * M)", "**Space Complexity:** O(N)"),Immediately following that You MUST write a detailed, conversational paragraph breaking down EXACTLY where the time and space costs come from. Discuss memory allocation bottlenecks (like string immutability), worst-case degradation, and why this specific approach scales safely to the constraints mentioned (e.g., 1 million records).
6. Code Block Rules: Wrap code in standard Markdown with proper newlines. Embed your narrative inside the code as highly detailed inline comments. Include an "Example Usage" section.

7. CRITICAL: Output the structure EXACTLY ONCE. STOP generating immediately after finishing. NO chatbot fluff.

Context Provided:
${contextBlock}`
        break

      // 5. STRATEGY, METRICS & PRODUCT ANSWER
      case 'strategy':
        displayCommand = 'Strategy & Metrics deep dive'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: Provide a product strategy and metrics explanation designed specifically as a SPOKEN INTERVIEW SCRIPT.

CRITICAL CONTEXT RULE: 
If both a "User Summary" and "Raw Audio Transcript" are provided below, the User Summary is the ABSOLUTE TRUTH. Use the Raw Transcript to detect if this is a FOLLOW-UP question.

Rules:
1. Tone & Style: Act as a pragmatic Senior Software Engineer with ~6 years of experience. Act as the CANDIDATE answering the interviewer. Use first-person ("To measure this, I would track..."). Do NOT act like an interviewer grading a candidate.
2. NO chatbot fluff. Start immediately with heading 1.
3. DYNAMIC FORMATTING: Format EXACTLY with these markdown headings IN THIS EXACT ORDER:
   ### 1. Core Strategy
   ### 2. Explicit Metrics (The Telemetry)
   ### 3. Implicit Metrics (User Behavior)
   ### 4. Edge Cases & Risks
4. Under "Core Strategy", write a 4-sentence conversational approach on how you would roll this out and measure its success (e.g., "I'd start with a shadow rollout or A/B test before committing..."). Do NOT describe the system architecture here.
5. Under "Explicit Metrics", provide a Markdown bulleted list of 4 specific technical metrics you would monitor. CRITICAL: You MUST format each bullet exactly like this: * **[Metric Name]:** [Spoken explanation of why].
6. Under "Implicit Metrics", provide a Markdown bulleted list of 3 specific user-behavior metrics. CRITICAL: You MUST format each bullet exactly like this: * **[Metric Name]:** [Spoken explanation].
7. Under "Edge Cases & Risks", provide a 3-sentence explanation of a real-world pitfall (e.g., "One risk here is cold-start latency causing users to bounce...").
8. FINAL FORMATTING CHECK: Look at Sections 2 and 3. You MUST use standard Markdown bullet points (*) and you MUST bold the metric name (**Name**). If you output "MetricName: explanation" instead of "* MetricName: explanation", you have failed.
Context Provided:
${contextBlock}`
        break
      // 6. TECHNICAL CONCEPT / THEORY (For verbal explanations & comparisons)
      case 'concept':
        displayCommand = 'Technical Deep Dive'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]
Task: Provide a TECHNICAL DEEP DIVE designed specifically as a SPOKEN INTERVIEW SCRIPT. 

CRITICAL CONTEXT RULE: 
If both a "User Summary" and "Raw Audio Transcript" are provided below, the User Summary is the ABSOLUTE TRUTH. Use the Raw Transcript ONLY for extra constraints.

Rules:
1. Tone & Style: Act as a pragmatic Senior Engineer (~6 years experience). Speak smoothly and naturally.
2. Compare tools based on operational reality, developer velocity, and team bandwidth. (e.g., "If my team doesn't have dedicated DevOps bandwidth, I almost always prefer the managed service, even if it costs a bit more..."). Avoid suggesting massive custom-built platforms.
3. Format EXACTLY with these headings:
   ### 1. The Elevator Pitch (Your opening statement)
   ### 2. Core Mechanics (Explain how it works conversationally)
   ### 3. Top Options & Trade-offs
   ### 4. Production Example (Walk them through a realistic scenario)
4. Under "Top Options & Trade-offs", DO NOT USE A TABLE. Write a natural, spoken comparison of 3 tools. 
5. CRITICAL: Output the structure EXACTLY ONCE. STOP generating immediately after section 4. NO chatbot fluff.

Context Provided:
${contextBlock}`
        break
    }

    // 4. Send the command to the AI
    await sendTextMessage(displayCommand, augmentedPrompt, actionType)
  }

  useEffect(() => {
    if (window.api && window.api.onTriggerAction) {
      const cleanup = window.api.onTriggerAction((actionType) => {
        if (actionType === 'quick_answer') {
          // Prevent triggering if a request is already in flight
          if (!isThinking) {
            console.log('🔥 Stealth Hotkey Triggered: Full Analysis')
            handleContextualAction('quick_answer')
          }
        }
      })
      return () => cleanup?.()
    }

    return undefined
  }, [isThinking, handleContextualAction])

  const closeOverlay = () => {
    setInput('')
    window.api.hideOverlay()
  }

  const sanitizeSummaryText = (text) =>
    text
      .trim()
      .replace(/^["'`\s]+/, '')
      .replace(/^they\s+want\s+you\s+to\s+/i, '')
      .replace(/^they\s+are\s+asking\s+how\s+to\s+/i, '')
      .replace(/^[:\-\s]+/, '')
      .replace(/["'`]+$/, '')
      .trim()

  const normalizeMermaidMarkdown = (text) => {
    if (!text) return text
    if (/```mermaid/i.test(text)) return text

    const normalized = text.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    const mermaidStartPattern =
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/

    const startIndex = lines.findIndex((line) => mermaidStartPattern.test(line))
    if (startIndex === -1) return text

    let endIndex = lines.length
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (/^\s*#{1,6}\s/.test(lines[i])) {
        endIndex = i
        break
      }
    }

    const prefix = lines.slice(0, startIndex).join('\n').trim()
    const mermaidBlock = lines.slice(startIndex, endIndex).join('\n').trim()
    const suffix = lines.slice(endIndex).join('\n').trim()
    const parts = []

    if (prefix) parts.push(prefix)
    parts.push(`\`\`\`mermaid\n${mermaidBlock}\n\`\`\``)
    if (suffix) parts.push(suffix)

    return parts.join('\n\n')
  }

  const extractRawMermaidBlock = (text) => {
    if (!text) return null
    if (/```mermaid/i.test(text)) return null

    const normalized = text.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')
    const mermaidStartPattern =
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/

    const startIndex = lines.findIndex((line) => mermaidStartPattern.test(line))
    if (startIndex === -1) return null

    const nonEmptyPrefix = lines.slice(0, startIndex).filter((line) => line.trim().length > 0)
    if (nonEmptyPrefix.length > 0) return null

    let endIndex = lines.length
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (/^\s*#{1,6}\s/.test(lines[i])) {
        endIndex = i
        break
      }
    }

    const block = lines.slice(startIndex, endIndex).join('\n').trim()
    return block || null
  }

  const sendTextMessage = async (displayCommand, augmentedPrompt = null, actionType = null) => {
    const payloadText = augmentedPrompt || displayCommand
    const text = payloadText.trim()

    if (!text) {
      showMicToast('Cannot send an empty command.')
      return
    }

    // 1. Handle Exit Command
    if (text.toLowerCase() === '/exit') {
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
      let markdown = `# Interview Meeting Transcript - ${dateStr}\n\n`

      messages.forEach((msg) => {
        const roleName = msg.role === 'user' ? '🧠 You / Live Audio' : '🤖 AI Assistant'
        markdown += `### ${roleName}\n${msg.content}\n\n---\n\n`
      })

      if (window.api && window.api.saveAndExit) {
        window.api.saveAndExit(markdown)
      } else {
        console.error('Electron API not found.')
      }
      return
    }

    // 2. Setup UI State
    const userMessage = { role: 'user', content: displayCommand }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInput('')
    setIsThinking(true) // Briefly show "Thinking..." while making the network request

    // --- BENCHMARK: Start High-Res Timer ---
    console.log(`\n🚀 --- BENCHMARK STARTING: [${displayCommand}] ---`)
    const startTime = performance.now()
    let ttft = null
    let charCount = 0

    try {
      const backendMessages = [...messages, { role: 'user', content: payloadText }]
      const MAX_CONTEXT_MESSAGES = 10
      const rollingContextMessages = backendMessages.slice(-MAX_CONTEXT_MESSAGES)

      const res = await fetch('http://127.0.0.1:8000/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: payloadText,
          messages: rollingContextMessages,
          tech_stack: techStack,
          model_name: selectedModel
        })
      })

      // The moment the server responds, drop the "Thinking..." pulse
      setIsThinking(false)

      // Inject a blank assistant message that we will actively type into
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      // Open the streaming pipeline
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let assistantReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const textChunk = decoder.decode(value, { stream: true })
        assistantReply += textChunk

        // --- BENCHMARK: Capture TTFT the moment the first characters arrive ---
        if (ttft === null && textChunk.trim() !== '') {
          ttft = (performance.now() - startTime) / 1000
          console.log(`⏱️ TTFT (Time To First Token): ${ttft.toFixed(3)} seconds`)
        }
        charCount += textChunk.length // Track length for TPS calc

        // --- THE FIX: Create a brand new message object ---
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1

          if (lastIndex >= 0) {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: assistantReply
            }
          }
          return newMessages
        })

        // Give Chromium a paint opportunity between streamed chunks in production builds.
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }

      // --- BENCHMARK: Final Calculations ---
      const totalTime = (performance.now() - startTime) / 1000
      const generationTime = totalTime - (ttft || 0) // Avoid NaN if ttft is null
      const estimatedTokens = Math.ceil(charCount / 4)
      const tps = generationTime > 0 ? estimatedTokens / generationTime : 0

      console.log(`🏁 Total Time: ${totalTime.toFixed(3)} seconds`)
      console.log(`📏 Estimated Tokens: ~${estimatedTokens}`)
      console.log(`⚡ TPS (Tokens Per Second): ${tps.toFixed(1)} tokens/sec`)
      console.log(`--------------------------------------------------\n`)

      // Execute specific post-processing action
      if (actionType === 'summary') {
        const cleanedSummary = sanitizeSummaryText(assistantReply)
        if (cleanedSummary) {
          setEditableSummary(cleanedSummary)
        }
      }
    } catch (error) {
      console.log('Error sending message:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error: Could not reach the AI backend or stream interrupted.'
        }
      ])
      setIsThinking(false)
    }
  }
  const sendVoiceMessage = async (audioBlob) => {
    setIsThinking(true)

    // --- NEW: Set up the Kill Switch ---
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }, 6000) // 10 second timeout for the transcription request
    // -----------------------------------

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')

      const res = await fetch('http://127.0.0.1:8000/agent/voice', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal // <-- Attach the signal
      })
      clearTimeout(timeoutId) // Clear if successful

      const data = await res.json()
      const transcript =
        typeof data?.transcript === 'string' && data.transcript.trim() ? data.transcript.trim() : ''

      if (transcript) {
        setInput(transcript)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.setSelectionRange(transcript.length, transcript.length)
        })
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Could not transcribe audio. Try again.' }
        ])
      }
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        showMicToast('Processing timed out.')
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Audio processing timed out.' }
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Error: Voice capture failed.' }
        ])
      }
    } finally {
      setIsThinking(false)
      abortControllerRef.current = null
    }
  }

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
  }

  const startRecording = async (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (isThinkingRef.current || isRecordingRef.current) return
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Voice recording is not supported.' }
      ])
      return
    }

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      }

      const stream = mediaStreamRef.current
      const recorder = new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        mediaRecorderRef.current = null
        const chunks = audioChunksRef.current
        audioChunksRef.current = []

        // --- NEW: Check how long the recording was ---
        const recordingDuration = Date.now() - recordingStartTimeRef.current
        if (recordingDuration < 500) {
          console.warn('Recording too short, ignoring.')
          stopMediaStream() // <-- FIX: Kill stream if aborted
          return
        }

        //  THE STEALTH FIX: Sever the hardware connection immediately
        // the millisecond the recording stops. This hides the Windows Mic Icon.
        stopMediaStream()

        if (!chunks.length) return

        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        await sendVoiceMessage(audioBlob)
      }

      recorder.start()
      isRecordingRef.current = true
      setIsRecording(true)
      recordingStartTimeRef.current = Date.now() // Record the exact start time
      // showMicToast('Recording started')
    } catch (error) {
      stopMediaStream()
      isRecordingRef.current = false
      setIsRecording(false)
      showMicToast('Microphone permission denied', 1800)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Microphone permission denied.' }
      ])
    }
  }

  const stopRecording = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (stopRecordingTimeoutRef.current) return

    isRecordingRef.current = false
    setIsRecording(false)

    // THE FIX: Wait 400ms before actually killing the recording
    // to catch the final syllable of your last word!
    stopRecordingTimeoutRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop()
      }
      stopRecordingTimeoutRef.current = null
    }, 400)
  }

  const toggleRecording = async (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === 'recording') {
      stopRecording()
      return
    }

    await startRecording()
  }

  const executeSlashCommand = async (commandId) => {
    setShowSlashMenu(false)

    // --- NEW: Handle standalone commands that don't need text prompts ---
    if (commandId === 'stack') {
      setShowSettings(true)
      setInput('')
      return
    }
    if (commandId === 'clear' || commandId === 'cl') {
      setMessages([])
      setInput('')
      return
    }
    if (commandId === 'exit') {
      await sendTextMessage('/exit') // This triggers the exit logic the agent built!
      return
    }

    if (commandId.startsWith('z-')) {
      let project = ''
      if (commandId === 'z-hustlebot') project = 'hustle bot'
      if (commandId === 'z-shadowos') project = 'shadow os'
      if (commandId === 'z-kirana') project = 'kirana store'
      if (commandId === 'z-rag') project = 'Advanced RAG Pipeline project'

      const displayCommand = `tell me about ${project}`
      const augmentedPrompt = `[Quick Command: CAREER]\nPlease answer the following interview question based on my local career database.\n\nQuestion:\n\ntell me about ${project}`

      await sendTextMessage(displayCommand, augmentedPrompt)
      return
    }
    // ----

    // if (commandId === 'system') {
    //   setInput('') // Clear the input box immediately
    //   await captureSystemAudio() // Fire your existing wiretap function!
    //   return
    // }
    // -------------------------------------------------------------------

    if (commandId === 'system') {
      await captureAndTranscribe()
      return
    }

    // Strip the "/command" part from the input to get the raw text
    const baseQuery = input.replace(/\/([a-zA-Z]*)$/, '').trim()
    if (!baseQuery) return

    let displayCommand = `/${commandId} ${baseQuery}`
    let augmentedPrompt = null

    if (commandId === 'explain') {
      augmentedPrompt = `[Quick Command: EXPLAIN]\nPlease explain the following concept deeply and technically. You MUST include Time & Space Complexity, architectural details, and under-the-hood mechanics (like event loop blocking, memory management, threads, etc) if applicable.\n\nTarget to explain: ${baseQuery}`
    } else if (commandId === 'fix') {
      augmentedPrompt = `[Quick Command: FIX]\nPlease analyze this broken code. You MUST provide:\n1. The exact bug and why it is breaking the old code.\n2. The corrected, production-ready code.\n3. A detailed explanation of the differences between the old and new code.\n\nCode to fix:\n\n${baseQuery}`
    } else if (commandId === 'create') {
      augmentedPrompt = `[Quick Command: CREATE]\nPlease write a complete, production-ready program or script for this request. Include necessary imports, setup instructions, robust error handling, and a brief explanation of the architectural strategy used.\n\nCreation Request:\n\n${baseQuery}`
    } else if (commandId === 'career') {
      // --- NEW: The Career RAG Prompt ---
      augmentedPrompt = `[Quick Command: CAREER]\nPlease answer the following interview question based on my local career database.\n\nQuestion:\n\n${baseQuery}`
    }

    await sendTextMessage(displayCommand, augmentedPrompt)
  }

  const handleKeyDown = async (e) => {
    // --- NEW: Keyboard navigation for the Slash Menu ---
    if (e.key === 'Escape') {
      if (showSlashMenu) {
        setPendingCommand(null)
        setInput('')
        setShowSlashMenu(false)
        return
      }
      if (showVisionMenu) {
        setShowVisionMenu(false)
        return
      }
      if (pendingCommand !== null) {
        cancelVisionCommand()
        return
      }
      // If no menus are open and the input is empty, close the whole app!
      if (!input.trim() && !pendingCommand) {
        closeOverlay()
        return
      }
    }

    // --- Keyboard navigation for the Slash Menu ---
    if (showSlashMenu) {
      const filtered = SLASH_COMMANDS.filter((c) => c.id.startsWith(slashFilter))

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[slashIndex]) {
          await executeSlashCommand(filtered[slashIndex].id)
        }
        return
      }
    }

    // Standard Enter key logic
    // Locate this section in handleKeyDown (around line 419)
    if (e.key === 'Enter' && !isThinking && !isRecording && !showSlashMenu) {
      // ADD THIS FIX: Check if the user is trying to clear the app even during a vision edit
      if (
        pendingCommand === '/clear' ||
        input.trim() === '/clear' ||
        pendingCommand === '/cl' ||
        input.trim() === '/cl'
      ) {
        setPendingCommand(null) // Kill the vision state
        setMessages([]) // Clear the messages
        setInput('') // Reset input
        return
      }

      if (pendingCommand !== null) {
        await confirmVisionCommand()
      } else if (input.trim()) {
        await sendTextMessage(input.trim())
      }
    }
  }

  const cancelVisionCommand = () => {
    setPendingCommand(null)
    setInput('')
    setInputText('')

    // Replace the "✏️ Edit command:" message with a cancelled notice
    setMessages((prev) => {
      const newMessages = [...prev]
      const lastIndex = newMessages.length - 1

      if (lastIndex >= 0 && newMessages[lastIndex].content.includes('✏️ Edit command:')) {
        newMessages[lastIndex] = {
          ...newMessages[lastIndex],
          content: '🚫 Vision command cancelled.'
        }
      }
      return newMessages
    })
  }

  const handleDragHandlePointerDown = (e) => {
    if (e.button !== 0) return
    if (!window.api?.moveWindowBy) return

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const startMouseX = e.screenX
    const startMouseY = e.screenY
    dragStateRef.current = {
      pointerId: e.pointerId,
      lastMouseX: startMouseX,
      lastMouseY: startMouseY
    }
  }

  const handleDragHandlePointerMove = (e) => {
    const drag = dragStateRef.current
    if (!drag || e.pointerId !== drag.pointerId) return

    const dx = e.screenX - drag.lastMouseX
    const dy = e.screenY - drag.lastMouseY
    drag.lastMouseX = e.screenX
    drag.lastMouseY = e.screenY
    if (dx !== 0 || dy !== 0) {
      window.api.moveWindowBy(dx, dy)
    }
  }

  const handleDragHandlePointerUp = (e) => {
    const drag = dragStateRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragStateRef.current = null
  }

  const captureSystemAudio = async () => {
    setIsThinking(true)
    setInput('Listening to system audio (10s)...')

    try {
      const res = await fetchBackend('/agent/listen-system', {
        method: 'POST'
      })
      const data = await res.json()

      if (data.status === 'success' && data.transcript) {
        // Drop what the other person said directly into your chat!
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: `🎧 [System Audio]: ${data.transcript}` }
        ])
        setInput('') // Clear the input box
      } else {
        setInput('Could not hear any system audio.')
      }
    } catch (error) {
      console.error(error)
      setInput('Error capturing system audio.')
    } finally {
      setIsThinking(false)
    }
  }

  const captureAndTranscribe = async () => {
    setIsListening(true)
    try {
      const result = await window.api.wiretapSystem()

      if (result?.status !== 'success') {
        console.error('wiretapSystem failed:', result)
        return
      }

      const res = await fetch('http://127.0.0.1:8000/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_path: result.filePath })
      })

      if (!res.ok) {
        throw new Error(`Transcription request failed with status ${res.status}`)
      }

      const data = await res.json()
      setInputText(data.text || '')
      setInput(data.text || '')
      console.log('Transcribed text:', data.text)
    } catch (error) {
      console.error('captureAndTranscribe error:', error)
    } finally {
      setIsListening(false)
    }
  }

  const handleSmartVision = async () => {
    window.api.hideOverlay()
    setVisionMode('smart')
    setIsThinking(true)

    const newMessages = [
      ...messagesRef.current,
      { role: 'user', content: '📸 [Vision: SMART] Analyzing snipped region...' }
    ]
    setMessages(newMessages)

    try {
      const res = await fetchBackend('/agent/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()

      if (data.status === 'needs_confirmation') {
        setPendingCommand(data.command)

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✏️ Edit command:\n\n${data.command}`
          }
        ])
      } else if (data.status === 'success') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network Error: Could not reach the AI backend.' }
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const handleVisionSelect = async (mode) => {
    setShowVisionMenu(false) // Hide the menu
    setVisionMode(mode)

    // Assign a strict prompt based on the chosen mode
    let systemPrompt = ''
    switch (mode) {
      case 'explain':
        systemPrompt =
          'Analyze the code on my screen and explain its architecture and purpose in detail.'
        break
      case 'fix':
        systemPrompt =
          'Analyze the code on my screen, find any syntax or logical bugs, and fix them.'
        break
      case 'help':
        systemPrompt =
          'I am stuck. Look at the code/app on my screen and guide me on what to do next.'
        break
      case 'create':
        systemPrompt =
          'Read the code and comments visible on my screen. Based on that explicit text context, write the implementation for the requested feature.'
        break
      default:
        return
    }

    // If you typed something in the box, append it as extra instructions!
    const finalCommand = input.trim()
      ? `${systemPrompt} Additional user instructions: ${input}`
      : systemPrompt

    setInput('')
    setIsThinking(true)

    // Update UI immediately
    const newMessages = [
      ...messages,
      { role: 'user', content: `📸 [Vision: ${mode.toUpperCase()}] ${finalCommand}` }
    ]
    setMessages(newMessages)

    try {
      const res = await fetchBackend('/agent/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()

      if (data.status === 'needs_confirmation') {
        setPendingCommand(data.command)

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✏️ Edit command:\n\n${data.command}`
          }
        ])
      } else if (data.status === 'success') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }])
      }
    } catch (error) {
      // This will now ONLY trigger if the Python server is actually offline
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network Error: Could not reach the AI backend.' }
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const confirmVisionCommand = async () => {
    if (!pendingCommand) return

    setIsThinking(true)

    // show user message
    setMessages((prev) => [...prev, { role: 'user', content: `✅ ${pendingCommand}` }])

    try {
      const res = await fetchBackend('/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: pendingCommand,
          mode: visionMode
        })
      })

      setIsThinking(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let assistantReply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const textChunk = decoder.decode(value, { stream: true })
        assistantReply += textChunk

        // --- THE FIX: Create a brand new message object ---
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastIndex = newMessages.length - 1

          if (lastIndex >= 0) {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: assistantReply
            }
          }
          return newMessages
        })

        // Give Chromium a paint opportunity between streamed chunks in production builds.
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error during execution' }
      ])
      setIsThinking(false)
    }

    setPendingCommand(null)
  }

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-start pt-20 bg-transparent">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[600px] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Configure Core Tech Stack</h2>
            <p className="text-xs text-gray-400 mb-4">
              This tells the AI what languages and tools to prioritize in its answers.
            </p>
            <textarea
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              className="w-full h-48 bg-gray-800 text-gray-200 border border-gray-600 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 font-mono"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* The Widget Wrapper: catches mouse and triggers NATIVE drag */}
      <div className="flex flex-col items-center pointer-events-auto">
        {/* Dedicated draggable strip so there's always a real drag target */}
        <div
          className="w-[700px] h-8 mb-2 flex items-center justify-center cursor-default"
          aria-hidden="true"
          onPointerDown={handleDragHandlePointerDown}
          onPointerMove={handleDragHandlePointerMove}
          onPointerUp={handleDragHandlePointerUp}
          onPointerCancel={handleDragHandlePointerUp}
        >
          <div className="h-1.5 w-16 rounded-full bg-gray-400/40" />
        </div>

        <div
          ref={transcriptRef}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-[700px] max-h-[480px] overflow-y-auto px-1 pb-2 scrollbar-thin scrollbar-thumb-gray-600"
        >
          {messages.map((message, idx) => {
            const rawMermaid = extractRawMermaidBlock(message.content)
            if (message.role === 'user') {
              return (
                <div key={`message-${idx}`} className="w-full flex justify-end mb-3 cursor-default">
                  <div className="max-w-[78%] bg-blue-500 text-white px-4 py-3 rounded-[24px] rounded-br-md text-base leading-relaxed shadow-lg">
                    {message.content}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={`message-${idx}`}
                // className="w-full mb-4 p-5 bg-gray-900/95 text-gray-100 rounded-2xl shadow-2xl backdrop-blur-xl border border-gray-700 cursor-text"
                className="w-full mb-4 p-5 bg-gray-900/60 text-gray-100 rounded-2xl shadow-2xl backdrop-blur-xl border border-gray-700 cursor-default"
              >
                {rawMermaid ? (
                  <div
                    className="mermaid flex justify-center bg-gray-800/50 p-4 rounded-xl my-4 border border-gray-700 shadow-inner"
                    data-mermaid-definition={rawMermaid}
                  >
                    {rawMermaid}
                  </div>
                ) : (
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')

                        // --- NEW: Intercept Mermaid Blocks ---
                        if (!inline && match && match[1] === 'mermaid') {
                          const mermaidCode = String(children).replace(/\n$/, '')
                          return (
                            <div
                              className="mermaid flex justify-center bg-gray-800/50 p-4 rounded-xl my-4 border border-gray-700 shadow-inner"
                              data-mermaid-definition={mermaidCode}
                            >
                              {mermaidCode}
                            </div>
                          )
                        }
                        // -----------------------------------

                        return !inline && match ? (
                          <div className="rounded-xl overflow-hidden my-4 border border-gray-700 shadow-lg w-full">
                            <div className="bg-gray-800 px-4 py-1 text-xs text-gray-400 uppercase font-mono border-b border-gray-700 flex justify-between">
                              <span>{match[1]}</span>
                            </div>
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ margin: 0, padding: '1rem', background: '#1e1e1e' }}
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code
                            className="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded-md font-mono text-sm"
                            {...props}
                          >
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {normalizeMermaidMarkdown(message.content)}
                  </ReactMarkdown>
                )}
              </div>
            )
          })}

          {isThinking && (
            <div className="w-full mb-4 p-5 bg-gray-900/95 text-gray-400 rounded-2xl border border-blue-500/30 animate-pulse">
              Thinking...
            </div>
          )}
        </div>
        {(isLiveTranscribing ||
          messages.some((msg) => msg.content?.includes('[Live System Audio]'))) && (
          <div className="w-[700px] mt-2 flex flex-wrap justify-end gap-2 animate-fade-in-up">
            <button
              onClick={() => handleContextualAction('full_analysis')}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md border border-gray-600 transition-colors"
            >
              📝 Analysis
            </button>
            <button
              onClick={() => handleContextualAction('quick_answer')}
              className="px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800 text-blue-200 text-xs font-semibold rounded-md border border-blue-700 transition-colors"
            >
              ⚡ Quick Answer
            </button>
            <button
              onClick={() => handleContextualAction('concept')}
              className="px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800 text-amber-200 text-xs font-semibold rounded-md border border-amber-700 transition-colors"
            >
              🧠 Concept Deep Dive
            </button>
            <button
              onClick={() => handleContextualAction('coding')}
              className="px-3 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 text-xs font-semibold rounded-md border border-indigo-700 transition-colors"
            >
              💻 Code Deep Dive
            </button>
            <button
              onClick={() => handleContextualAction('design')}
              className="px-3 py-1.5 bg-purple-900/50 hover:bg-purple-800 text-purple-200 text-xs font-semibold rounded-md border border-purple-700 transition-colors"
            >
              🏗️ System Design
            </button>
            <button
              onClick={() => handleContextualAction('strategy')}
              className="px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold rounded-md border border-emerald-700 transition-colors"
            >
              📊 Strategy & Metrics
            </button>

            <button
              onClick={() => handleContextualAction('behavioral')}
              className="px-3 py-1.5 bg-orange-900/50 hover:bg-orange-800 text-orange-200 text-xs font-semibold rounded-md border border-orange-700 transition-colors"
            >
              ❓ Behavioral
            </button>
            {/* <button
              onClick={() => handleContextualAction('career')}
              className="px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold rounded-md border border-emerald-700 transition-colors"
            >
              💼 Career / Project
            </button> */}
          </div>
        )}
        {pendingCommand !== null && (
          <div className="w-[700px] mt-2 flex justify-end gap-3 animate-fade-in-up">
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                cancelVisionCommand()
              }}
              className="px-4 py-1.5 text-xs font-bold text-red-200 bg-red-900/40 border border-red-400/40 rounded-lg hover:bg-red-600 transition-colors cursor-default backdrop-blur-md shadow-lg"
            >
              ❌ Cancel Vision Command (ESC)
            </button>
          </div>
        )}
        <div className="w-[700px] mt-2 flex items-center gap-2">
          {/* ?<label className="text-xs text-gray-400 font-semibold">🧠 Model:</label> */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-gray-800 text-gray-200 text-xs rounded border border-gray-600 px-2 py-1 outline-none focus:border-blue-500"
          >
            <optgroup label="⚡Local Models (Ollama)">
              <option value="qwen2.5-coder:3b">Qwen 2.5 Coder (3B)</option>
            </optgroup>
            <optgroup label="🌩️Lightning AI (Cloud)">
              <option value="lightning:lightning-ai/gpt-oss-20b">GPT OSS (20B)</option>
              <option value="lightning:lightning-ai/gpt-oss-120b">GPT OSS (120B)</option>
              <option value="lightning:lightning-ai/llama-3.3-70b">Llama 3.3 (70B)</option>
              <option value="lightning:lightning-ai/DeepSeek-V3.1">DeepSeek V3.1</option>
              {/* <option value="lightning:google/gemini-3-pro-preview">Gemini 3 Pro-preview</option> */}
            </optgroup>
            <optgroup label="☁️Ollama Cloud APIs">
              <option value="gemini-3-flash-preview:latest">Gemini 3 Flash (Cloud)</option>
              <option value="gpt-oss:20b-cloud">gpt-oss:20b (Cloud)</option>
              <option value="glm-5:cloud">GLM-5 (Cloud)</option>
            </optgroup>
          </select>
        </div>
        {/* Input Container */}
        <div className="relative w-[700px] mt-2">
          {/* --- NEW: Backend Booting Banner --- */}
          {!isBackendReady && (
            <div className="absolute -top-12 left-0 w-full flex justify-center z-50 animate-pulse">
              <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 px-4 py-2 rounded-lg text-sm shadow-lg backdrop-blur-md flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-yellow-200"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Starting local AI Engine...
              </div>
            </div>
          )}
          {/* ----------------------------------- */}
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isThinking}
            className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 rounded-xl p-2 border shadow-lg transition-colors ${
              isRecording
                ? 'bg-red-500/25 text-red-200 border-red-300/70'
                : 'bg-blue-500/15 text-blue-200 border-blue-300/60 hover:bg-blue-500/25'
            } ${isThinking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            // title="Hold to talk"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
          {/* --- NEW: The Slash Command Dropdown --- */}
          {showSlashMenu && (
            <div className="absolute bottom-full left-4 mb-3 max-h-[350px] overflow-y-auto w-72 bg-gray-800/60 backdrop-blur-xl border border-gray-600 rounded-xl shadow-2xl flex flex-col font-sans animate-fade-in-up z-50 scrollbar-thin scrollbar-thumb-gray-500">
              {SLASH_COMMANDS.filter((c) => c.id.startsWith(slashFilter)).map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    executeSlashCommand(cmd.id)
                  }}
                  onMouseEnter={() => setSlashIndex(idx)}
                  className={`px-4 py-3 text-left transition-colors border-b border-gray-700/50 flex flex-col cursor-pointer ${
                    slashIndex === idx
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  <span className="font-bold text-sm flex items-center gap-2">
                    <span>{cmd.icon}</span> /{cmd.id}
                  </span>
                  <span
                    className={`text-xs mt-1 ${slashIndex === idx ? 'text-blue-200' : 'text-gray-400'}`}
                  >
                    {cmd.desc}
                  </span>
                </button>
              ))}
              {SLASH_COMMANDS.filter((c) => c.id.startsWith(slashFilter)).length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 italic">No commands found...</div>
              )}
            </div>
          )}
          {/* -------------------------------------- */}
          <input
            ref={inputRef}
            type="text"
            value={pendingCommand !== null ? pendingCommand : inputText}
            onChange={(e) => {
              const val = e.target.value
              if (pendingCommand !== null) {
                setPendingCommand(val)
              } else {
                setInputText(val)
                setInput(val)

                const match = val.match(/\/([a-zA-Z]*)$/)
                if (match) {
                  setShowSlashMenu(true)
                  setSlashFilter(match[1].toLowerCase())
                  setSlashIndex(0)
                } else {
                  setShowSlashMenu(false)
                }
              }
            }}
            onKeyDown={handleKeyDown}
            // --- NEW: Disable input if backend is not ready ---
            disabled={!isBackendReady || isThinking || isRecording || isListening}
            onPointerDown={(e) => e.stopPropagation()}
            // --- NEW: Update placeholder to show connecting status ---
            placeholder={
              !isBackendReady
                ? 'Connecting to AI Engine...'
                : isLiveTranscribing
                  ? '🔴 Live System Capturing... type /exit to save and quit'
                  : isListening
                    ? 'Listening to system audio...'
                    : isRecording
                      ? 'Recording... release to send'
                      : isThinking
                        ? 'Thinking...'
                        : 'Ask your assistant...'
            }
            // --- NEW: Update styling so it looks disabled while booting ---
            className={`w-full p-4 pl-14 pr-20 text-xl rounded-2xl shadow-2xl backdrop-blur-md outline-none border transition-all font-sans cursor-text
              ${
                !isBackendReady || isThinking || isRecording || isListening || isLiveTranscribing
                  ? 'bg-gray-800/80 text-gray-400 border-blue-500/50 cursor-not-allowed opacity-80'
                  : 'bg-gray-900/60 text-gray-100 border-gray-700 focus:border-blue-500 placeholder-gray-500'
              }`}
          />
          {/* Close Button */}
          <button
            onClick={closeOverlay}
            // STOP the drag if you click the close button
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-gray-500 hover:text-white transition-colors p-2 cursor-pointer"
          >
            X
          </button>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleLiveTranscription()
            }}
            disabled={isThinking || isRecording || !isBackendReady || isSaving}
            className={`absolute right-12 top-1/2 -translate-y-1/2 z-20 p-2 transition-all duration-300 ${
              isLiveTranscribing
                ? 'text-red-400 animate-pulse drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]'
                : 'text-gray-500 hover:text-cyan-400'
            } ${isThinking || isRecording || isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            // title={isLiveTranscribing ? 'Stop Ambient Listening' : 'Start Ambient Listening'}
          >
            {isLiveTranscribing ? '🛑' : '🎧'}
          </button>
          <div className="absolute right-20 top-1/2 -translate-y-1/2">
            {showVisionMenu && (
              <div className="absolute bottom-full right-0 mb-4 w-32 bg-gray-800/60 backdrop-blur-xl border border-gray-600 rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans animate-fade-in-up">
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handleVisionSelect('explain')
                  }}
                  className="px-4 py-3 text-sm text-gray-200 hover:bg-blue-600 hover:text-white text-left transition-colors border-b border-gray-700"
                >
                  📖 Explain
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handleVisionSelect('fix')
                  }}
                  className="px-4 py-3 text-sm text-gray-200 hover:bg-green-600 hover:text-white text-left transition-colors border-b border-gray-700"
                >
                  🛠️ Fix
                </button>
                {/* <button
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handleVisionSelect('help')
                  }}
                  className="px-4 py-3 text-sm text-gray-200 hover:bg-yellow-600 hover:text-white text-left transition-colors border-b border-gray-700"
                >
                  ðŸ†˜ Help
                </button> */}
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handleVisionSelect('create')
                  }}
                  className="px-4 py-3 text-sm text-gray-200 hover:bg-purple-600 hover:text-white text-left transition-colors"
                >
                  ✨ Create
                </button>
              </div>
            )}

            {/* <button
              onClick={() => setShowVisionMenu(!showVisionMenu)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`text-gray-500 hover:text-green-400 transition-colors p-2 cursor-pointer font-bold ${showVisionMenu ? 'text-green-400' : ''}`}
            >
              👁️
            </button> */}
          </div>
        </div>
        {isListening && (
          <div className="w-[700px] mt-2 text-center text-xs text-cyan-200 bg-cyan-900/40 border border-cyan-400/40 rounded-lg px-3 py-2 backdrop-blur-sm animate-pulse">
            🎧 Listening to system audio...
          </div>
        )}

        {/* <div className="w-[700px] mt-3 text-right text-xs text-gray-500">
          {isRecording ? 'Release mic to send' : 'Press ESC to dismiss'}
        </div> */}
        {micToast && (
          <div className="w-[700px] mt-2 text-center text-xs text-blue-200 bg-blue-900/40 border border-blue-400/40 rounded-lg px-3 py-2 backdrop-blur-sm">
            {micToast}
          </div>
        )}
      </div>
    </div>
  )
}

export default App

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism' // VS Code Dark Theme
import mermaid from 'mermaid'

const SLASH_COMMANDS = [
  { id: 'explain', icon: '📖', label: 'Explain', desc: 'Deep technical explanation' },
  { id: 'fix', icon: '🛠️', label: 'Fix', desc: 'Fix and explain broken code' },
  { id: 'create', icon: '✨', label: 'Create', desc: 'Write a production-ready program' },
  { id: 'clear', icon: '🗑️', label: 'Clear', desc: 'Clear the chat history' },
  { id: 'career', icon: '💼', label: 'Career', desc: 'Ask about my projects & experience' },
  // { id: 'system', icon: '🎧', label: 'Wiretap', desc: 'Listen to system audio (10s)' },
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

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    isLiveTranscribingRef.current = isLiveTranscribing
  }, [isLiveTranscribing])

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
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose'
    })
    mermaid.contentLoaded()
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
    // --- THE FIX: Reverse the array to find the LATEST live audio message ---
    const liveMsg = [...messages].reverse().find((m) => m.content?.includes('[Live System Audio]'))

    if (!liveMsg) {
      showMicToast('No live audio context found.')
      return
    }

    // 2. Extract the raw text
    const rawText = liveMsg.content.replace('🎧 **[Live System Audio]:**', '').trim()
    if (!rawText) {
      showMicToast('Transcript is empty.')
      return
    }

    // 3. Define the prompts based on the action
    let displayCommand = ''
    let augmentedPrompt = ''

    switch (actionType) {
      case 'answer':
        displayCommand = 'What should I answer?'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nBased on the following live conversation, suggest a strong, concise response I can say right now. \n\nCRITICAL: If the conversation is about programming, coding interviews, or software architecture, you MUST include a brief, practical code snippet demonstrating the concept.\n\nLive Conversation:\n"${rawText}"`
        break
      // --- ADD THIS NEW CASE ---
      case 'detailed':
        displayCommand = 'Detailed Answer'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nAnalyze the following live conversation and identify the core technical question or concept being discussed. Provide a HIGHLY DETAILED, comprehensive answer to that implicit question. \n\nCRITICAL: For programming topics, you MUST explain the under-the-hood mechanics (e.g., Event Loop, Web APIs, memory, time/space complexity) and provide robust code examples.\n\nLive Conversation:\n"${rawText}"`
        break
      // -------------------------
      case 'shorten':
        displayCommand = 'Shorten response'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nPlease summarize and shorten the following live conversation into a quick, digestible format. If it's a technical topic, include a 1-2 line code example.\n\nLive Conversation:\n"${rawText}"`
        break
      case 'recap':
        displayCommand = 'Recap conversation'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nProvide a clear, bulleted recap of the key points discussed in this live conversation so far. If technical concepts were discussed, pair them with short code blocks.\n\nLive Conversation:\n"${rawText}"`
        break
      case 'followup':
        displayCommand = 'Suggest follow-up questions'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nSuggest 3 insightful, senior-level follow-up questions I can ask based on the context of this live conversation. Make them highly technical if the context is coding.\n\nLive Conversation:\n"${rawText}"`
        break
      case 'stepbystep':
        displayCommand = 'Step-by-Step Explanation'
        augmentedPrompt = `[Quick Command: CONTEXT_ACTION]\nFirst, briefly summarize the following live conversation and identify the core technical question being discussed. Then, provide a clear, step-by-step explanation to solve or understand it. You MUST include code examples if the topic is related to programming.\n\nLive Conversation:\n"${rawText}"`
        break
      default:
        return
    }

    // 4. Send the command to the AI
    await sendTextMessage(displayCommand, augmentedPrompt)
  }

  const closeOverlay = () => {
    setInput('')
    window.api.hideOverlay()
  }

  const sendTextMessage = async (displayCommand, augmentedPrompt = null) => {
    const payloadText = augmentedPrompt || displayCommand
    const userMessage = { role: 'user', content: displayCommand }
    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInput('')
    setIsThinking(true) // Briefly show "Thinking..." while making the network request

    try {
      const backendMessages = [...messages, { role: 'user', content: payloadText }]

      const res = await fetch('http://127.0.0.1:8000/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payloadText, messages: backendMessages })
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
      }
    } catch (error) {
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
          showMicToast('Recording too short')
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

  const executeSlashCommand = async (commandId) => {
    setShowSlashMenu(false)

    // --- NEW: Handle standalone commands that don't need text prompts ---
    if (commandId === 'clear' || commandId === 'cl') {
      setMessages([])
      setInput('')
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
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')

                      // --- NEW: Intercept Mermaid Blocks ---
                      if (!inline && match && match[1] === 'mermaid') {
                        return (
                          <div className="mermaid flex justify-center bg-gray-800/50 p-4 rounded-xl my-4 border border-gray-700 shadow-inner">
                            {String(children).replace(/\n$/, '')}
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
                  {message.content}
                </ReactMarkdown>
              </div>
            )
          })}

          {isThinking && (
            <div className="w-full mb-4 p-5 bg-gray-900/95 text-gray-400 rounded-2xl border border-blue-500/30 animate-pulse">
              Thinking...
            </div>
          )}
        </div>
        {/* --- ADD THIS NEW BLOCK FOR THE LIVE TRANSCRIPTION BUTTONS --- */}
        {/* {(isLiveTranscribing ||
          messages.some((msg) => msg.content?.includes('[Live System Audio]'))) && (
          <div className="w-[700px] mt-2 flex justify-end gap-3 animate-fade-in-up">
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                appendLastSentences(1)
              }}
              className="px-4 py-1.5 text-xs font-bold text-blue-200 bg-blue-900/40 border border-blue-400/40 rounded-lg hover:bg-blue-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              + Add Last Sentence
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                appendLastSentences(2)
              }}
              className="px-4 py-1.5 text-xs font-bold text-purple-200 bg-purple-900/40 border border-purple-400/40 rounded-lg hover:bg-purple-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              + Add Last 2 Sentences
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                appendLastSentences(3)
              }}
              className="px-4 py-1.5 text-xs font-bold text-purple-200 bg-purple-900/40 border border-purple-400/40 rounded-lg hover:bg-purple-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              + Add Last 3 Sentences
            </button>
          </div>
        )} */}
        {/* --- ADD THIS NEW BLOCK FOR THE LIVE TRANSCRIPTION BUTTONS --- */}
        {/* --- ADD THIS NEW BLOCK FOR THE LIVE TRANSCRIPTION BUTTONS --- */}
        {(isLiveTranscribing ||
          messages.some((msg) => msg.content?.includes('[Live System Audio]'))) && (
          <div className="w-[700px] mt-2 flex flex-wrap justify-end gap-2 animate-fade-in-up">
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('answer')
              }}
              className="px-3 py-1.5 text-xs font-bold text-green-200 bg-green-900/40 border border-green-400/40 rounded-lg hover:bg-green-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              💡 Quick Answer
            </button>
            {/* --- NEW DETAILED ANSWER BUTTON --- */}
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('detailed')
              }}
              className="px-3 py-1.5 text-xs font-bold text-cyan-200 bg-cyan-900/40 border border-cyan-400/40 rounded-lg hover:bg-cyan-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              🧠 Detailed Answer
            </button>
            {/* ---------------------------------- */}
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('shorten')
              }}
              className="px-3 py-1.5 text-xs font-bold text-blue-200 bg-blue-900/40 border border-blue-400/40 rounded-lg hover:bg-blue-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              ✂️ Shorten
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('recap')
              }}
              className="px-3 py-1.5 text-xs font-bold text-purple-200 bg-purple-900/40 border border-purple-400/40 rounded-lg hover:bg-purple-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              📝 Recap
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('followup')
              }}
              className="px-3 py-1.5 text-xs font-bold text-orange-200 bg-orange-900/40 border border-orange-400/40 rounded-lg hover:bg-orange-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              ❓ Follow-up
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextualAction('stepbystep')
              }}
              className="px-3 py-1.5 text-xs font-bold text-amber-200 bg-amber-900/40 border border-amber-400/40 rounded-lg hover:bg-amber-600 transition-colors cursor-pointer backdrop-blur-md shadow-lg"
            >
              🪜 Step-by-Step
            </button>
            <button
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                endMeeting()
              }}
              disabled={isSaving}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors backdrop-blur-md shadow-lg border ${
                isSaving
                  ? 'text-gray-300 bg-gray-700/70 border-gray-500/60 cursor-not-allowed'
                  : 'text-red-100 bg-red-900/50 border-red-400/50 hover:bg-red-600 cursor-pointer'
              }`}
            >
              {isSaving ? 'Saving transcript...' : 'Stop & Save Meeting'}
            </button>
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
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerCancel={stopRecording}
            onPointerLeave={stopRecording}
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
                  ? '🔴 Live System Capturing... use Stop & Save Meeting'
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

            <button
              onClick={() => setShowVisionMenu(!showVisionMenu)}
              onPointerDown={(e) => e.stopPropagation()}
              className={`text-gray-500 hover:text-green-400 transition-colors p-2 cursor-pointer font-bold ${showVisionMenu ? 'text-green-400' : ''}`}
              // title="Vision Menu"
            >
              👁️
            </button>
          </div>
        </div>
        {isListening && (
          <div className="w-[700px] mt-2 text-center text-xs text-cyan-200 bg-cyan-900/40 border border-cyan-400/40 rounded-lg px-3 py-2 backdrop-blur-sm animate-pulse">
            🎧 Listening to system audio...
          </div>
        )}

        <div className="w-[700px] mt-3 text-right text-xs text-gray-500">
          {isRecording ? 'Release mic to send' : 'Press ESC to dismiss'}
        </div>
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

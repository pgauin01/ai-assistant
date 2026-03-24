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
  { id: 'system', icon: '🎧', label: 'Wiretap', desc: 'Listen to system audio (10s)' },
  // --- NEW: Z-Macro Commands for fast testing ---
  { id: 'z-hustlebot', icon: '🤖', label: 'HustleBot', desc: 'tell me about hustle bot' },
  { id: 'z-shadowos', icon: '🧠', label: 'Shadow OS', desc: 'tell me about shadow os' },
  { id: 'z-kirana', icon: '🛒', label: 'Kirana', desc: 'tell me about kirana store' },
  { id: 'z-rag', icon: '🎓', label: 'RAG Chatbot', desc: 'tell me about my RAG project' }
]

const BACKEND_BASE_URL = 'http://127.0.0.1:8000'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  const [messages, setMessages] = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
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

        // Decode the incoming byte chunk and append it
        const textChunk = decoder.decode(value, { stream: true })
        assistantReply += textChunk

        // Dynamically update the LAST message in the array
        setMessages((prev) => {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1].content = assistantReply
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

        // ðŸ›‘ THE STEALTH FIX: Sever the hardware connection immediately
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
      // showMicToast('Recording stopped')
      stopRecordingTimeoutRef.current = null
    }, 400)
  }

  const executeSlashCommand = async (commandId) => {
    setShowSlashMenu(false)

    // --- NEW: Handle standalone commands that don't need text prompts ---
    if (commandId === 'clear') {
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
      console.log('Starting Wiretap...')

      // 1. Trigger Rust (UI will wait here for 10 seconds)
      const result = await window.api.wiretapSystem()

      if (result.status === 'success') {
        // 2. Send the resulting WAV file to your Python Whisper backend!
        console.log('WAV File ready at:', result.filePath)

        // Example:
        // const transcript = await sendToPythonWhisper(result.filePath);
        // addMessageToChat(transcript);
      }
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
      if (e.key === 'Escape') {
        setPendingCommand(null)
        setInput('')
        setShowSlashMenu(false)
        return
      }
    }

    // Standard Enter key logic
    // Locate this section in handleKeyDown (around line 419)
    if (e.key === 'Enter' && !isThinking && !isRecording && !showSlashMenu) {
      // ADD THIS FIX: Check if the user is trying to clear the app even during a vision edit
      if (pendingCommand === '/clear' || input.trim() === '/clear') {
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

        setMessages((prev) => {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1].content = assistantReply
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
                <div key={`message-${idx}`} className="w-full flex justify-end mb-3">
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
                className="w-full mb-4 p-5 bg-gray-900/60 text-gray-100 rounded-2xl shadow-2xl backdrop-blur-xl border border-gray-700 cursor-text"
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

        {/* Input Container */}
        <div className="relative w-[700px] mt-2">
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
            title="Hold to talk"
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
            <div className="absolute top-full left-4 mt-3 w-72 bg-gray-800/60 backdrop-blur-xl border border-gray-600 rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans animate-fade-in-up z-50">
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
            value={pendingCommand !== null ? pendingCommand : input}
            onChange={(e) => {
              const val = e.target.value
              if (pendingCommand !== null) {
                setPendingCommand(val)
              } else {
                setInput(val)

                // --- NEW: Slash Menu Listener ---
                // Checks if the user is currently typing a slash command at the end
                const match = val.match(/\/([a-zA-Z]*)$/)
                if (match) {
                  setShowSlashMenu(true)
                  setSlashFilter(match[1].toLowerCase())
                  setSlashIndex(0) // Reset selection to top
                } else {
                  setShowSlashMenu(false)
                }
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isThinking || isRecording}
            // STOP the drag if you click inside the input box
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={
              isRecording
                ? 'Recording... release to send'
                : isThinking
                  ? 'Thinking...'
                  : 'Ask your assistant...'
            }
            className={`w-full p-4 pl-14 pr-20 text-xl rounded-2xl shadow-2xl backdrop-blur-md outline-none border transition-all font-sans cursor-text
              ${
                isThinking || isRecording
                  ? 'bg-gray-800/80 text-gray-400 border-blue-500/50 animate-pulse'
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
          {/* <button
            onClick={captureSystemAudio}
            disabled={isThinking || isRecording}
            onPointerDown={(e) => e.stopPropagation()}
            className={`absolute right-12 top-1/2 -translate-y-1/2 z-20 p-2 text-gray-500 hover:text-purple-400 transition-colors ${
              isThinking || isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            title="Wiretap System Audio (10s)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-6 h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
            </svg>
          </button> */}
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
              title="Vision Menu"
            >
              👁️
            </button>
          </div>
        </div>

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

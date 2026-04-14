from typing import Literal,Optional
import os
import tempfile
import warnings
from io import BytesIO

from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from PIL import ImageGrab, Image
import numpy as np
import soundcard as sc
import soundfile as sf
import requests
import re
import json
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback
import os
from prompts import (
    FAST_CODING_PROMPT,
    CAREER_AGENT_PROMPT,
    VISION_EXPLAIN_PROMPT,
    VISION_FIX_PROMPT,
    VISION_CREATE_PROMPT,
    VISION_MCQ_PROMPT,
    VISION_CLASSIFY_PROMPT
)



import tkinter as tk
from PIL import ImageGrab
import moondream as md
import sys
import threading
from fastapi.responses import JSONResponse, StreamingResponse
from contextlib import asynccontextmanager
from typing import List
from datetime import datetime
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"  
# Determine the absolute path to the directory containing main.py / .env
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running in production: find the .env file in the PyInstaller temp folder
    base_path = sys._MEIPASS
else:
    # Running in development: find the .env file in the normal directory next to main.py
    base_path = os.path.dirname(os.path.abspath(__file__))

env_path = os.path.join(base_path, '.env')

# Force load_dotenv to use the exact path
load_dotenv(dotenv_path=env_path)
BASE_KEY = os.getenv("BASE_KEY")
BILLING_WORKSPACE = os.getenv("BILLING_WORKSPACE")

# This is the magic fix: combine them for the Bearer token
lit_api_key = f"{BASE_KEY}/{BILLING_WORKSPACE}"



def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue

            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

# Update your BASE_DIR to use the new function!
BASE_DIR = resource_path("") 
PROJECT_ROOT = os.path.dirname(BASE_DIR)
load_env_file(os.path.join(BASE_DIR, ".env"))
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# PROJECT_ROOT = os.path.dirname(BASE_DIR)
# load_env_file(os.path.join(BASE_DIR, ".env"))


def resolve_career_data_dir() -> str:
    candidates = [
        os.path.join(BASE_DIR, "career_data"),
        os.path.join(PROJECT_ROOT, "career_data"),
    ]
    for path in candidates:
        if os.path.isdir(path):
            return path
    # Keep a deterministic fallback path even if the directory is missing.
    return candidates[0]


CAREER_DATA_DIR = resolve_career_data_dir()


def read_career_markdown(filename: str) -> str:
    path = os.path.join(CAREER_DATA_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

# --- NEW: LOAD THE CAREER BRAIN ---
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings

try:
    local_embeddings = OllamaEmbeddings(model="nomic-embed-text")
    career_db = FAISS.load_local(
        os.path.join(BASE_DIR, "career_vector_db"), 
        local_embeddings, 
        allow_dangerous_deserialization=True 
    )
    career_retriever = career_db.as_retriever(search_kwargs={"k": 5}) 
    # --- CHANGED: Removed the checkmark emoji ---
    print("[SUCCESS] Local Career Brain Loaded.")
except Exception as e:
    # --- CHANGED: Removed the warning emoji ---
    print(f"[WARNING] Career Brain not found. Run build_brain.py first. Error: {e}")
    career_retriever = None
# -----------------------------------

OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "qwen2.5-coder:3b"

# OLLAMA_MODEL = "gemini-3-flash-preview:latest"


# testing purposes only - this class creates a full-screen transparent overlay that lets you draw a box to capture a screenshot region. You can then run OCR on that region to extract text from images of code, error messages, etc.
import ctypes
import tkinter as tk

class RagQuery(BaseModel):
    transcript: str


class SnippingTool:
    def __init__(self):
        self.root = tk.Tk()
        
        # Hide from taskbar
        self.root.overrideredirect(True)
        
        # 1. NO DIMMING: Pure stealth background (0.01 alpha)
        self.root.attributes('-alpha', 0.01) 
        self.root.attributes('-topmost', True) 
        self.root.config(cursor="arrow")
        
        # Stretch across the whole screen
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        self.root.geometry(f"{screen_width}x{screen_height}+0+0")
        
        # Force the window to render to get the HWND
        self.root.update_idletasks()
        
        # 🛑 HIDE FROM SCREEN SHARE 🛑
        try:
            hwnd = int(self.root.wm_frame(), 16)
            ctypes.windll.user32.SetWindowDisplayAffinity(hwnd, 0x00000011)
        except Exception as e:
            print(f"[Stealth] Failed to hide from screen share: {e}")

        # 2. NO RED BORDER: highlightthickness set back to 0
        self.canvas = tk.Canvas(
            self.root, 
            cursor="arrow", 
            bg="black", 
            highlightthickness=0         
        )
        self.canvas.pack(fill="both", expand=True)
        
        # Bind the mouse events
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        
        self.start_x = None
        self.start_y = None
        self.rect = None
        self.bbox = None

    def on_press(self, event):
        self.start_x = self.canvas.canvasx(event.x)
        self.start_y = self.canvas.canvasy(event.y)
        
        # 3. THIN GREEN BAR: outline='#00ff00', width=1
        self.rect = self.canvas.create_rectangle(
            self.start_x, self.start_y, 1, 1, outline="#3cff00", width=5, fill=""
        )

    def on_drag(self, event):
        curX, curY = (event.x, event.y)
        # Update the box coordinates as you drag
        self.canvas.coords(self.rect, self.start_x, self.start_y, curX, curY)

    def on_release(self, event):
        # Save the coordinates
        self.bbox = (
            min(self.start_x, event.x), 
            min(self.start_y, event.y), 
            max(self.start_x, event.x), 
            max(self.start_y, event.y)
        )
        # Destroy the overlay immediately
        self.root.destroy()


# class SnippingTool:
#     def __init__(self):
#         self.root = tk.Tk()
        
#         # 1. Hide from taskbar
#         self.root.overrideredirect(True)
        
#         # 2. Make it completely stealth
#         self.root.attributes('-alpha', 0.01)
#         self.root.attributes('-topmost', True) 
#         self.root.config(cursor="arrow")
        
#         # 3. THE FIX: Manually stretch it across the entire screen instead of using -fullscreen
#         screen_width = self.root.winfo_screenwidth()
#         screen_height = self.root.winfo_screenheight()
#         self.root.geometry(f"{screen_width}x{screen_height}+0+0")
        
#         # 4. Standard canvas setup
#         self.canvas = tk.Canvas(self.root, cursor="arrow", bg="black", highlightthickness=0)
#         self.canvas.pack(fill="both", expand=True)
        
#         self.canvas.bind("<ButtonPress-1>", self.on_press)
#         self.canvas.bind("<B1-Motion>", self.on_drag)
#         self.canvas.bind("<ButtonRelease-1>", self.on_release)
        
#         self.start_x = None
#         self.start_y = None
#         self.rect = None
#         self.bbox = None

#     def on_press(self, event):
#         self.start_x = self.canvas.canvasx(event.x)
#         self.start_y = self.canvas.canvasy(event.y)
        
#         self.rect = self.canvas.create_rectangle(
#             self.start_x, self.start_y, 1, 1, outline='', width=0, fill=""
#         )

#     def on_drag(self, event):
#         curX, curY = (event.x, event.y)
#         self.canvas.coords(self.rect, self.start_x, self.start_y, curX, curY)

#     def on_release(self, event):
#         self.bbox = (
#             min(self.start_x, event.x), 
#             min(self.start_y, event.y), 
#             max(self.start_x, event.x), 
#             max(self.start_y, event.y)
#         )
#         self.root.destroy()

def get_screen_snip():
    """Opens the snipping overlay and returns the cropped Image."""
    snipper = SnippingTool()
    snipper.root.mainloop()
    
    # If the user drew a box larger than 10x10 pixels, crop it
    if snipper.bbox and (snipper.bbox[2] - snipper.bbox[0] > 10) and (snipper.bbox[3] - snipper.bbox[1] > 10):
        return ImageGrab.grab(snipper.bbox)
        
    # Fallback: If they just clicked without dragging, grab the whole screen
    return ImageGrab.grab()


try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


# --- ðŸš¨ MONKEY PATCH FOR SOUNDCARD BUG ðŸš¨ ---
_original_fromstring = getattr(np, "fromstring", None)

def _safe_fromstring(*args, **kwargs):
    if kwargs.get("sep", "") == "":
        return np.frombuffer(*args, **kwargs)
    return _original_fromstring(*args, **kwargs)

np.fromstring = _safe_fromstring
# ---------------------------------------------



# --- NEW LIFESPAN MANAGER ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model
    print("[WARMUP] Pre-loading Whisper 'base.en' model to CUDA...")
    try:
        if whisper_model is None and WhisperModel is not None:
            # whisper_model = WhisperModel("base.en", device="cuda", compute_type="int8_float16")
            whisper_model = WhisperModel("medium.en", device="cuda", compute_type="int8")
    except Exception as e:
        print(f"Failed to pre-load Whisper: {e}")
    
    yield # This tells FastAPI the app is ready to run!


app = FastAPI(lifespan=lifespan)


# Local dev origins for Electron+Vite renderer.
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}


def cors_headers_for_request(request: Request) -> dict:
    origin = request.headers.get("origin")
    if origin and origin in ALLOWED_ORIGINS:
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    # Conservative fallback for non-browser/internal clients.
    return {"Access-Control-Allow-Origin": "*"}


# --- NEW: GLOBAL CRASH CATCHER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Never let error logging crash the exception handler itself.
    try:
        desktop_path = os.path.join(os.path.expanduser("~"), "Desktop", "vision_crash_log.txt")
        with open(desktop_path, "w", encoding="utf-8") as f:
            f.write(f"CRASH OCCURRED ON ROUTE: {request.url.path}\n\n")
            f.write(traceback.format_exc())
    except Exception as log_error:
        print(f"Failed to write crash log: {log_error}")

    print(f"FATAL ERROR CAUGHT: {exc}")  # Keep stdout logging for quick debugging
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)},
        headers=cors_headers_for_request(request),
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    
)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class UserCommand(BaseModel):
    text: str = ""
    messages: list[ConversationMessage] = Field(default_factory=list)
    tech_stack: str = ""
    model_name: str = "qwen2.5-coder:3b"
    action: Optional[str] = "chat"


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]

class TranscribeRequest(BaseModel):
    audio_path: str

class ExportMessage(BaseModel):
    role: str  # e.g., "System Audio", "User Action", "AI Answer"
    content: str

class ExportRequest(BaseModel):
    session_id: str
    messages: List[ExportMessage]    


def get_moondream_api_key() -> str:
    return (os.getenv("MOONDREAM_API_KEY") or "").strip().strip('"').strip("'")

whisper_model = None


def build_message_history(command: UserCommand):
    history = []

    for item in command.messages:
        content = item.content.strip()
        if not content:
            continue

        if item.role == "user":
            history.append(HumanMessage(content=content))
        else:
            history.append(AIMessage(content=content))

    command_text = command.text.strip()
    if command_text:
        if not history or not isinstance(history[-1], HumanMessage) or history[-1].content != command_text:
            history.append(HumanMessage(content=command_text))

    return [SystemMessage(content=FAST_CODING_PROMPT), *history]


def transcribe_audio_file(temp_audio_path: str) -> str:
    global whisper_model
    print("[DEBUG] Inside transcribe_audio_file")

    if whisper_model is None:
        raise RuntimeError("Whisper model is not initialized. Check FastAPI lifespan startup.")

    print("[DEBUG] Running inference on audio file...")


    optimized_jargon = (
    "Developer context: Python, JavaScript, TypeScript, React, Next.js, Node.js, FastAPI, "
    "HTML, CSS, Tailwind. Stack: MERN, MongoDB, PostgreSQL, SQL, NoSQL, Redis, Prisma, ORM. "
    "Concepts: functions, async, await, promises, closures, callbacks, hooks, useEffect, useState, Redux. "
    "Architecture: microservices, serverless, REST API, GraphQL, WebSockets, JSON, JWT, OAuth, endpoints, middleware, routing, caching. "
    "DevOps: AWS, Azure, GCP, Docker, Kubernetes, CI/CD, GitHub Actions, EC2, S3, Nginx. "
    "AI/ML: PyTorch, TensorFlow, LangChain, LangGraph, LLM, OpenAI, Hugging Face, Transformers, RAG, vector database, embeddings, fine-tuning, inference, prompt engineering, generative AI, NLP, CUDA, Ollama, Whisper, pandas, numpy. "
    "Commands: git commit, merge, push, pull, sudo, npm install, pip, grep. "
    "Terms: algorithmic complexity, distributed systems, state management, latency, scalability, debugging, syntax error, refactoring."
)   

    segments, _ = whisper_model.transcribe(
        temp_audio_path,
        language="en",
        beam_size=5,
        vad_filter=True,
        initial_prompt= optimized_jargon
    )

    return " ".join(segment.text.strip() for segment in segments).strip()

# --- Add this block ---
@app.get("/health")
async def health_check():
    """Endpoint for the Electron frontend to verify the backend is running."""
    return {"status": "ok", "message": "Backend is ready!"}
# ----------------------

@app.post("/agent/execute")
async def execute_command(command: UserCommand):
    current_model = command.model_name if command.model_name else "qwen2.5-coder:3b"
    if current_model.startswith("lightning:"):
        # lit_api_key = os.environ.get("LIGHTNING_API_KEY")
        if not lit_api_key:
            raise ValueError("LIGHTNING_API_KEY is missing from the .env file.")
            
        lit_model = current_model.replace("lightning:", "")
        llm = ChatOpenAI(
            model=lit_model,
            api_key=lit_api_key,
            base_url="https://lightning.ai/api/v1",
            temperature=0.2,
            streaming=True
        )
    else:
        llm = ChatOllama(
        model=current_model,
        temperature=0.2,
        base_url="http://localhost:11434"
    )

    user_text_lower = command.text.lower()
    
    # 1. 🚨 GET THE ACTION FROM REACT 🚨
    incoming_action = command.action
    
    # 2. Determine if we need to search the FAISS Vector Database
    needs_rag = incoming_action in ["career", "behavioral", "full_analysis"]
    
    # Fallback for standard typing in the chatbox
    career_triggers = ["experience", "resume", "project", "portfolio", "interview", "hustlebot", "shadow os", "kirana", "ragchatbot"]
    if incoming_action == "chat" and any(kw in user_text_lower for kw in career_triggers):
        needs_rag = True

    context = ""
    question = command.text

    # --- FAISS / CAREER ROUTE HANDLING ---
    if needs_rag:
        try:
            if "shadow os" in user_text_lower:
                context = read_career_markdown("shadow_os.md")
            elif "hustle bot" in user_text_lower or "hustlebot" in user_text_lower:
                context = read_career_markdown("hustlebot_master.md")
            elif "kirana" in user_text_lower:
                context = read_career_markdown("1k_kirana_store.md")
            elif any(kw in user_text_lower for kw in ["rag", "ragchatbot", "college"]):
                context = read_career_markdown("RAG_Chatbot.md")
            else:
                if not career_retriever:
                    async def stream_error(): yield "**SYSTEM ALERT:** My career database is offline."
                    return StreamingResponse(stream_error(), media_type="text/plain")

                docs = career_retriever.invoke(question)
                context_chunks = [f"PROJECT: {doc.metadata.get('Project', 'Resume Data')}\n{doc.page_content}" for doc in docs]
                context = "\n\n".join(context_chunks)
        except Exception as file_error:
            async def stream_err(): yield f"Missing career data file. Looked in: {CAREER_DATA_DIR}"
            return StreamingResponse(stream_err(), media_type="text/plain")

    # --- MESSAGE ASSEMBLY & GHOST CONTEXT FIX ---
    formatted_messages = []
    
    if needs_rag:
        # It's a Career question, so inject the FAISS context!
        system_prompt = CAREER_AGENT_PROMPT.format(context=context).strip()
        formatted_messages.append(SystemMessage(content=system_prompt))
        formatted_messages.append(HumanMessage(content=question))
        
    else:
        # 🚨 THE GHOST CONTEXT FIX 🚨
        # If the action is coding, concept, or strategy, React has ALREADY created a perfect prompt.
        # We MUST bypass the Python FAST_CODING_PROMPT so we don't accidentally inject the Advanced RAG tech_stack!
        
        if incoming_action in ["coding", "concept", "strategy", "quick_answer", "system_design"]:
            system_prompt = "You are an elite interview assistant. Follow the user's prompt instructions strictly."
            formatted_messages.append(SystemMessage(content=system_prompt))
        else:
            # Fallback for standard typing in the chatbox
            safe_stack = command.tech_stack if command.tech_stack else "Standard Web Development Stack"
            system_prompt = FAST_CODING_PROMPT.format(tech_stack=safe_stack)
            formatted_messages.append(SystemMessage(content=system_prompt))
            
        # Add historical messages from React
        for msg in command.messages[:-1]:
            if msg.role == "user":
                formatted_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                formatted_messages.append(AIMessage(content=msg.content))
                
        # Add the final user prompt
        if command.messages:
            last_user_text = command.messages[-1].content
            formatted_messages.append(HumanMessage(content=last_user_text))
        else:
            formatted_messages.append(HumanMessage(content=command.text))

    if not formatted_messages:
        async def stream_err(): yield "Please send a prompt."
        return StreamingResponse(stream_err(), media_type="text/plain")

    # --- STREAM TO REACT ---
    def generate_response():
        try:
            for chunk in llm.stream(formatted_messages):
                if chunk.content:
                    yield chunk.content.encode('utf-8')
        except Exception as error:
            yield f"\n\nError generating response: {error}".encode("utf-8")

    return StreamingResponse(
        generate_response(), 
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.post("/agent/moondream-pipeline")
async def run_moondream_pipeline(command: UserCommand):
    try:
        screenshot = ImageGrab.grab()
    except Exception as e:
        # Return a clear failure instead of an opaque crash so frontend can surface it.
        raise HTTPException(status_code=500, detail=f"Failed to capture screen: {e}")
    current_model = command.model_name if command.model_name else "qwen2.5-coder:3b"
    if current_model.startswith("lightning:"):
        # lit_api_key = os.environ.get("LIGHTNING_API_KEY")
        if not lit_api_key:
            raise ValueError("LIGHTNING_API_KEY is missing")
            
        lit_model = current_model.replace("lightning:", "")
        llm = ChatOpenAI(
            model=lit_model,
            api_key=lit_api_key,
            base_url="https://lightning.ai/api/v1",
            temperature=0.2,
            streaming=True
        )
    else:
        llm = ChatOllama(
        model=current_model,
        temperature=0.1,
        base_url=OLLAMA_BASE_URL
    )

    prompt_text = """
Task: You are an elite Technical Interview Vision Extractor. Analyze this screenshot and extract the core technical problem, instructions, and code.

CRITICAL EXTRACTION RULES:
1. IGNORE THE NOISE: Completely ignore all advertisements, pop-ups, navigation menus, browser tabs, video call UI, and marketing text.

2. FULL PROBLEM CAPTURE: Scan for imperative action words like "Write", "Create", "Build", "Design", "Implement", "Fix", or "Debug". Once found, extract the ENTIRE problem statement. You MUST include:
   - The main task description.
   - All Examples (Input/Output).
   - All Constraints or technical requirements.

3. ZERO-LOSS CODE EXTRACTION (CRITICAL): If you see a code editor, IDE, or code block:
   - You MUST extract EVERY LINE of code visible.
   - Capture all instructional comments (e.g., "// Write your code here").
   - Capture all starter code AND any user-written code currently in the editor.
   - PRESERVE EXACT INDENTATION, brackets, and syntax. Do not format or "fix" the code yourself; transcribe exactly what is on screen.

4. SYSTEM DESIGN TRANSLATION: If you see a flowchart, whiteboard, or architecture diagram, transcribe it so a downstream AI can build a Mermaid diagram. 
   - List every visible node/box (e.g., "Client", "API Gateway").
   - Describe the arrows and connections exactly (e.g., "Client -> points to -> API Gateway").

OUTPUT FORMAT:
Do NOT output conversational filler like "Here is the extracted text." 
You MUST strictly format your response using the following Markdown headers. If a section is not present in the image, output "None".

### PROBLEM STATEMENT
[Insert the full text of the problem, instructions, examples, and constraints here]

### CODE
```[language]
[Insert the exact extracted code here, preserving all indentation]
"""
    
    raw_extraction = ""
    moondream_api_key = get_moondream_api_key()
    if not moondream_api_key:
        raise HTTPException(status_code=503, detail="MOONDREAM_API_KEY is missing in backend environment.")

    try:
        moondream_cloud = md.vl(api_key=moondream_api_key)
        moondream_result = moondream_cloud.query(screenshot, prompt_text)
        print(f"[MOONDREAM] cloud result type={type(moondream_result)}")
        print(f"[MOONDREAM] cloud result={moondream_result}")
        if isinstance(moondream_result, dict):
            raw_extraction = (moondream_result.get("answer") or "").strip()
        else:
            raw_extraction = str(moondream_result).strip()
    except Exception as cloud_error:
        raise HTTPException(status_code=503, detail=f"Moondream cloud query failed: {cloud_error}")


    vision_task = f"""
You are an elite Technical Interview Assistant. 
Review the following raw text extracted from an image by a vision model.

CRITICAL INSTRUCTIONS:
- If the text describes an Architecture/System Design diagram: Output a valid Mermaid.js diagram (`mermaid` code block) representing the text, followed by a brief spoken-style explanation.
- If the text describes a Coding task or contains starter code: Fix any OCR typos and output the corrected code/task, followed by a brief spoken-style explanation of the core concept.
- Output ONLY the formatted result and explanation. Do not include AI filler like "Here is the corrected text".

RAW EXTRACTION:
{raw_extraction}
""".strip()
    
    validator_prompt = VISION_CREATE_PROMPT.format(command=vision_task)

    # Create a generator that yields chunks as the LLM types them
    async def stream_validated_response():
        try:
            for chunk in llm.stream([SystemMessage(content=validator_prompt)]):
                if chunk.content:
                    yield chunk.content.encode("utf-8")
        except Exception as e:
            yield f"\n\nError in validation stream: {e}".encode("utf-8")

    return StreamingResponse(
        stream_validated_response(),
        media_type="application/octet-stream",
        headers={
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff"
        }
    )


@app.post("/transcribe")
async def transcribe(request: TranscribeRequest):
    global whisper_model

    audio_path = request.audio_path

    if whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model is not initialized.")

    segments, _ = whisper_model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        vad_filter=True,
    )

    texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    transcript = " ".join(texts).strip()
    return {"text": transcript}

@app.post("/agent/voice")
async def execute_voice(audio: UploadFile = File(...)):
    print(f"[DEBUG] Received voice payload. Filename: {audio.filename}")
    suffix = ".webm"

    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1]

    temp_audio_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_audio_path = temp_file.name
            temp_file.write(await audio.read())
            
        # Check if the file is empty!
        file_size = os.path.getsize(temp_audio_path)
        print(f"[DEBUG] Saved temp file: {temp_audio_path} (Size: {file_size} bytes)")
        
        if file_size < 100:
            print("[DEBUG] WARNING: Audio file is suspiciously small or empty!")

        print("[DEBUG] Sending to transcribe_audio_file()...")
        transcript = transcribe_audio_file(temp_audio_path)
        print(f"[DEBUG] Transcription Complete: {transcript}")

        if not transcript:
            return {"status": "error", "response": "Could not transcribe audio."}

        return {"status": "success", "transcript": transcript}
    except Exception as error:
         return {"status": "error", "response": f"{error}"}

    finally:
         if temp_audio_path and os.path.exists(temp_audio_path):
             os.remove(temp_audio_path)


@app.post("/agent/listen-system")
async def listen_to_system_audio():
    import warnings
    import tempfile
    import os
    import numpy as np
    import soundcard as sc
    import soundfile as sf

    warnings.filterwarnings("ignore", message="data discontinuity in recording")

    temp_audio_path = None

    try:
        speakers = sc.all_speakers()
        if not speakers:
            return {"status": "error", "transcript": "No output speakers available for loopback capture."}

        print("Available Speakers:")
        for sp in speakers:
            print(f"{sp.name} | id={sp.id}")

        # Build a deterministic preference list, then validate each candidate by opening loopback.
        # This avoids locking onto a single brand/device and handles machines with multiple virtual outputs.
        keyword_priority = [
            ("realtek", 0),
            ("headphones", 1),
            ("speakers", 2),
            ("fxsound", 3),
            ("virtual", 4),
        ]

        ranked = []
        for idx, sp in enumerate(speakers):
            name = (sp.name or "").lower()
            if "hands-free" in name:
                continue
            rank = 100
            for kw, kw_rank in keyword_priority:
                if kw in name:
                    rank = kw_rank
                    break
            ranked.append((rank, idx, sp))

        default_speaker = sc.default_speaker()
        if default_speaker is not None:
            ranked.insert(0, (-1, -1, default_speaker))

        loopback_mic = None
        selected_speaker = None
        seen_ids = set()

        for _, _, sp in sorted(ranked, key=lambda x: (x[0], x[1])):
            if sp.id in seen_ids:
                continue
            seen_ids.add(sp.id)
            try:
                candidate = sc.get_microphone(sp.id, include_loopback=True)
                # Validate the device can actually be opened at the target format.
                with candidate.recorder(samplerate=48000, blocksize=2048):
                    pass
                loopback_mic = candidate
                selected_speaker = sp
                break
            except Exception as loop_err:
                print(f"[LOOPBACK SKIP] {sp.name}: {loop_err}")

        if loopback_mic is None or selected_speaker is None:
            return {"status": "error", "transcript": "Could not initialize a loopback recording device."}

        print(f"Using speaker: {selected_speaker.name}")

        record_seconds = 10
        sample_rate = 48000
        block_size = 2048
        num_frames = int(sample_rate * record_seconds)

        print(f"Recording {record_seconds}s of system audio...")
        with loopback_mic.recorder(samplerate=sample_rate, blocksize=block_size) as mic:
            audio_data = mic.record(numframes=num_frames)

        audio_data = np.asarray(audio_data, dtype=np.float32)
        if audio_data.size == 0:
            return {"status": "error", "transcript": "No audio frames captured from loopback device."}

        # Normalize to 2D [frames, channels] if the backend returns 1D for mono.
        if audio_data.ndim == 1:
            audio_data = audio_data.reshape(-1, 1)
        elif audio_data.ndim > 2:
            audio_data = np.squeeze(audio_data)
            if audio_data.ndim == 1:
                audio_data = audio_data.reshape(-1, 1)
            elif audio_data.ndim != 2:
                return {"status": "error", "transcript": f"Unexpected audio shape: {audio_data.shape}"}

        # Drop NaN/Inf early; these poison RMS and Whisper input.
        if not np.isfinite(audio_data).all():
            audio_data = np.nan_to_num(audio_data, nan=0.0, posinf=0.0, neginf=0.0)

        # Convert to mono before amplitude checks so one dead channel doesn't skew metrics.
        mono = audio_data.mean(axis=1)
        mono = mono.astype(np.float32, copy=False)

        peak = float(np.max(np.abs(mono))) if mono.size else 0.0
        rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0
        print(f"[AUDIO] raw_peak={peak:.8f} raw_rms={rms:.8f} frames={mono.shape[0]}")

        # Very low energy likely means actual silence or wrong device.
        if peak < 1e-6 and rms < 1e-7:
            return {"status": "error", "transcript": "No system audio detected."}

        # Remove DC offset (common with some virtual devices) before gain staging.
        mono = mono - float(np.mean(mono))
        peak = float(np.max(np.abs(mono))) if mono.size else 0.0
        rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0

        # Robust gain staging:
        # - Lift quiet captures up to a usable RMS.
        # - Clamp loud captures to avoid clipping and Whisper degradation.
        target_rms = 0.08
        target_peak = 0.95
        min_rms_for_gain = 1e-5
        max_gain = 50.0

        gain = 1.0
        if rms >= min_rms_for_gain:
            gain = target_rms / rms
        elif peak > 0.0:
            # If RMS is tiny but non-zero, use peak-based fallback.
            gain = target_peak / peak

        gain = float(np.clip(gain, 0.05, max_gain))
        mono = mono * gain

        post_peak = float(np.max(np.abs(mono))) if mono.size else 0.0
        if post_peak > target_peak and post_peak > 0:
            mono = mono * (target_peak / post_peak)

        mono = np.clip(mono, -1.0, 1.0).astype(np.float32, copy=False)

        post_rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0
        post_peak = float(np.max(np.abs(mono))) if mono.size else 0.0
        print(
            f"[AUDIO] gain={gain:.4f} post_peak={post_peak:.8f} "
            f"post_rms={post_rms:.8f}"
        )

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_audio_path = temp_file.name
            # Explicit subtype improves compatibility across Whisper/ffmpeg decoders.
            sf.write(temp_audio_path, mono, sample_rate, subtype="PCM_16")

        print("Transcribing audio...")

        global whisper_model
        if whisper_model is None:
            raise RuntimeError("Whisper model is not initialized. Check FastAPI lifespan startup.")

        optimized_jargon="Python, JavaScript, TypeScript, React, Next.js, FastAPI, Node.js, AWS, Docker, AI, LangChain, API",
    

        segments, _ = whisper_model.transcribe(
            temp_audio_path,
            language="en",
            task="transcribe",
            beam_size=5,
            best_of=5,
            vad_filter=False,
            vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=120),
            condition_on_previous_text=False,
            initial_prompt=optimized_jargon,
        )

        texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
        transcript = " ".join(texts).strip()

        if not transcript:
            return {"status": "success", "transcript": "[Audio detected but no clear speech recognized]"}

        print(f"Transcript: {transcript}")
        return {"status": "success", "transcript": transcript}

    except Exception as e:
        print(f"System Audio Error: {e}")
        return {"status": "error", "transcript": str(e)}

    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

from textblob import TextBlob

def clean_command(command: str) -> str:
    try:
        corrected = str(TextBlob(command).correct())
        return corrected
    except:
        return command

# -----------------------------
# Extract Code Block
# -----------------------------
def extract_code_block(text: str) -> str:
    if not text:
        return ""

    code_blocks = re.findall(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    if code_blocks:
        return max(code_blocks, key=len).strip()

    return text.strip()

import pytesseract
import os

TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

if not os.path.exists(TESSERACT_PATH):
    raise RuntimeError(f"Tesseract not found at {TESSERACT_PATH}")

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


import cv2
# -----------------------------
# OCR Text Extraction
# -----------------------------
def extract_text_from_image(image: Image.Image) -> str:
    # 1. Convert PIL image to OpenCV format (RGB to BGR)
    img_np = np.array(image.convert('RGB'))
    img_np = img_np[:, :, ::-1].copy()

    # 2. Convert to Grayscale
    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)

    # 3. Preserve Aspect Ratio Resize (Scale up by 2.5x for optimal Tesseract DPI)
    gray = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)

    # 4. Handle Dark Mode (Tesseract prefers black text on a white background)
    if np.mean(gray) < 127:
        gray = cv2.bitwise_not(gray)

    # 5. Otsu's Thresholding to perfectly crisp up the text
    _, processed_img = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    # 6. Run Tesseract with Page Segmentation Mode 6 (Assume a single uniform block of text)
    custom_config = r'--oem 3 --psm 6'
    text = pytesseract.image_to_string(processed_img, config=custom_config)

    return text.strip()

# -----------------------------
# Command Extraction
# -----------------------------
import re

import re

def extract_command(text: str):
    lines = text.split("\n")

    # PASS 1: Look for explicit developer comments (/// or //)
    for line in lines:
        raw = line.strip().lower()
        normalized = raw.replace("[", "/").replace("\\", "/")

        if re.search(r"/{2,}|/\[|//", normalized):
            # Remove leading junk symbols
            command = re.sub(r"^[^a-z]+", "", normalized)
            # Clean multiple slashes
            command = command.replace("/", " ").strip()
            return command

    # PASS 2: Fallback for bad OCR (e.g., "1 {/f Yrite a Pragran to use a callback function?")
    # Look for sentences ending in '?' or containing common instructional keywords
    for line in lines:
        raw = line.strip()
        lower_line = raw.lower()
        
        # If it has a question mark or looks like a prompt
        if "?" in raw or any(kw in lower_line for kw in ["write", "yrite", "create", "fix", "explain", "program"]):
            # Regex to clean up leading numbers and weird symbols (e.g. "1 {/f ")
            # This strips everything at the start of the string until it hits a letter.
            cleaned = re.sub(r"^[^a-zA-Z]+", "", raw)
            return cleaned.strip()

    # PASS 3: If all else fails, just return the longest line from the OCR 
    # so the frontend at least gives you *something* to edit instead of crashing.
    longest_line = max(lines, key=len, default="").strip()
    if len(longest_line) > 10:
        return re.sub(r"^[^a-zA-Z]+", "", longest_line).strip()

    return None

import subprocess
import tempfile

def format_code_with_prettier(code: str) -> str:
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jsx", mode="w", encoding="utf-8") as f:
            f.write(code)
            temp_path = f.name

        subprocess.run(
            ["npx", "prettier", "--write", temp_path],
            capture_output=True
        )

        with open(temp_path, "r", encoding="utf-8") as f:
            formatted = f.read()

        return formatted
    except:
        return code
    

def clean_ocr_noise(text: str) -> str:
    lines = text.split("\n")
    cleaned_lines = []
    
    # Common UI garbage words that we want to delete from the OCR output
    ignore_phrases = [
        "file", "project", "share", "my account", "download as zip", 
        "login", "sign up", "html", "css", "javascript app", 
        "clear console", "[object object]", "{object object]"
    ]
    
    for line in lines:
        lower_line = line.lower().strip()
        
        # Skip empty lines
        if not lower_line:
            continue
            
        # If the line contains a known UI word (and isn't actual code like 'file = open()'), skip it
        is_noise = any(phrase in lower_line for phrase in ignore_phrases)
        
        # Protect actual code that might accidentally trigger the noise filter
        is_code = "{" in line or "}" in line or "function" in line or "=" in line
        
        if is_noise and not is_code:
            continue
            
        cleaned_lines.append(line)
        
    return "\n".join(cleaned_lines)




@app.post("/agent/vision")
async def execute_vision_command(request: ChatRequest):
    try:
        # 1. Determine the mode 
        mode = "create" 
        instruction = "Implement this feature."
        
        if request.messages:
            last_msg = request.messages[-1].content
            if "[Vision: FIX]" in last_msg: mode = "fix"
            elif "[Vision: EXPLAIN]" in last_msg: mode = "explain"
            elif "[Vision: HELP]" in last_msg: mode = "help"
            elif "[Vision: SMART]" in last_msg: mode = "smart"
            
            if "] " in last_msg:
                instruction = last_msg.split("] ", 1)[-1]
            else:
                instruction = last_msg

        # 2. STEALTH MODE: Instantly grab the primary monitor invisibly
        # print(f"Stealth capturing full screen for {mode.upper()} mode...")
        # screenshot = ImageGrab.grab()
        # 2. CAPTURE MODE: Use Snipping Tool for Fix/Explain, Full Screen for Create
        # if mode in ["fix"]:
        if mode in ["fix", "explain", "create", "smart"]:
            print(f"Triggering Snipping Tool for {mode.upper()} mode...")
            screenshot = get_screen_snip()
        else:
            print(f"Stealth capturing full screen for {mode.upper()} mode...")
            screenshot = ImageGrab.grab()

        # 3. Formulate the "Sniper" Prompt
        if mode == "create":
            prompt_text = (
                "Scan this entire image. Look for any natural language text or code comment "
                "that contains an instruction to build something (e.g., words like 'create', 'write', 'build', 'implement', 'generate'). "
                "Extract ONLY that instructional sentence. Do not output any surrounding code or conversational text."
            )
        elif mode == "explain":
            prompt_text = (
                "Scan this entire image and identify the primary block of code or technical text visible. "
                "Perfectly extract this code block. Wrap the extracted code strictly in standard Markdown backticks (```). "
                "Do not include any greetings or conversational filler."
            )
        elif mode == "fix":
            prompt_text = (
                "Scan this entire image and identify the primary block of code visible on the screen. "
                "Perfectly extract this entire code block so it can be debugged. "
                "Wrap the extracted code strictly in standard Markdown backticks (```). "
                "Do not include any greetings or conversational filler."
            )
        elif mode == "smart":
            prompt_text = (
                "Task: You are an elite Technical Interview Vision Extractor. Extract all text, code, or architecture details from this image. "
                "CRITICAL RULES: "
                "1. IGNORE NOISE: Ignore all ads, pop-ups, and browser UI. "
                "2. DIAGRAMS: If you see a flowchart or architecture diagram, list the visible nodes and describe the connections exactly (e.g., 'Client box points to Load Balancer box'). "
                "3. QUESTIONS & CODE: If it's a coding or design question, transcribe the text perfectly. "
                "Do not attempt to solve, answer, or generate markdown diagrams here. Just transcribe the raw content accurately."
            )

        # 4. Query the Moondream Cloud API
        # print(f"Sending Stealth Image to Moondream Cloud API for {mode.upper()}...")
        # result = moondream_cloud.query(screenshot, prompt_text)
        # extracted_text = result.get("answer", "").strip()
        # print(f"RAW MOONDREAM OUTPUT:\n{extracted_text}")
        print("Running highly optimized LOCAL OCR for SMART mode...")
        extracted_text = extract_text_from_image(screenshot)
        print(f"RAW LOCAL OCR OUTPUT:\n{extracted_text}")

        # 5. Format the final command for the UI
        # We process the user's typed input box text if they provided any
        custom_instructions = ""
        if "Additional user instructions:" in instruction:
            user_text = instruction.split("Additional user instructions:")[-1].strip()
            custom_instructions = f"// User Note: {user_text}\n\n"

        if mode == "create":
            # For Create, we just pass the extracted instruction + the user's typed notes
            # We no longer need the brittle extract_command() regex!
            command = f"{custom_instructions}{extracted_text}".strip()
            
        else:
            # For Fix and Explain, we truncate if it's too massive, then append notes
            if len(extracted_text) > 2000:
                extracted_text = extracted_text[:2000] + "\n...[truncated]"
                
            command = f"{custom_instructions}{extracted_text}".strip()

        print(f"FINAL COMMAND: {command}")
        
        return {
            "status": "needs_confirmation",
            "command": command,
            "response": None 
        }

    except Exception as e:
        print(f"Vision Error: {e}")
        return {"status": "error", "response": str(e)}


@app.post("/agent/confirm")
async def confirm_and_execute(data: dict):
    command = data.get("command", "").strip()
    mode = data.get("mode", "").lower()

    if not command:
        async def stream_err():
            yield "No command provided"
        return StreamingResponse(stream_err(), media_type="text/plain")

    # --- MANUAL OVERRIDE CHECK (Slash Commands anywhere in text) ---
    command_lower = command.lower()
    
    if "/c" in command_lower:
        mode = "create"
        command = re.sub(r'(?i)/c\b', '', command).strip()
        print("[OVERRIDE] User manually forced CREATE mode.")
        
    elif "/m" in command_lower:
        mode = "mcq"
        command = re.sub(r'(?i)/m\b', '', command).strip()
        print("[OVERRIDE] User manually forced MCQ mode.")
        
    elif "/f" in command_lower or "/fix" in command_lower:
        mode = "fix"
        command = re.sub(r'(?i)/f(ix)?\b', '', command).strip()
        print("[OVERRIDE] User manually forced FIX mode.")
        
    elif "/e" in command_lower or "/exp" in command_lower or "/explain" in command_lower:
        mode = "explain"
        command = re.sub(r'(?i)/e(xp(lain)?)?\b', '', command).strip()
        print("[OVERRIDE] User manually forced EXPLAIN mode.")
        
    elif mode == "smart" or not mode:
        # --- DEFAULT FALLBACK ---
        mode = "create"
        print("[DEFAULT] No slash command found. Auto-routing to CREATE mode.")

    # --- AGENTIC ROUTER (Execution Mapping) ---
    mode_router = {
        "explain": (VISION_EXPLAIN_PROMPT, 0.3),
        "fix": (VISION_FIX_PROMPT, 0.1),
        "create": (VISION_CREATE_PROMPT, 0.1),
        "mcq": (VISION_MCQ_PROMPT, 0.1),
    }
    
    print(f"Routing to {mode.upper()} prompt with command:\n{command}")
    
    prompt_template, temperature = mode_router.get(mode, mode_router["create"])
    prompt = prompt_template.format(command=command)

    def generate_response():
        try:
            with requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": True,
                    "options": {
                        "temperature": temperature,
                        "num_predict": 1500
                    }
                },
                stream=True
            ) as response:
                for line in response.iter_lines():
                    if not line:
                        continue
                    try:
                        payload = json.loads(line.decode("utf-8"))
                        chunk = payload.get("response", "")
                        if chunk:
                            yield chunk
                    except Exception:
                        continue
        except Exception as e:
            yield f"\n\nError generating response: {e}"

    return StreamingResponse(
        generate_response(), 
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff"
        }
    )

@app.websocket("/ws/live-transcribe")
async def live_transcribe(websocket: WebSocket):
    await websocket.accept()
    global whisper_model
    
    if whisper_model is None:
        await websocket.close(code=1011)
        return

    last_text = ""

    def squash_stutters(text: str) -> str:
        if not text:
            return ""
        text = text.strip()
        
        # 1. Check exact halves (ignoring punctuation and spaces)
        # Fixes: "Hello there. Hello there" (missing period)
        mid = len(text) // 2
        half1 = text[:mid].strip()
        half2 = text[mid:].strip()
        
        # Strip all non-alphanumeric chars for a bulletproof comparison
        clean1 = re.sub(r'[^\w\s]', '', half1).lower()
        clean2 = re.sub(r'[^\w\s]', '', half2).lower()
        
        if clean1 == clean2:
            return half1 # Return the first half (which usually has the correct punctuation)

        # 2. Advanced Sentence Deduplication
        phrases = [p.strip() for p in re.split(r'(?<=[.!?])\s+', text) if p.strip()]
        deduped = []
        for phrase in phrases:
            clean_phrase = re.sub(r'[^\w\s]', '', phrase).lower()
            if deduped:
                clean_last = re.sub(r'[^\w\s]', '', deduped[-1]).lower()
                # Skip if it's the exact same phrase
                if clean_phrase == clean_last:
                    continue
                # Skip if it's a slightly shorter overlapping phrase
                if clean_phrase in clean_last or clean_last in clean_phrase:
                    if len(phrase) > len(deduped[-1]):
                        deduped[-1] = phrase
                    continue
            deduped.append(phrase)
            
        return " ".join(deduped)

    try:
        while True:
            wav_bytes = await websocket.receive_bytes()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file.write(wav_bytes)
                temp_path = temp_file.name
                
            try:
                segments, _ = whisper_model.transcribe(
                    temp_path,
                    language="en",
                    beam_size=2,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=300, speech_pad_ms=50),
                    condition_on_previous_text=False,
                    temperature=0.0,
                    compression_ratio_threshold=1.5
                )
                
                texts = []
                for seg in segments:
                    # Throw away pure static/noise
                    if getattr(seg, 'no_speech_prob', 0.0) < 0.6:
                        texts.append(seg.text.strip())
                        
                raw_text = " ".join(texts).strip()
                
                # --- RUN THE INDESTRUCTIBLE FILTER ---
                clean_text = squash_stutters(raw_text)

                # Only send if clean, not duplicate of the LAST chunk, and contains real words
                if clean_text and clean_text != last_text and len(clean_text) > 2:
                    
                    # Prevent sending a chunk that is just a slight overlap of the previous message
                    if last_text:
                        clean_last = re.sub(r'[^\w\s]', '', last_text).lower()
                        clean_current = re.sub(r'[^\w\s]', '', clean_text).lower()
                        if clean_current in clean_last or clean_last in clean_current:
                            if len(clean_text) > len(last_text):
                                last_text = clean_text
                                await websocket.send_json({"text": clean_text})
                            continue

                    last_text = clean_text 
                    await websocket.send_json({"text": clean_text})
                    
            except Exception as e:
                print(f"Live WS Transcribe Error: {e}")
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
    except WebSocketDisconnect:
        print("Live transcription WebSocket disconnected.")

@app.post("/agent/export-markdown")
async def export_markdown(request: ExportRequest):
    # Ensure the archive directory exists
    archive_dir = "meeting_archives"
    os.makedirs(archive_dir, exist_ok=True)
    
    # Generate a timestamped filename
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"{archive_dir}/meeting_{timestamp}_{request.session_id}.md"
    
    # Write the Markdown file
    with open(filename, "w", encoding="utf-8") as f:
        f.write(f"# Meeting Archive: {request.session_id}\n")
        f.write(f"**Date:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}\n\n")
        f.write("---\n\n")
        
        for msg in request.messages:
            f.write(f"### {msg.role}\n")
            f.write(f"{msg.content}\n\n")
            
    return {"status": "success", "file": filename}   

@app.post("/search-career")
async def search_career(query: RagQuery):
    # Use _with_score to see HOW relevant the result actually is.
    # Note: Lower score usually means closer/better match (L2 distance), 
    # but check your specific embedding model's metric.
    docs_and_scores = career_db.similarity_search_with_score(query.transcript, k=1)
    
    if not docs_and_scores:
        return {"context": "[NO CAREER DATA FOUND]"}
        
    doc, score = docs_and_scores[0]
    
    # Define a threshold (you will need to test what number works for your embeddings)
    # If the score is worse than the threshold, flag it for the LLM.
    THRESHOLD = 0.84 
    
    if score > THRESHOLD:
        warning = "\n[SYSTEM WARNING: This project is only loosely related. Use the 'Pivot Rule' to bridge the gap.]"
        return {"context": doc.page_content + warning}
        
    return {"context": doc.page_content} 

# -----------------------------
# Server Startup (Crucial for .exe)
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    # Start the server on localhost:8000 so Electron can talk to it
    print("Starting FastAPI backend on port 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000, use_colors=False)        


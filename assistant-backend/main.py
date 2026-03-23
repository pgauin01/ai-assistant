from typing import Literal
import os
import tempfile
import warnings
import base64
from io import BytesIO

from fastapi import FastAPI, File, UploadFile
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
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback
import os


import tkinter as tk
from PIL import ImageGrab
import moondream as md
import sys


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


class SnippingTool:
    def __init__(self):
        self.root = tk.Tk()
        # Make the window semi-transparent and fullscreen
        self.root.attributes('-alpha', 0.3)
        self.root.attributes('-fullscreen', True)
        self.root.attributes('-topmost', True) # Keep on top of everything
        self.root.config(cursor="cross")
        
        self.canvas = tk.Canvas(self.root, cursor="cross", bg="black")
        self.canvas.pack(fill="both", expand=True)
        
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
        # Create the red bounding box
        self.rect = self.canvas.create_rectangle(
            self.start_x, self.start_y, 1, 1, outline='red', width=3, fill="black"
        )

    def on_drag(self, event):
        curX, curY = (event.x, event.y)
        # Update the box size as you drag
        self.canvas.coords(self.rect, self.start_x, self.start_y, curX, curY)

    def on_release(self, event):
        # Save the coordinates and destroy the overlay
        self.bbox = (
            min(self.start_x, event.x), 
            min(self.start_y, event.y), 
            max(self.start_x, event.x), 
            max(self.start_y, event.y)
        )
        self.root.destroy()

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


# CODING_SYSTEM_PROMPT = """
# You are an elite, silent Staff Software Engineer.
# Your ONLY function is to output highly optimized, production-ready code.

# CRITICAL RULES:
# 1. DEFAULT BEHAVIOR: Output ONLY highly optimized, production-ready code in a markdown block. No greetings, no fluff, no explanations.
# 2. If the user asks for code, output ONLY the markdown code block.
# 3. Handle edge cases efficiently.
# 4. CONDITIONAL EXPLANATIONS: ONLY provide explanations IF explicitly asked.
# """


CODING_SYSTEM_PROMPT = """
You are an elite Principal Full Stack AI Engineer and Systems Architect.

YOUR CORE TECH STACK:
- Backend: Python, FastAPI
- Frontend: React, JavaScript, modern web standards
- Cloud & DevOps: AWS, Azure, GCP, Docker, Kubernetes, CI/CD pipelines
- AI/ML: Generative AI, Advanced RAG, LangGraph, Vector DBs, LiteLLM, AWS Bedrock

YOUR CODING STANDARDS (WHITE CODING):
1. Write extremely clean, modular, and scalable code.
2. Always include proper error handling, type hinting (in Python), and edge-case management.
3. Prioritize security, maintainability, and enterprise-grade architecture.
4. When designing systems, think about state management, latency, and resource efficiency.

COMMUNICATION STYLE:
- Be concise, highly technical, and authoritative. 
- Communicate complex technical concepts clearly, as if speaking to cross-functional stakeholders.
- Never write fluff. Output code and architectural explanations directly.

When the user asks you to build, debug, or explain something, process the request through the lens of this exact tech stack and these elite standards.
"""


app = FastAPI()

# --- NEW: GLOBAL CRASH CATCHER ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Write the exact error to a text file on your Desktop
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop", "vision_crash_log.txt")
    with open(desktop_path, "w", encoding="utf-8") as f:
        f.write(f"CRASH OCCURRED ON ROUTE: {request.url.path}\n\n")
        f.write(traceback.format_exc())
        
    print(f"FATAL ERROR CAUGHT: {exc}") # Try to print it too
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "detail": str(exc)}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class UserCommand(BaseModel):
    text: str = ""
    messages: list[ConversationMessage] = Field(default_factory=list)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


llm = ChatOllama(
    model=OLLAMA_MODEL,
    temperature=0.0,
    base_url=OLLAMA_BASE_URL,
)

vision_llm = ChatOllama(
    model="moondream",
    temperature=0.0,
    base_url=OLLAMA_BASE_URL,
)

MOONDREAM_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlfaWQiOiI0NGU2Y2Q1NC02YmJkLTRmZTktYjYxZS1hNDIxYTc1ZjAzZTgiLCJvcmdfaWQiOiJKSmtFczdhQWZCMGw5Rmk3SXNyYkZnRGtnaERyWG40VyIsImlhdCI6MTc3NDIxMTM3MSwidmVyIjoxfQ.nz27rLzkMfT8p7RetApkUWkRpCVNWFRYRvZ6hHlVjWs"
moondream_cloud = md.vl(api_key=MOONDREAM_API_KEY)

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

    return [SystemMessage(content=CODING_SYSTEM_PROMPT), *history]


def transcribe_audio_file(temp_audio_path: str) -> str:
    global whisper_model

    if WhisperModel is None:
        raise RuntimeError("faster-whisper is not installed.")

    if whisper_model is None:
        whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8")


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


# @app.post("/agent/execute")
# async def execute_command(command: UserCommand):
#     formatted_messages = build_message_history(command)

#     if len(formatted_messages) == 1:
#         return {"status": "error", "response": "Please send a prompt."}

#     try:
#         response = llm.invoke(formatted_messages)
#         return {"status": "success", "response": response.content}
#     except Exception as error:
#         return {"status": "error", "response": f"{error}"}

# @app.post("/agent/execute")
# async def execute_command(command: UserCommand):
#     formatted_messages = build_message_history(command)

#     # --- THE GLOBAL AUTO-ROUTER ---
#     user_text_lower = command.text.lower()
    
#     # Define trigger words that automatically activate your Career Brain
#     career_triggers = [
#         "experience", "resume", "project", "portfolio", "interview", 
#         "hustle bot", "hustlebot", "shadow os", "kirana", "challenge faced"
#     ]
    
#     is_career_question = "[Quick Command: CAREER]" in command.text or any(kw in user_text_lower for kw in career_triggers)

#     if is_career_question:
#         # 1. LOUD FAILURE: Don't fail silently to the coding prompt!
#         if not career_retriever:
#             return {"status": "success", "response": "âš ï¸ **SYSTEM ALERT:** My career database is offline. Please run `python build_brain.py` and restart the backend."}
        
#         # 2. Extract JUST the user's question safely
#         if "Question:\n\n" in command.text:
#             question = command.text.split("Question:\n\n")[-1].strip()
#         else:
#             question = command.text.replace("[Quick Command: CAREER]", "").strip()
        
#         # 3. Search the FAISS database
#         docs = career_retriever.invoke(question)
        
#         context_chunks = []
#         for doc in docs:
#             project_name = doc.metadata.get("Project", "Resume Data")
#             section_name = doc.metadata.get("Section", "")
#             chunk_text = f"PROJECT: {project_name} | SECTION: {section_name}\n{doc.page_content}"
#             context_chunks.append(chunk_text)
            
#         context = "\n\n".join(context_chunks)
        
#         career_system_prompt = f"""
#         You are an elite career agent representing the user.
#         Answer the interview question based ONLY on this context about their past projects. 
        
#         CRITICAL RULES:
#         1. DO NOT invent, guess, or hallucinate ANY technologies, databases, or frameworks. If it is not explicitly written in the context, DO NOT include it.
#         2. ISOLATE PROJECTS: You MUST strictly isolate the context. Do NOT apply a technology or feature from one project to another.
#         3. If the context does not contain the answer, say "I don't have that information in my career database."
#         4. TEMPLATE ENFORCEMENT: If the user asks for a general explanation or says "tell me about [Project]", you MUST format your response using EXACTLY these 5 Markdown headings:
#            ### 1. Overview
#            ### 2. Tech Stack Used
#            ### 3. Workflow and Architecture
#            ### 4. Challenges & Solutions
#            ### 5. Summary
#            *CRITICAL: If the provided context is missing the information for any of these 5 sections, you MUST write exactly: "Data not available in context." Do not guess or invent filler.*
#         5. EXPLAIN THE SOLUTIONS: Under the "Challenges & Solutions" heading, you MUST explicitly state how the challenge was solved. Include the exact Action taken and the Result achieved based on the context.

#         EXPERIENCE CONTEXT:
#         {context}
#         """
        
#         # 4. CRITICAL FIX: Isolate the Context!
#         # Wipe the older chat history so the small LLM doesn't get confused by previous coding tasks.
#         formatted_messages = [
#             SystemMessage(content=career_system_prompt.strip()),
#             HumanMessage(content=question)
#         ]
#     # -----------------------------------

#     if len(formatted_messages) == 1:
#         return {"status": "error", "response": "Please send a prompt."}

#     try:
#         response = llm.invoke(formatted_messages)
#         return {"status": "success", "response": response.content}
#     except Exception as error:
#         return {"status": "error", "response": f"{error}"}

@app.post("/agent/execute")
async def execute_command(command: UserCommand):
    formatted_messages = build_message_history(command)

    # --- THE GLOBAL AUTO-ROUTER ---
    user_text_lower = command.text.lower()
    
    career_triggers = [
        "experience", "resume", "project", "portfolio", "interview", 
        "hustle bot", "hustlebot", "shadow os", "kirana", "challenge faced",
        "ragchatbot", "college project"
    ]
    
    is_career_question = "[Quick Command: CAREER]" in command.text or any(kw in user_text_lower for kw in career_triggers)

    if is_career_question:
        if "Question:\n\n" in command.text:
            question = command.text.split("Question:\n\n")[-1].strip()
        else:
            question = command.text.replace("[Quick Command: CAREER]", "").strip()

        # --- INTENT ROUTER: Bypass FAISS for direct project summaries ---
        context = ""
        try:
            if "shadow os" in user_text_lower:
                context = read_career_markdown("shadow_os.md")
            elif "hustle bot" in user_text_lower or "hustlebot" in user_text_lower:
                context = read_career_markdown("hustlebot_master.md")
            elif "kirana" in user_text_lower:
                context = read_career_markdown("1k_kirana_store.md")
            elif "ragchatbot" in user_text_lower or "college" in user_text_lower:
                context = read_career_markdown("RAG_Chatbot.md")

            if context:
                print("⚡ MACRO TRIGGERED: Bypassing LLM and returning raw document directly.")
                return {"status": "success", "response": context}
                
            else:
                # Fallback to FAISS for general questions ("How did you handle rate limits?")
                if not career_retriever:
                    return {"status": "success", "response": "**SYSTEM ALERT:** My career database is offline."}

                docs = career_retriever.invoke(question)
                context_chunks = []
                for doc in docs:
                    project_name = doc.metadata.get("Project", "Resume Data")
                    chunk_text = f"PROJECT: {project_name}\n{doc.page_content}"
                    context_chunks.append(chunk_text)
                context = "\n\n".join(context_chunks)
        except FileNotFoundError as file_error:
            missing_file = os.path.basename(getattr(file_error, "filename", "") or "career file")
            return {
                "status": "error",
                "response": (
                    f"Missing career data file: {missing_file}. "
                    f"Looked in: {CAREER_DATA_DIR}"
                ),
            }
        # ----------------------------------------------------------------
        career_system_prompt = f"""
        You are an elite career agent representing the user.
        Answer the interview question based ONLY on this context about their past projects. 
        
        CRITICAL RULES:
        1. ABSOLUTE FACTUALITY: You are strictly forbidden from inventing, guessing, or hallucinating ANY details, features, target audiences, or trade-offs. 
        2. DO NOT EXTRAPOLATE: If the user asks about a detail or trade-off that is not explicitly written in the text below, you MUST reply: "That information is not in the career database."
        3. ISOLATE PROJECTS: Do NOT apply a technology or feature from one project to another.
        4. TEMPLATE ENFORCEMENT: If the user says "tell me about [Project]", you MUST format your response using EXACTLY these 6 Markdown headings:
           ### 1. Overview
           ### 2. Tech Stack Used
           ### 3. Workflow and Architecture
           ### 4. Challenges & Solutions
           ### 5. Summary
           ### 6. Engineering Trade-offs & Q&A
        5. EXPLAIN THE SOLUTIONS: Under "Challenges & Solutions", list EVERY challenge mentioned. Explicitly state the Situation, Action, and Result.
        6. TRADE-OFFS: You must copy the exact Q&A and trade-offs provided in the context. DO NOT invent your own trade-offs.

        EXPERIENCE CONTEXT:
        {context}
        """
        
        # Isolate context to prevent confusing the small LLM
        formatted_messages = [
            SystemMessage(content=career_system_prompt.strip()),
            HumanMessage(content=question)
        ]
    # -----------------------------------

    if len(formatted_messages) == 1:
        return {"status": "error", "response": "Please send a prompt."}

    try:
        response = llm.invoke(formatted_messages)
        return {"status": "success", "response": response.content}
    except Exception as error:
        return {"status": "error", "response": f"{error}"}

@app.post("/agent/voice")
async def execute_voice(audio: UploadFile = File(...)):
    suffix = ".webm"

    if audio.filename and "." in audio.filename:
        suffix = "." + audio.filename.rsplit(".", 1)[-1]

    temp_audio_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_audio_path = temp_file.name
            temp_file.write(await audio.read())

        transcript = transcribe_audio_file(temp_audio_path)

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
        print("Available Speakers:")
        speakers = sc.all_speakers()
        for sp in speakers:
            print(f"{sp.name} | id={sp.id}")

        # ðŸ”¥ Smart device selection (Headphones > FxSound > Default)
        selected_speaker = None

        for sp in speakers:
            name = sp.name.lower()
            if "headphones" in name and "hands-free" not in name:
                selected_speaker = sp
                break

        if not selected_speaker:
            for sp in speakers:
                if "fxsound" in sp.name.lower():
                    selected_speaker = sp
                    break

        if not selected_speaker:
            selected_speaker = sc.default_speaker()

        print(f"Using speaker: {selected_speaker.name}")

        loopback_mic = sc.get_microphone(selected_speaker.id, include_loopback=True)

        record_seconds = 10
        sample_rate = 48000

        print(f"Recording {record_seconds}s of system audio...")

        with loopback_mic.recorder(samplerate=sample_rate, blocksize=4096) as mic:
            audio_data = mic.record(numframes=int(sample_rate * record_seconds))

        # ðŸ”Š Validate signal
        max_amp = float(np.max(np.abs(audio_data)))
        print(f" Max amplitude: {max_amp}")

        if max_amp < 1e-5:
            return {
                "status": "error",
                "transcript": "No system audio detected."
            }

        # ðŸ”„ Convert to mono
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)

        # ðŸ’¾ Save temp audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_audio_path = temp_file.name
            sf.write(temp_audio_path, audio_data, sample_rate)

        print(" Transcribing audio...")

        # ðŸ”¥ Improved transcription
        global whisper_model
        if whisper_model is None:
            if WhisperModel is None:
                raise RuntimeError("faster-whisper not installed")
            whisper_model = WhisperModel("medium.en", device="cpu", compute_type="int8")

        segments, _ = whisper_model.transcribe(
            temp_audio_path,
            language="en",
            beam_size=5,
            vad_filter=False,
            vad_parameters=dict(min_silence_duration_ms=500),
            initial_prompt="This is a recording of system audio, possibly containing human speech.",
        )

        print(" Raw segments:")
        texts = []
        for seg in segments:
            print(seg.text)
            if seg.text.strip():
                texts.append(seg.text.strip())

        transcript = " ".join(texts).strip()

        # âœ… DO NOT treat as error anymore
        if not transcript:
            return {
                "status": "success",
                "transcript": "[Audio detected but no clear speech recognized]"
            }

        print(f"Transcript: {transcript}")

        return {
            "status": "success",
            "transcript": transcript
        }

    except Exception as e:
        print(f"System Audio Error: {e}")
        return {
            "status": "error",
            "transcript": str(e)
        }

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

# -----------------------------
# OCR Text Extraction
# -----------------------------
def extract_text_from_image(image: Image.Image) -> str:
    # Convert to grayscale
    image = image.convert("L")

    # ðŸ”¥ Increase contrast (huge improvement)
    import cv2
    import numpy as np

    img_np = np.array(image)
    img_np = cv2.threshold(img_np, 150, 255, cv2.THRESH_BINARY)[1]

    # Resize for clarity
    img_np = cv2.resize(img_np, (1200, 1200))

    text = pytesseract.image_to_string(img_np)

    return text

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


# -----------------------------
# Vision Endpoint
# -----------------------------
# @app.post("/agent/vision")
# async def execute_vision_command(request: ChatRequest):
#     try:
#         # 1. Determine the mode first
#         mode = "create" 
#         instruction = "Implement this feature."
        
#         if request.messages:
#             last_msg = request.messages[-1].content
#             if "[Vision: FIX]" in last_msg: mode = "fix"
#             elif "[Vision: EXPLAIN]" in last_msg: mode = "explain"
#             elif "[Vision: HELP]" in last_msg: mode = "help"
            
#             if "] " in last_msg:
#                 instruction = last_msg.split("] ", 1)[-1]
#             else:
#                 instruction = last_msg

#         # 2. Conditionally capture the screen based on the mode
#         if mode == "create":
#             print("Capturing full screen for Create mode...")
#             screenshot = ImageGrab.grab()  # Instant full screen
#         else:
#             print("Select area on screen...")
#             screenshot = get_screen_snip() # Opens the drawing tool

#         # 3. OCR the resulting image
#         ocr_text = extract_text_from_image(screenshot)
#         print("OCR TEXT:\n", ocr_text)

#         # 4. Handle based on the mode
#         if mode == "create":
#             # Uses our robust regex and fallback to find the /// or 'write' command
#             command = extract_command(ocr_text)
#             if not command:
#                 return {"status": "error", "response": "No /// or create command detected on screen."}
#             command = clean_command(command)
            
#         else:
#             # For Fix/Explain/Help, just grab the text from the snipped box
#             code_snippet = ocr_text.strip()
            
#             if len(code_snippet) > 1500:
#                 code_snippet = code_snippet[:1500] + "\n...[truncated]"

#             command = f"{instruction}\n\nCode on screen:\n```\n{code_snippet}\n```"

#         print(f"PENDING COMMAND: {command}")
#         return {
#             "status": "needs_confirmation",
#             "command": command,
#             "response": None 
#         }

#     except Exception as e:
#         print(f"Error: {e}")
#         return {"status": "error", "response": str(e)}


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
            
            if "] " in last_msg:
                instruction = last_msg.split("] ", 1)[-1]
            else:
                instruction = last_msg

        # 2. STEALTH MODE: Instantly grab the primary monitor invisibly
        print(f"Stealth capturing full screen for {mode.upper()} mode...")
        screenshot = ImageGrab.grab()

        # 3. Formulate the "Sniper" Prompt
        if mode == "create":
            prompt_text = "Scan this entire image. Locate the code comment that starts with '///'. Output ONLY the sentence written immediately after the '///'. Do not output any other text."
        else:
            # For Fix/Explain, we need the command AND the code!
            prompt_text = "Scan this entire image. Locate the code comment starting with '///'. Extract that comment, and ALSO perfectly extract the block of code immediately below it. Output ONLY the comment and the code."

        # 4. Query the Moondream Cloud API
        print("Sending Stealth Image to Moondream Cloud API...")
        # Notice how clean this is! No Base64 encoding required, just pass the PIL Image directly.
        result = moondream_cloud.query(screenshot, prompt_text)
        
        extracted_text = result.get("answer", "").strip()
        print(f"RAW MOONDREAM OUTPUT:\n{extracted_text}")

        # 5. Format the final command for the UI
        if mode == "create":
            command = extract_command(extracted_text)
            if not command:
                command = extracted_text 
        else:
            # Clean it up so it formats beautifully in the UI
            if len(extracted_text) > 1500:
                extracted_text = extracted_text[:1500] + "\n...[truncated]"
                
            # Only keep the user's custom typed text, drop the generic boilerplate!
            custom_instructions = ""
            if "Additional user instructions:" in instruction:
                user_text = instruction.split("Additional user instructions:")[-1].strip()
                custom_instructions = f"// User Note: {user_text}\n\n"
                
            # The UI will now ONLY show the clean code + your custom notes
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


clean_code = ""   
@app.post("/agent/confirm")
async def confirm_and_execute(data: dict):
    command = data.get("command", "")
    mode = data.get("mode", "").lower()

    if not command:
        return {"status": "error", "response": "No command provided"}

    # --- 1. EXPLAIN MODE ---
    if mode == "explain":
        prompt = f"""
        You are an elite Software Engineering Tutor.
        The user wants an explanation of the following code or concept extracted from their screen.
        
        Task:
        {command}

        CRITICAL RULES:
        1. Deeply analyze the concept or code.
        2. You MUST format your response EXACTLY using these headings:
        
        ### 📖 Overview & Purpose
        [Write a clear, high-level summary of what this code or concept does]

        ### 🧠 Architecture & Deep Dive
        [Provide a highly technical breakdown. Include under-the-hood mechanics, design patterns, or Time/Space complexity if applicable.]
        """
        temperature = 0.3

    # --- 2. FIX MODE ---
    elif mode == "fix":
        prompt = f"""
        You are an elite Senior Software Engineer.
        The user has provided code from their screen that contains bugs.

        Task:
        {command}

        CRITICAL RULES:
        1. Analyze the logic. Look for scope issues, bad math, or incorrect syntax.
        2. Do NOT invent OCR typos if the code is just logically wrong.
        3. You MUST format your response EXACTLY using these headings:
        
        ### 🐛 Bug Analysis
        [Explain the specific logical or syntax bugs, why they break the code, and how to fix them]

        ### 🛠️ Corrected Code
        ```javascript
        // Your final, production-ready fixed code here
        ```
        """
        temperature = 0.1

    # --- 3. CREATE MODE ---
    else:
        prompt = f"""
        You are an elite Senior Software Engineer.

        Task:
        {command}

        CRITICAL RULES:
        1. Write the implementation for the requested feature based on the context.
        2. You MUST format your response EXACTLY using these headings:

        ### ✨ Implementation Strategy
        [Briefly explain the approach and libraries/functions used]

        ### 🛠️ Code
        ```javascript
        // Your feature implementation here
        ```
        """
        temperature = 0.1

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature, 
                    "num_predict": 1500
                }
            }
        )

        result = response.json()
        raw = result.get("response", "")

        if not raw:
            return {"status": "error", "response": "LLM returned empty response"}

        # Return the beautiful markdown text straight to React
        return {"status": "success", "response": raw.strip()}

    except Exception as e:
        return {"status": "error", "response": str(e)}

# -----------------------------
# Server Startup (Crucial for .exe)
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    # Start the server on localhost:8000 so Electron can talk to it
    print("Starting FastAPI backend on port 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000, use_colors=False)        


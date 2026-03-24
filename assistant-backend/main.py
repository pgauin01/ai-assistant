from typing import Literal
import os
import tempfile
import warnings
import base64
from io import BytesIO

from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
try:
    import whisper
except ImportError:
    whisper = None

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
)


import tkinter as tk
from PIL import ImageGrab
import moondream as md
import sys
import threading
from fastapi.responses import JSONResponse, StreamingResponse

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"  # <--- ADD THIS FIX


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


app = FastAPI()

@app.on_event("startup")
def warmup_ai_models():
    def load_whisper():
        global whisper_model
        if WhisperModel is not None and whisper_model is None:
            print("[WARMUP] Pre-loading Whisper 'base.en' model to CPU in background...")
            try:
                # IMPORTANT: Keep the cpu_threads=4 fix here too!
                whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)
                print("[WARMUP] Whisper model is ready for instant voice commands!")
            except Exception as e:
                print(f"[WARMUP FAIL] Could not load Whisper: {e}")

    # Fire and forget: Runs the heavy loading on a separate thread
    threading.Thread(target=load_whisper, daemon=True).start()

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
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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

class TranscribeRequest(BaseModel):
    audio_path: str


llm = ChatOllama(
    model=OLLAMA_MODEL,
    temperature=0.0,
    base_url=OLLAMA_BASE_URL,
    num_ctx=2048,    
    num_predict=1500
)

vision_llm = ChatOllama(
    model="moondream",
    temperature=0.0,
    base_url=OLLAMA_BASE_URL,
)

MOONDREAM_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlfaWQiOiI0NGU2Y2Q1NC02YmJkLTRmZTktYjYxZS1hNDIxYTc1ZjAzZTgiLCJvcmdfaWQiOiJKSmtFczdhQWZCMGw5Rmk3SXNyYkZnRGtnaERyWG40VyIsImlhdCI6MTc3NDIxMTM3MSwidmVyIjoxfQ.nz27rLzkMfT8p7RetApkUWkRpCVNWFRYRvZ6hHlVjWs"
moondream_cloud = md.vl(api_key=MOONDREAM_API_KEY)

whisper_model = None
openai_whisper_model = None
if whisper is not None:
    try:
        openai_whisper_model = whisper.load_model("base")
        print("[WARMUP] openai-whisper 'base' model loaded.")
    except Exception as e:
        print(f"[WARNING] openai-whisper model load failed: {e}")


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

    if WhisperModel is None:
        raise RuntimeError("faster-whisper is not installed.")

    if whisper_model is None:
        print("[DEBUG] Loading Whisper 'base.en' model to CPU. This may take 15-30 seconds...")
        whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)
        print("[DEBUG] Whisper model successfully loaded to RAM!")

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


@app.post("/agent/execute")
async def execute_command(command: UserCommand):
    formatted_messages = build_message_history(command)
    user_text_lower = command.text.lower()
    
    career_triggers = [
        "experience", "resume", "project", "portfolio", "interview", 
        "hustle bot", "hustlebot", "shadow os", "kirana", "challenge faced",
        "ragchatbot", "college project"
    ]
    
    is_career_question = "[Quick Command: CAREER]" in command.text or any(kw in user_text_lower for kw in career_triggers)

    context = ""
    if is_career_question:
        if "Question:\n\n" in command.text:
            question = command.text.split("Question:\n\n")[-1].strip()
        else:
            question = command.text.replace("[Quick Command: CAREER]", "").strip()

        try:
            if "shadow os" in user_text_lower:
                context = read_career_markdown("shadow_os.md")
            elif "hustle bot" in user_text_lower or "hustlebot" in user_text_lower:
                context = read_career_markdown("hustlebot_master.md")
            elif "kirana" in user_text_lower:
                context = read_career_markdown("1k_kirana_store.md")
            elif any(kw in user_text_lower for kw in ["rag", "ragchatbot", "college"]):
                context = read_career_markdown("RAG_Chatbot.md")

            if context:
                print("MACRO TRIGGERED: Bypassing LLM and returning raw document directly.")
                # Return macro as a quick stream chunk
                async def stream_macro():
                    yield context
                return StreamingResponse(stream_macro(), media_type="text/plain")
                
            else:
                if not career_retriever:
                    async def stream_error():
                        yield "**SYSTEM ALERT:** My career database is offline."
                    return StreamingResponse(stream_error(), media_type="text/plain")

                docs = career_retriever.invoke(question)
                context_chunks = [f"PROJECT: {doc.metadata.get('Project', 'Resume Data')}\n{doc.page_content}" for doc in docs]
                context = "\n\n".join(context_chunks)
        except Exception as file_error:
            async def stream_err():
                yield f"Missing career data file. Looked in: {CAREER_DATA_DIR}"
            return StreamingResponse(stream_err(), media_type="text/plain")
        
        formatted_messages = [
            SystemMessage(content=CAREER_AGENT_PROMPT.format(context=context).strip()),
            HumanMessage(content=question)
        ]

    if len(formatted_messages) == 1:
        async def stream_err(): yield "Please send a prompt."
        return StreamingResponse(stream_err(), media_type="text/plain")

    # -Stream tokens directly to React ---
    async def generate_response():
        try:
            for chunk in llm.stream(formatted_messages):
                if chunk.content:
                    yield chunk.content
        except Exception as error:
            yield f"\n\nError generating response: {error}"

    return StreamingResponse(generate_response(), media_type="text/plain")


@app.post("/transcribe")
async def transcribe(request: TranscribeRequest):
    global openai_whisper_model
    global whisper_model

    audio_path = request.audio_path

    if whisper is not None:
        if openai_whisper_model is None:
            openai_whisper_model = whisper.load_model("base")
        result = openai_whisper_model.transcribe(audio_path)
        return {"text": result.get("text", "").strip()}

    if WhisperModel is not None:
        if whisper_model is None:
            whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)
        
        # --- THE FIX IS HERE ---
        segments, _ = whisper_model.transcribe(
            audio_path,
            language="en",
            beam_size=5,
            vad_filter=True,
        )
        
        # faster-whisper returns a generator, so we must iterate through it cleanly
        texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
        transcript = " ".join(texts).strip()
        
        return {"text": transcript}
        # -----------------------

    raise HTTPException(
        status_code=500,
        detail="No transcription backend available. Install 'openai-whisper' or 'faster-whisper'.",
    )

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
            if WhisperModel is None:
                raise RuntimeError("faster-whisper not installed")
            whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)

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

        # 4. Query the Moondream Cloud API
        print(f"Sending Stealth Image to Moondream Cloud API for {mode.upper()}...")
        result = moondream_cloud.query(screenshot, prompt_text)
        
        extracted_text = result.get("answer", "").strip()
        print(f"RAW MOONDREAM OUTPUT:\n{extracted_text}")

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


clean_code = ""   
@app.post("/agent/confirm")
async def confirm_and_execute(data: dict):
    command = data.get("command", "")
    mode = data.get("mode", "").lower()

    if not command:
        async def stream_err():
            yield "No command provided"
        return StreamingResponse(stream_err(), media_type="text/plain")

    mode_router = {
        "explain": (VISION_EXPLAIN_PROMPT, 0.3),
        "fix": (VISION_FIX_PROMPT, 0.1),
        "create": (VISION_CREATE_PROMPT, 0.1),
    }
    prompt_template, temperature = mode_router.get(mode, mode_router["create"])
    prompt = prompt_template.format(command=command)

    async def generate_response():
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

    return StreamingResponse(generate_response(), media_type="text/plain")

@app.websocket("/ws/live-transcribe")
async def live_transcribe(websocket: WebSocket):
    await websocket.accept()
    global whisper_model
    
    if whisper_model is None:
        if WhisperModel is None:
            await websocket.close(code=1011)
            return
        whisper_model = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)

    last_text = ""

    try:
        while True:
            wav_bytes = await websocket.receive_bytes()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file.write(wav_bytes)
                temp_path = temp_file.name
                
            try:
                # 1. Force greedy decoding (temperature=0.0) to stop wild hallucinations
                segments, _ = whisper_model.transcribe(
                    temp_path,
                    language="en",
                    beam_size=5,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=100),
                    condition_on_previous_text=False,
                    temperature=0.0 
                )
                
                texts = []
                for seg in segments:
                    # --- THE KILL SWITCH ---
                    # Whisper scores every segment on how likely it is to be silence/noise.
                    # If it's over 60% likely to be noise, we instantly throw the text in the trash!
                    if getattr(seg, 'no_speech_prob', 0.0) < 0.6:
                        texts.append(seg.text.strip())
                        
                raw_text = " ".join(texts).strip()
                
                # --- THE ULTIMATE STUTTER CURE ---
                import re
                # Split text into logical sentences based on punctuation
                sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', raw_text) if s.strip()]
                
                mid = len(sentences) // 2
                if mid > 0 and sentences[:mid] == sentences[mid:]:
                    # If it perfectly looped (A B C A B C), squash it down to just (A B C)
                    raw_text = " ".join(sentences[:mid])
                # ---------------------------------

                # 3. Only send if it actually contains clean text AND isn't a stale duplicate
                if raw_text and raw_text != last_text and len(raw_text) > 2:
                    last_text = raw_text 
                    await websocket.send_json({"text": raw_text})
                    
            except Exception as e:
                print(f"Live WS Transcribe Error: {e}")
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
    except WebSocketDisconnect:
        print("Live transcription WebSocket disconnected.")

# -----------------------------
# Server Startup (Crucial for .exe)
# -----------------------------
if __name__ == "__main__":
    import uvicorn
    # Start the server on localhost:8000 so Electron can talk to it
    print("Starting FastAPI backend on port 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000, use_colors=False)        


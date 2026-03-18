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

from PIL import ImageGrab
import numpy as np
import soundcard as sc
import soundfile as sf

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


# --- 🚨 MONKEY PATCH FOR SOUNDCARD BUG 🚨 ---
_original_fromstring = getattr(np, "fromstring", None)

def _safe_fromstring(*args, **kwargs):
    if kwargs.get("sep", "") == "":
        return np.frombuffer(*args, **kwargs)
    return _original_fromstring(*args, **kwargs)

np.fromstring = _safe_fromstring
# ---------------------------------------------


CODING_SYSTEM_PROMPT = """
You are an elite, silent Staff Software Engineer.
Your ONLY function is to output highly optimized, production-ready code.

CRITICAL RULES:
1. DEFAULT BEHAVIOR: Output ONLY highly optimized, production-ready code in a markdown block. No greetings, no fluff, no explanations.
2. If the user asks for code, output ONLY the markdown code block.
3. Handle edge cases efficiently.
4. CONDITIONAL EXPLANATIONS: ONLY provide explanations IF explicitly asked.
"""


app = FastAPI()

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
    model="qwen2.5-coder:3b",
    temperature=0.0,
    base_url="http://127.0.0.1:11434",
)

vision_llm = ChatOllama(
    model="qwen3.5:4b",
    temperature=0.0,
    base_url="http://127.0.0.1:11434",
)

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

    segments, _ = whisper_model.transcribe(
        temp_audio_path,
        language="en",
        beam_size=5,
        vad_filter=True,
        initial_prompt=(
            "Developer terminology: Python, JavaScript, React, Node.js, FastAPI, HTML, CSS, "
            "script, function, async, await, blockchain, solidity, Web3."
        ),
    )

    return " ".join(segment.text.strip() for segment in segments).strip()


@app.post("/agent/execute")
async def execute_command(command: UserCommand):
    formatted_messages = build_message_history(command)

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
        print("\n🔊 Available Speakers:")
        speakers = sc.all_speakers()
        for sp in speakers:
            print(f"{sp.name} | id={sp.id}")

        # 🔥 Smart device selection (Headphones > FxSound > Default)
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

        print(f"\n🎯 Using speaker: {selected_speaker.name}")

        loopback_mic = sc.get_microphone(selected_speaker.id, include_loopback=True)

        record_seconds = 5
        sample_rate = 48000

        print(f"🎧 Recording {record_seconds}s of system audio...")

        with loopback_mic.recorder(samplerate=sample_rate, blocksize=4096) as mic:
            audio_data = mic.record(numframes=int(sample_rate * record_seconds))

        # 🔊 Validate signal
        max_amp = float(np.max(np.abs(audio_data)))
        print(f"🔊 Max amplitude: {max_amp}")

        if max_amp < 1e-5:
            return {
                "status": "error",
                "transcript": "No system audio detected."
            }

        # 🔄 Convert to mono
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)

        # 💾 Save temp audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_audio_path = temp_file.name
            sf.write(temp_audio_path, audio_data, sample_rate)

        print("🧠 Transcribing audio...")

        # 🔥 Improved transcription
        global whisper_model
        if whisper_model is None:
            if WhisperModel is None:
                raise RuntimeError("faster-whisper not installed")
            whisper_model = WhisperModel("medium.en", device="cpu", compute_type="int8")

        segments, _ = whisper_model.transcribe(
            temp_audio_path,
            language="en",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            initial_prompt="This is a recording of system audio, possibly containing human speech.",
        )

        print("🧠 Raw segments:")
        texts = []
        for seg in segments:
            print(seg.text)
            if seg.text.strip():
                texts.append(seg.text.strip())

        transcript = " ".join(texts).strip()

        # ✅ DO NOT treat as error anymore
        if not transcript:
            return {
                "status": "success",
                "transcript": "[Audio detected but no clear speech recognized]"
            }

        print(f"🗣️ Transcript: {transcript}")

        return {
            "status": "success",
            "transcript": transcript
        }

    except Exception as e:
        print(f"❌ System Audio Error: {e}")
        return {
            "status": "error",
            "transcript": str(e)
        }

    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
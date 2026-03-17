from typing import Literal
import os
import tempfile

from fastapi import FastAPI
from fastapi import File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
import base64
from io import BytesIO
from PIL import ImageGrab

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


CODING_SYSTEM_PROMPT = """
You are an elite, silent Staff Software Engineer.
Your ONLY function is to output highly optimized, production-ready code.

CRITICAL RULES:
1. DEFAULT BEHAVIOR: Output ONLY highly optimized, production-ready code in a markdown block. No greetings, no fluff, no explanations.
2. If the user asks for code, output ONLY the markdown code block.
3. Handle edge cases efficiently.
4. CONDITIONAL EXPLANATIONS: ONLY provide explanations or architectural breakdowns IF the user explicitly includes words like "explain", "how", or "why" in their prompt.

EXAMPLE INTERACTION:
User: "Write a function to add two numbers in JS"
Assistant:
```javascript
/**
 * Adds two numbers.
 */
function add(a, b) {
  if (typeof a !== "number" || typeof b !== "number") {
    throw new Error("Inputs must be numbers");
  }
  return a + b;
}
```
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
whisper_model = None

vision_llm = ChatOllama(
    model="llava", 
    temperature=0.0, 
    base_url="http://127.0.0.1:11434"
)


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
        raise RuntimeError("faster-whisper is not installed in this Python environment.")

    if whisper_model is None:
        whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")

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
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    return transcript


@app.post("/agent/execute")
async def execute_command(command: UserCommand):
    formatted_messages = build_message_history(command)
    if len(formatted_messages) == 1:
        return {"status": "error", "response": "Please send a prompt."}

    try:
        response = llm.invoke(formatted_messages)
        return {"status": "success", "response": response.content}
    except Exception as error:
        return {"status": "error", "response": f"Failed to connect to brain: {error}"}


@app.post("/agent/voice")
async def execute_voice(
    audio: UploadFile = File(...),
):
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
            return {"status": "error", "response": "Could not transcribe audio.", "transcript": ""}

        return {"status": "success", "transcript": transcript}
    except Exception as error:
        return {
            "status": "error",
            "response": f"Voice processing failed: {error}",
            "transcript": "",
        }
    finally:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

@app.post("/agent/vision")
async def execute_vision_command(request: ChatRequest):
    print("\n📸 Capturing screen...")
    try:
        screenshot = ImageGrab.grab()
        
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        user_text = request.messages[-1].content if request.messages else "Explain the code."
        print(f"🧠 Sending image to Llava with prompt: '{user_text}'")
        
        # 1. ADD THE SYSTEM PROMPT TO THE MESSAGES ARRAY
        messages = [
            SystemMessage(content=CODING_SYSTEM_PROMPT), # <-- Enforces the Staff Engineer rules!
            HumanMessage(
                content=[
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url", 
                        "image_url": {"url": f"data:image/png;base64,{img_str}"}
                    }
                ]
            )
        ]
        
        raw_response = vision_llm.invoke(messages).content
        
        # 2. RUN IT THROUGH THE REGEX EXTRACTOR
        
        return {"status": "success", "response": raw_response}

    except Exception as e:
        print(f"❌ Vision Error: {e}")
        return {"status": "error", "response": f"Failed to analyze screen: {str(e)}"}

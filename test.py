import requests
import base64
from PIL import Image

# -----------------------------
# Load & preprocess image
# -----------------------------
image_path = "test.png"

# Resize (IMPORTANT for your setup)
img = Image.open(image_path)
img = img.resize((768, 768))

# Convert to base64
from io import BytesIO
buffered = BytesIO()
img.save(buffered, format="PNG")
img_str = base64.b64encode(buffered.getvalue()).decode()

print(f"✅ Image processed, size: {img.size}")

# -----------------------------
# Prompt
# -----------------------------
prompt = """
You are an expert software engineer.

Read the code in this image and explain what it does.

Be concise.
"""

# -----------------------------
# API Call
# -----------------------------
res = requests.post(
    "http://localhost:11434/api/generate",
    json={
        "model": "qwen3-vl:2b",
        "prompt": prompt,
        "images": [img_str],
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_predict": 512
        }
    }
)

data = res.json()

# -----------------------------
# Debug output (VERY IMPORTANT)
# -----------------------------
print("\n🧾 FULL RESPONSE:")
print(data)

# -----------------------------
# Safe parsing
# -----------------------------
if "response" in data:
    print("\n🤖 MODEL OUTPUT:\n")
    print(data["response"])

elif "message" in data:
    print("\n🤖 MODEL OUTPUT:\n")
    print(data["message"].get("content", ""))

elif "error" in data:
    print("\n❌ ERROR:\n")
    print(data["error"])

else:
    print("\n⚠️ Unexpected response format")
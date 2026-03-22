import os
import base64
import requests
import json

def test_ollama_vision():
    # 1. Find the debug screenshot on your desktop
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop", "debug_screenshot.jpg")
    
    if not os.path.exists(desktop_path):
        print(f"❌ Could not find {desktop_path}")
        return

    # 2. Read the raw bytes and convert to Base64
    with open(desktop_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode("utf-8")

    # 3. Build the exact payload Ollama expects natively
    # NOTE: Ollama does NOT want the 'data:image/jpeg;base64,' prefix!
    payload = {
        "model": "moondream",
        "prompt": "Scan this entire image. Locate the code comment that starts with '///'. Output ONLY the sentence written immediately after the '///'. Do not output any other text.",
        "images": [base64_image],
        "stream": False,
        "options": {
            "temperature": 0.0 # Force it to be as analytical as possible
        }
    }

    print("🧠 Sending raw request directly to Ollama (Bypassing LangChain)...")
    
    try:
        response = requests.post("http://localhost:11434/api/generate", json=payload)
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ OLLAMA RAW OUTPUT:")
            print("-" * 40)
            print(result.get("response", "No response field found."))
            print("-" * 40)
        else:
            print(f"❌ Ollama Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    test_ollama_vision()
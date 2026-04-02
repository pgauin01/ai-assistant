import os
import sys
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

# Your explicit keys from your discovery
BASE_KEY = "0edb4376-33d8-41b8-b12e-420dfc496203"
BILLING_WORKSPACE = "prafulgaur2/language-model"

# This is the magic fix: combine them for the Bearer token
FULL_API_KEY = f"{BASE_KEY}/{BILLING_WORKSPACE}"

# The list of models we want to test
models_to_test = [
    "lightning-ai/gpt-oss-120b",
    "lightning-ai/llama-3.3-70b",
    "lightning-ai/DeepSeek-V3.1", # Sometimes formatted as deepseek/deepseek-v3.1
    "google/gemini-2.5-flash",
    "google/gemini-3-flash-preview"
]

print(f"🔑 Using Billing Key format: ***...***.../{BILLING_WORKSPACE}\n")

for model_name in models_to_test:
    print("=" * 50)
    print(f"🚀 Testing Model: {model_name}")
    print("=" * 50)
    
    try:
        llm = ChatOpenAI(
            model=model_name,
            api_key=FULL_API_KEY,
            base_url="https://lightning.ai/api/v1",
            temperature=0.5,
            streaming=True
        )

        messages = [HumanMessage(content="Reply with exactly one short sentence: What model are you?")]
        
        print("RESPONSE: ", end="")
        for chunk in llm.stream(messages):
            print(chunk.content, end="", flush=True)
            
        print("\n✅ SUCCESS\n")
        
    except Exception as e:
        print(f"\n❌ FAILED")
        print(f"Error Details: {str(e)}\n")
import os
import sys
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()  
# Your explicit keys from your discovery
BASE_KEY = os.getenv("BASE_KEY")
BILLING_WORKSPACE = os.getenv("BILLING_WORKSPACE")

# This is the magic fix: combine them for the Bearer token
FULL_API_KEY = f"{BASE_KEY}/{BILLING_WORKSPACE}"

print("🔑 Testing Lightning AI Models with the following API Key:" , FULL_API_KEY)

# The list of models we want to test
models_to_test = [
    "lightning-ai/gpt-oss-120b",
    "lightning-ai/llama-3.3-70b",
    "lightning-ai/DeepSeek-V3.1", 
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
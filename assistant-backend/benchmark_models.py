import os
import time

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BASE_KEY = os.getenv("BASE_KEY")
BILLING_WORKSPACE = os.getenv("BILLING_WORKSPACE")

if not BASE_KEY or not BILLING_WORKSPACE:
    raise ValueError("Missing BASE_KEY or BILLING_WORKSPACE in environment.")

FULL_API_KEY = f"{BASE_KEY}/{BILLING_WORKSPACE}"

client = OpenAI(
    api_key=FULL_API_KEY,
    base_url="https://lightning.ai/api/v1",
)

MODELS_TO_TEST = [
    "lightning-ai/gpt-oss-120b",
    "lightning-ai/gpt-oss-20b",
    "lightning-ai/llama-3.3-70b",
    "lightning-ai/DeepSeek-V3.1",
]

TEST_PROMPT = "Design a highly available distributed rate limiter. Format exactly with headings."


def run_benchmark(model_name: str) -> None:
    print(f"\nBenchmarking: {model_name}...")
    start_time = time.time()

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": TEST_PROMPT}],
            stream=True,
        )

        ttft = None
        token_count = 0

        for chunk in response:
            if ttft is None:
                ttft = time.time() - start_time
                print(f"   TTFT: {ttft:.3f} seconds")

            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                token_count += 1

        total_time = time.time() - start_time
        generation_time = total_time - ttft if ttft is not None else total_time
        tps = token_count / generation_time if generation_time > 0 else 0

        print(f"   TPS: {tps:.1f} tokens/sec")
        print(f"   Total Time: {total_time:.2f} seconds")

    except Exception as e:
        print(f"   Error benchmarking {model_name}: {e}")


if __name__ == "__main__":
    for model in MODELS_TO_TEST:
        run_benchmark(model)

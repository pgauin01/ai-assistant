import argparse
import os
import sys
from pathlib import Path

import moondream as md
from dotenv import load_dotenv
from PIL import Image, ImageGrab


DEFAULT_PROMPT = (
    "Extract all code and visible technical text exactly as shown. "
    "Do not summarize."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Direct Moondream Cloud test (no OCR fallback)."
    )
    parser.add_argument(
        "--image",
        type=str,
        default="",
        help="Path to an input image. If omitted, captures current screen.",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=DEFAULT_PROMPT,
        help="Prompt sent to Moondream Cloud.",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default="",
        help="Override MOONDREAM_API_KEY from .env.",
    )
    return parser.parse_args()


def resolve_image(image_arg: str) -> Image.Image:
    if image_arg:
        image_path = Path(image_arg).expanduser().resolve()
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        return Image.open(image_path)
    return ImageGrab.grab()


def main() -> int:
    args = parse_args()
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

    api_key = args.api_key or os.getenv("MOONDREAM_API_KEY", "").strip().strip('"').strip("'")
    if not api_key:
        print("ERROR: MOONDREAM_API_KEY is missing. Set it in assistant-backend/.env or pass --api-key.")
        return 1

    try:
        image = resolve_image(args.image)
    except Exception as e:
        print(f"ERROR: Failed to load/capture image: {e}")
        return 1

    try:
        client = md.vl(api_key=api_key)
        result = client.query(image, args.prompt)
    except Exception as e:
        msg = str(e)
        print(f"ERROR: Moondream Cloud request failed: {msg}")

        # Keep this actionable for your exact failure mode.
        if "401" in msg or "Unauthorized" in msg:
            print("HINT: API key is invalid/expired or not authorized for this account/workspace.")
        elif "403" in msg:
            print("HINT: Access forbidden. Check plan permissions and workspace entitlements.")
        elif "429" in msg:
            print("HINT: Rate-limited. Retry after some time.")
        return 1

    print("SUCCESS: Moondream Cloud response received.")
    if isinstance(result, dict):
        print(result.get("answer", result))
    else:
        print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())

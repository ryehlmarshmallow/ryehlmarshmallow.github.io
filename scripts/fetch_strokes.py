#!/usr/bin/env python3
"""
Download Hanzi Writer character stroke vector data for all unique characters
in data/vocabulary.json to enable 100% offline stroke writing and quiz checking.
"""

import concurrent.futures
import json
import os
import urllib.request
import urllib.parse

CDN_URL = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/{char}.json"
OUTPUT_DIR = "data/strokes"

def fetch_char_stroke(char: str) -> bool:
    out_path = os.path.join(OUTPUT_DIR, f"{char}.json")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 10:
        return True

    encoded_char = urllib.parse.quote(char)
    url = CDN_URL.format(char=encoded_char)
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (HSK-Vocab-Fetcher/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read()
            # Validate valid json
            parsed = json.loads(data)
            if "strokes" in parsed:
                with open(out_path, "wb") as f:
                    f.write(data)
                return True
    except Exception as e:
        print(f"Error fetching {char} ({url}): {e}")
    return False

def main():
    json_path = "data/vocabulary.json"
    if not os.path.exists(json_path):
        print(f"Missing {json_path}. Run scripts/convert_data.py first.")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        vocab = json.load(f)

    unique_chars = sorted(list({c for item in vocab for c in item["hanzi"] if "\u4e00" <= c <= "\u9fff"}))
    print(f"Found {len(unique_chars)} unique Chinese characters to fetch.")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    success_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_char_stroke, unique_chars))
        success_count = sum(1 for r in results if r)

    print(f"Downloaded {success_count}/{len(unique_chars)} stroke files to {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()

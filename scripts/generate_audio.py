import asyncio
import json
import os
import sys
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "audio")
VOCAB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "vocabulary.json")

async def generate_item(semaphore, item, total, idx):
    item_id = item["id"]
    hanzi = item["hanzi"]
    out_path = os.path.join(AUDIO_DIR, f"{item_id}.mp3")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return True

    async with semaphore:
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(hanzi, VOICE)
                await comm.save(out_path)
                if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
                    if idx % 20 == 0 or idx == total:
                        print(f"[{idx}/{total}] Generated audio for '{hanzi}' (ID: {item_id})")
                    return True
            except Exception as e:
                print(f"Attempt {attempt+1} failed for '{hanzi}': {e}")
                await asyncio.sleep(1)
        print(f"ERROR: Failed to generate audio for '{hanzi}' (ID: {item_id})")
        return False

async def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    with open(VOCAB_FILE, "r", encoding="utf-8") as f:
        vocab = json.load(f)

    print(f"Generating native Chinese audio for {len(vocab)} vocabulary words...")
    semaphore = asyncio.Semaphore(5)
    tasks = [generate_item(semaphore, item, len(vocab), idx + 1) for idx, item in enumerate(vocab)]
    results = await asyncio.gather(*tasks)

    success_count = sum(1 for r in results if r)
    print(f"\nDone! Successfully generated {success_count}/{len(vocab)} audio files in {AUDIO_DIR}.")

if __name__ == "__main__":
    asyncio.run(main())

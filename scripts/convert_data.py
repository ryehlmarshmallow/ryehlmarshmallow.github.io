#!/usr/bin/env python3
"""
Convert data/vocabulary.csv to data/vocabulary.json for the static web app.
Preserves all fields including example sentences.
"""

import csv
import json
import os
import re

def parse_lesson_number(lesson_str: str) -> int:
    match = re.search(r'\d+', lesson_str)
    return int(match.group()) if match else 0

def convert_csv_to_json(csv_path: str, json_path: str):
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Input file not found: {csv_path}")

    vocab_list = []
    with open(csv_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            lesson_raw = row.get('Cột 1', '').strip()
            hanzi = row.get('Hán tự', '').strip()
            nghia = row.get('Nghĩa', '').strip()
            pinyin = row.get('Pinyin', '').strip()
            example = row.get('Ví dụ', '').strip()

            if not hanzi:
                continue

            lesson_num = parse_lesson_number(lesson_raw)
            lesson_name = f"Bài {lesson_num}" if lesson_num > 0 else lesson_raw

            vocab_list.append({
                "id": idx,
                "lesson": lesson_name,
                "lesson_num": lesson_num,
                "hanzi": hanzi,
                "pinyin": pinyin,
                "nghia": nghia,
                "example": example
            })

    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, mode='w', encoding='utf-8') as f:
        json.dump(vocab_list, f, ensure_ascii=False, indent=2)

    print(f"Successfully converted {len(vocab_list)} words to {json_path}")
    return vocab_list

if __name__ == "__main__":
    csv_file = "data/vocabulary.csv"
    json_file = "data/vocabulary.json"
    convert_csv_to_json(csv_file, json_file)

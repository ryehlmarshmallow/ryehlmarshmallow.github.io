#!/usr/bin/env python3
"""
Automated verification for the HSK Vocabulary & Writing Web App.
Validates dataset integrity, character stroke files, and static assets.
"""

import json
import os
import sys

def verify_dataset():
    print("[1/3] Verifying data/vocabulary.json...")
    path = "data/vocabulary.json"
    assert os.path.exists(path), f"File not found: {path}"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert len(data) == 319, f"Expected 319 vocabulary items, got {len(data)}"
    
    lesson_nums = set()
    for item in data:
        assert item.get("hanzi"), f"Missing hanzi in item: {item}"
        assert item.get("pinyin"), f"Missing pinyin in item: {item}"
        assert item.get("nghia"), f"Missing nghia in item: {item}"
        assert item.get("lesson"), f"Missing lesson in item: {item}"
        assert isinstance(item.get("lesson_num"), int) and item["lesson_num"] >= 1, f"Invalid lesson_num in item: {item}"
        assert "example" in item, f"Missing example field in item: {item}"
        lesson_nums.add(item["lesson_num"])

    assert lesson_nums == set(range(1, 16)), f"Expected lessons 1-15, got {lesson_nums}"
    
    b1_8_count = sum(1 for item in data if item["lesson_num"] <= 8)
    print(f"   ✓ {len(data)} vocabulary items valid across lessons 1 to 15 (Lessons 1-8: {b1_8_count} words).")

def verify_strokes():
    print("[2/3] Verifying stroke vector files...")
    with open("data/vocabulary.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    all_chars = {c for item in data for c in item["hanzi"] if "\u4e00" <= c <= "\u9fff"}
    b1_8_chars = {c for item in data if item["lesson_num"] <= 8 for c in item["hanzi"] if "\u4e00" <= c <= "\u9fff"}

    missing_all = [c for c in all_chars if not os.path.exists(f"data/strokes/{c}.json")]
    missing_b1_8 = [c for c in b1_8_chars if not os.path.exists(f"data/strokes/{c}.json")]

    assert len(missing_b1_8) == 0, f"Missing stroke files for Bài 1-8: {missing_b1_8}"
    assert len(missing_all) == 0, f"Missing stroke files for all lessons: {missing_all}"

    print(f"   ✓ All {len(all_chars)} unique Hanzi characters have local stroke data in data/strokes/.")

def verify_static_assets():
    print("[3/3] Verifying static web assets...")
    required_files = [
        "index.html",
        "css/style.css",
        "js/app.js",
        "js/hanzi-writer.min.js",
        "manifest.json",
        "sw.js",
        "icons/icon-192.svg",
        "server.py"
    ]
    for rf in required_files:
        assert os.path.exists(rf), f"Missing required file: {rf}"
        assert os.path.getsize(rf) > 0, f"File is empty: {rf}"

    print(f"   ✓ All {len(required_files)} static web assets present and non-empty.")

if __name__ == "__main__":
    try:
        verify_dataset()
        verify_strokes()
        verify_static_assets()
        print("\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!\n")
    except AssertionError as e:
        print(f"\n❌ Verification failed: {e}\n")
        sys.exit(1)

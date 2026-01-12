#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from typing import Any


DICT_PATH = "dict.yaml"
PLATFORM = "youtube_music"


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def fetch_search(api_key: str, artist: str, title: str) -> dict:
    query = f"{artist} {title}"
    params = {
        "part": "snippet",
        "type": "video",
        "maxResults": "25",
        "q": query,
        "key": api_key,
    }
    url = "https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "music-dict-ci",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    return json.loads(data)


def is_exact_match(artist: str, title: str, payload: dict) -> bool:
    items = payload.get("items", [])

    n_artist = norm(artist)
    n_title = norm(title)

    for item in items:
        snippet = item.get("snippet", {}) or {}
        t = norm(snippet.get("title", ""))
        channel = norm(snippet.get("channelTitle", ""))

        if n_title in t and (n_artist in t or n_artist in channel):
            return True

    return False


def parse_tracks(arg: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;\n]", arg) if t.strip()]


def load_dict(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
        if not content:
            return {}
        return json.loads(content)


def save_dict(path: str, data: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main() -> None:
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    artist = os.getenv("ARTIST", "").strip()
    tracks_raw = os.getenv("TRACKS", "")

    if not api_key:
        sys.stderr.write("YOUTUBE_API_KEY должен быть задан в env\n")
        sys.exit(1)

    if not artist or not tracks_raw.strip():
        sys.stderr.write("ARTIST и TRACKS должны быть заданы в env\n")
        sys.exit(1)

    tracks = parse_tracks(tracks_raw)
    if not tracks:
        sys.stderr.write("TRACKS пустой после парсинга\n")
        sys.exit(1)

    data: dict[str, Any] = load_dict(DICT_PATH)

    for title in tracks:
        try:
            payload = fetch_search(api_key, artist, title)
            found = is_exact_match(artist, title, payload)
            status: Any = 1 if found else 0
        except Exception as e:
            sys.stderr.write(f"[{PLATFORM}] error for '{title}': {e}\n")
            status = "unknown"

        if status not in (0, 1, "unknown"):
            status = "unknown"

        if title not in data:
            data[title] = {}
        entry = data[title]
        if not isinstance(entry, dict):
            entry = {}
            data[title] = entry
        entry[PLATFORM] = status

    save_dict(DICT_PATH, data)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import traceback
from typing import Any, Tuple, Optional


DICT_PATH = "dict.yaml"
PLATFORM = "apple_music"

_SPECIAL_SPLIT_RE = re.compile(r"[-–—\(\[\{\:\/]")


def norm_artist(s: str) -> str:
    return " ".join(s.lower().split())


def norm_title(s: str) -> str:
    if not s:
        return ""
    part = _SPECIAL_SPLIT_RE.split(s, 1)[0]
    return " ".join(part.lower().split())


def fetch_search(country: str, artist: str, title: str) -> dict:
    term = f"{artist} {title}"
    params = {
        "term": term,
        "media": "music",
        "entity": "song",
        "country": country,
        "limit": "50",
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://itunes.apple.com/search?{qs}"
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


def find_match(artist: str, title: str, payload: dict) -> Tuple[bool, Optional[str]]:
    results = payload.get("results", [])

    n_artist = norm_artist(artist)
    n_title = norm_title(title)

    for item in results:
        if norm_title(item.get("trackName", "")) != n_title:
            continue
        if norm_artist(item.get("artistName", "")) != n_artist:
            continue

        release_date = None
        rd = item.get("releaseDate")
        if isinstance(rd, str) and rd:
            release_date = rd.split("T", 1)[0]

        return True, release_date

    return False, None


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
    artist = os.getenv("ARTIST", "").strip()
    tracks_raw = os.getenv("TRACKS", "")
    country = os.getenv("APPLE_COUNTRY", "US").strip() or "US"

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
            payload = fetch_search(country, artist, title)
            found, rd = find_match(artist, title, payload)
            if found:
                status: Any = 1
                release_date: Optional[str] = rd
            else:
                status = 0
                release_date = None
        except Exception as e:
            sys.stderr.write(f"[{PLATFORM}] error for '{title}': {e}\n")
            traceback.print_exc()
            status = "unknown"
            release_date = None

        if status not in (0, 1, "unknown"):
            status = "unknown"

        track_entry = data.get(title)
        if not isinstance(track_entry, dict):
            track_entry = {}
            data[title] = track_entry

        platform_entry = track_entry.get(PLATFORM)
        if not isinstance(platform_entry, dict):
            platform_entry = {}
            track_entry[PLATFORM] = platform_entry

        platform_entry["status"] = status
        platform_entry["release_date"] = release_date

    save_dict(DICT_PATH, data)


if __name__ == "__main__":
    main()

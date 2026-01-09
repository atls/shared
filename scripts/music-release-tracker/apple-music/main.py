#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.parse
import urllib.request


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def fetch_search(country: str, artist: str, title: str) -> dict:
    term = f"{artist} {title}"
    q = urllib.parse.quote(term)
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


def is_exact_match(artist: str, title: str, payload: dict) -> bool:
    results = payload.get("results", [])

    n_artist = norm(artist)
    n_title = norm(title)

    for item in results:
        if norm(item.get("trackName", "")) != n_title:
            continue
        if norm(item.get("artistName", "")) != n_artist:
            continue
        return True

    return False


def build_dict(country: str, artist: str, tracks: list[str]) -> dict:
    result = {"apple_music": {}}

    for title in tracks:
        try:
            payload = fetch_search(country, artist, title)
            found = is_exact_match(artist, title, payload)
        except Exception:
            found = False
        result["apple_music"][title] = [1 if found else 0]

    return result


def to_yaml(data: dict) -> str:
    lines = []
    for platform, mapping in data.items():
        lines.append(f"{platform}:")
        for track_name, value in mapping.items():
            safe = track_name.replace('"', '\\"')
            lines.append(f'  "{safe}": [{value[0]}]')
    return "\n".join(lines)


def parse_tracks(arg: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;\n]", arg) if t.strip()]


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

    data = build_dict(country, artist, tracks)
    yaml_str = to_yaml(data)

    with open("apple_music_dict.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_str)


if __name__ == "__main__":
    main()

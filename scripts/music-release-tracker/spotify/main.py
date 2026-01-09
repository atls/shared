#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.parse
import urllib.request


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def fetch_search(token: str, artist: str, title: str) -> dict:
    query = f'track:"{title}" artist:"{artist}"'
    q = urllib.parse.quote(query)
    url = f"https://api.spotify.com/v1/search?type=track&limit=50&q={q}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "music-dict-ci",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    return json.loads(data)


def is_exact_match(artist: str, title: str, payload: dict) -> bool:
    tracks = payload.get("tracks", {}).get("items", [])

    n_artist = norm(artist)
    n_title = norm(title)

    for track in tracks:
        if norm(track.get("name", "")) != n_title:
            continue
        artists = [norm(a.get("name", "")) for a in track.get("artists", [])]
        if n_artist not in artists:
            continue
        return True

    return False


def build_dict(token: str, artist: str, tracks: list[str]) -> dict:
    result = {"spotify": {}}
    for title in tracks:
        try:
            payload = fetch_search(token, artist, title)
            found = is_exact_match(artist, title, payload)
        except Exception:
            found = False
        result["spotify"][title] = [1 if found else 0]
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
    token = os.getenv("SPOTIFY_TOKEN", "").strip()
    artist = os.getenv("ARTIST", "").strip()
    tracks_raw = os.getenv("TRACKS", "")

    if not token:
        sys.stderr.write("SPOTIFY_TOKEN должен быть задан в env\n")
        sys.exit(1)

    if not artist or not tracks_raw.strip():
        sys.stderr.write("ARTIST и TRACKS должны быть заданы в env\n")
        sys.exit(1)

    tracks = parse_tracks(tracks_raw)
    if not tracks:
        sys.stderr.write("TRACKS пустой после парсинга\n")
        sys.exit(1)

    data = build_dict(token, artist, tracks)
    yaml_str = to_yaml(data)

    with open("spotify_dict.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_str)


if __name__ == "__main__":
    main()

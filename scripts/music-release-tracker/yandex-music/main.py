#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.parse
import urllib.request


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def fetch_search(artist: str, title: str) -> dict:
    query = urllib.parse.quote_plus(f"{artist} {title}")
    url = f"https://api.music.yandex.net/search?type=track&text={query}&page=0&nococrrect=false"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    return json.loads(data)


def is_exact_match(artist: str, title: str, payload: dict) -> bool:
    tracks = (
        payload.get("result", {})
        .get("tracks", {})
        .get("results", [])
    )

    n_artist = norm(artist)
    n_title = norm(title)

    for track in tracks:
        if norm(track.get("title", "")) != n_title:
            continue
        artists = [norm(a.get("name", "")) for a in track.get("artists", [])]
        if n_artist not in artists:
            continue
        return True

    return False


def build_dict(artist: str, tracks: list[str]) -> dict:
    result = {"yandex_music": {}}
    for idx, title in enumerate(tracks):
        payload = fetch_search(artist, title)
        tracks_list = (
            payload.get("result", {})
            .get("tracks", {})
            .get("results", [])
        )

        sys.stderr.write(
            f"[yandex] '{title}': got {len(tracks_list)} candidates\n"
        )

        found = is_exact_match(artist, title, payload)
        result["yandex_music"][title] = [1 if found else 0]
    return result


def to_yaml(data: dict) -> str:
    lines = []
    for platform, mapping in data.items():
        lines.append(f"{platform}:")
        for track_name, value in mapping.items():
            safe = track_name.replace('"', '\\"')
            lines.append(f'  "{safe}": [{value[0]}]')
    return "\n".join(lines)


def parse_tracks_arg(arg: str) -> list[str]:
    return [t.strip() for t in re.split(r"[;\n]", arg) if t.strip()]


def main() -> None:
    artist = os.getenv("ARTIST", "").strip()
    tracks_raw = os.getenv("TRACKS", "")

    if not artist or not tracks_raw.strip():
        sys.stderr.write("ARTIST и TRACKS должны быть заданы в env\n")
        sys.exit(1)

    tracks = parse_tracks_arg(tracks_raw)

    if not tracks:
        sys.stderr.write("TRACKS пустой после парсинга\n")
        sys.exit(1)

    data = build_dict(artist, tracks)
    yaml_str = to_yaml(data)

    with open("yandex_dict.yaml", "w", encoding="utf-8") as f:
        f.write(yaml_str)


if __name__ == "__main__":
    main()

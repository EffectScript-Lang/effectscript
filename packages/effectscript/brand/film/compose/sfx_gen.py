"""Generate the Foley source library with ElevenLabs Sound Effects v2 (via fal).

Each asset is recorded in sfx/library.json with its prompt, settings and
request outcome. sfx.py slices and places these sources on picture events.
Requires FAL_KEY in the environment. Existing assets are skipped."""

import json
import os
import sys
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / "sfx"
ENDPOINT = "https://fal.run/fal-ai/elevenlabs/sound-effects/v2"

ASSETS = {
    "keys-a": (
        "Close-mic studio recording of slow, deliberate typing on a premium mechanical keyboard with tactile switches: individual keystrokes clearly separated by short gaps, soft deep thock, crisp but not clicky, wooden desk, quiet room, no music, no voices",
        10,
    ),
    "keys-b": (
        "Close-mic recording of someone typing a sentence on a high-end mechanical keyboard with lubed linear switches, creamy muted thocks, each key distinct, natural human rhythm, intimate dry room, no music",
        10,
    ),
    "spacebar": (
        "Close-mic recording of a mechanical keyboard spacebar pressed six times slowly, deep hollow thock with a subtle stabiliser rattle, gaps between presses, dry room",
        6,
    ),
    "enter": ("A single firm press of the Enter key on a mechanical keyboard, deep satisfying thock, close-mic, dry", 1.5),
    "stamp": (
        "One loud heavy impact: a thick hardcover book slammed down hard onto a solid wooden desk, deep punchy thud with a sharp papery slap on top, close microphone, short room tail",
        1.5,
    ),
    "whoosh": ("A single fast smooth air whoosh passing close by left to right, clean cinematic transition, no tone, short tail", 1.2),
    "longwhoosh": (
        "A slow wide airy whoosh that swells and pulls away into the distance, like a camera rapidly pulling back, soft low rumble underneath, cinematic, no music",
        3.8,
    ),
    "swish": ("A very short soft air swish, subtle and quick, like a card sliding past the microphone", 0.6),
    "buzz": ("A smartphone vibrating twice on a wooden bedside table at night, two short buzzes with light rattle, quiet room", 1.5),
    "glitch": ("Short harsh digital glitch bursts and data corruption crackles, stuttering, electronic, dry", 3),
    "paper": (
        "Hundreds of paper sheets sliding off a tall stack and fluttering to the floor in a small office, rustling avalanche of paper, close perspective",
        3,
    ),
    "cables": (
        "Thick cables and ropes straining and creaking under tension, low groaning stretch, slow tightening knots, dark cavernous space, no music",
        14,
    ),
    "rain": ("Soft steady rain on a large window at night, heard from inside a quiet apartment, distant city hum, intimate, calm", 6),
    "error": ("A soft muted low error buzz from a computer terminal, short, subtle, dry", 0.8),
    "retry": ("A soft subtle digital blip, short soft click-tone, minimal user interface sound, dry", 0.6),
}


def write_wav(path, pcm, sr=48000):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)


def generate(name, text, seconds, record):
    out = LIB / f"{name}.wav"
    if out.exists():
        return name, "exists"
    body = {"text": text, "duration_seconds": seconds, "prompt_influence": 0.55, "output_format": "pcm_48000"}
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Key {os.environ['FAL_KEY']}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        res = json.load(r)
    url = res["audio"]["url"]
    data = urllib.request.urlopen(url, timeout=180).read()
    if data[:4] == b"RIFF":
        out.write_bytes(data)
        kind = "wav"
    else:
        write_wav(out, data)  # raw s16le mono 48 kHz
        kind = "raw pcm"
    record[name] = {**body, "url": url, "bytes": len(data), "container": kind}
    return name, f"ok ({kind}, {len(data)} bytes)"


def main():
    LIB.mkdir(parents=True, exist_ok=True)
    manifest = LIB / "library.json"
    record = json.loads(manifest.read_text()) if manifest.exists() else {}
    names = sys.argv[1:] or list(ASSETS)
    with ThreadPoolExecutor(6) as ex:
        for name, status in ex.map(lambda n: generate(n, *ASSETS[n], record), names):
            print(f"{name:12s} {status}")
    manifest.write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()

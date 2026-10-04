"""Local timeline editor for the film.

  film/editor/run.sh            → http://localhost:4747

Serves the editor page, renders any frame of an (unsaved) edit with the real
compositor, saves film/timeline.json, and runs a full preview render (picture,
Foley, narration, music, mux) in the background."""

import io
import json
import os
import signal
import subprocess
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

os.environ["PREVIEW"] = "1"  # 1080p plates and frames; the editor never needs 4K
HERE = Path(__file__).resolve().parent
FILM = HERE.parent
COMPOSE = FILM / "compose"
sys.path.insert(0, str(COMPOSE))

import numpy as np  # noqa: E402
import skia  # noqa: E402

import lib  # noqa: E402
import scenes  # noqa: E402
import timeline  # noqa: E402

PORT = int(os.environ.get("PORT", "4747"))
BUILD = FILM / "build"
VO_DIR = next(iter(sorted((BUILD / "audio-in").glob("ElevenLabs_*"))), None)
LOCK = threading.Lock()
RENDER = {"state": "idle", "log": [], "started": None, "finished": None, "file": None}

# Suno's drums-in downbeat after the 120 BPM stretch (music.py prints it); the
# editor only uses it to show where the song enters.
SUNO_DOWNBEAT = 32.558

MUSIC_ANCHORS = [
    ("Suno enters", None),
    ("Drums on the tangle", 40.0),
    ("Dead stop", 54.0),
    ("Question swell", 56.0),
    ("Impact · groove", 70.0),
    ("3 AM drop", 126.0),
    ("Finale", 144.0),
    ("Last piano note", 156.0),
]


def voice_durations():
    """Spoken length of each narration clip (silence trimmed like vo.py does)."""
    if not VO_DIR:
        return {}
    out = {}
    for p in VO_DIR.glob("*_Chapter_*.wav"):
        with wave.open(str(p)) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32)
            sr = w.getframerate()
        env = np.abs(x)
        on = np.nonzero(env > env.max() * 10 ** (-45 / 20))[0]
        n = (on[-1] - on[0]) if len(on) else len(x)
        out[int(p.name.split("_")[0])] = round(n / sr + 0.05, 3)
    return out


VOICE_DUR = voice_durations()


def frame_jpeg(edit, t, width=960):
    with LOCK:
        timeline.use(edit)
        try:
            w, h = width, round(width * 9 / 16)
            surf = skia.Surface(w, h)
            c = surf.getCanvas()
            c.clear(lib.INK)
            c.scale(w / lib.W, h / lib.H)
            lib.FX["flash"] = 0.0
            scenes.draw(c, timeline.EDIT.to_src(t))
            fl = min(lib.FX["flash"], 1.0)
            if fl > 0.002:
                c.resetMatrix()
                c.drawRect(skia.Rect.MakeWH(w, h), skia.Paint(Color=skia.ColorWHITE, Alphaf=fl * 0.85))
            return surf.makeImageSnapshot().encodeToData(skia.kJPEG, 82).bytes()
        finally:
            timeline.EDIT = timeline.load()


def run_preview(edit):
    RENDER.update(state="running", log=[], started=time.time(), finished=None, file=None)
    timeline.save(edit)
    out = BUILD / "deliver" / "preview-edit-1080p.mp4"
    steps = [
        ("picture", f"PREVIEW=1 ./run.sh video --workers {max(2, (os.cpu_count() or 8) - 4)}"),
        ("foley", "./py.sh sfx.py"),
        ("narration", "./py.sh vo.py"),
        ("music", "./py.sh music.py"),
        (
            "mix",
            "cd ../build && ffmpeg -y -loglevel error -i music.wav -i duck.wav -i sfx.wav -i vo.wav -filter_complex "
            "'[0:a][1:a]amultiply[m];[2:a]volume=0.8[f];[3:a]volume=1.0[v];[m][f][v]amix=inputs=3:normalize=0:duration=first,"
            "volume=2dB,alimiter=limit=0.891:level=false' -c:a pcm_s24le mix.wav && "
            f"ffmpeg -y -loglevel error -i picture-sdr.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k "
            f"-movflags +faststart -shortest '{out}'",
        ),
    ]
    for name, cmd in steps:
        RENDER["log"].append(f"{time.strftime('%H:%M:%S')} {name}…")
        p = subprocess.run(cmd, shell=True, cwd=COMPOSE, capture_output=True, text=True)
        if p.returncode:
            RENDER["log"].append((p.stdout + p.stderr)[-1500:])
            RENDER.update(state="failed", finished=time.time())
            return
    RENDER["log"].append(f"{time.strftime('%H:%M:%S')} done")
    RENDER.update(state="done", finished=time.time(), file="/media/preview-edit-1080p.mp4")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def file(self, path, ctype):
        if not path.exists():
            return self.send(404, {"error": "not found"})
        data = path.read_bytes()
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            a = int(a)
            b = int(b) if b else len(data) - 1
            return self.send(206, data[a : b + 1], ctype, {"Content-Range": f"bytes {a}-{b}/{len(data)}", "Accept-Ranges": "bytes"})
        self.send(200, data, ctype, {"Accept-Ranges": "bytes"})

    def body(self):
        n = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path in ("/", "/index.html"):
            return self.file(HERE / "index.html", "text/html; charset=utf-8")
        if path == "/api/timeline":
            edit = timeline.load()
            return self.send(
                200,
                {
                    "edit": edit.data,
                    "authored": timeline.authored(),
                    "voiceDur": VOICE_DUR,
                    "music": [{"label": l, "src": s} for l, s in MUSIC_ANCHORS],
                    "sunoDownbeat": SUNO_DOWNBEAT,
                    "saved": timeline.PATH.exists(),
                },
            )
        if path == "/api/render":
            return self.send(200, RENDER)
        if path.startswith("/media/"):
            return self.file(BUILD / "deliver" / Path(path).name, "video/mp4")
        if path.startswith("/voice/"):
            n = Path(path).stem
            return self.file(VO_DIR / f"{n}_Chapter_1.wav", "audio/wav") if VO_DIR else self.send(404, {})
        if path.startswith("/fonts/"):
            return self.file(FILM.parent / "fonts" / Path(path).name, "font/otf")
        self.send(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.body()
            if path == "/api/frame":
                return self.send(200, frame_jpeg(timeline.validate(data["edit"]), float(data["t"]), int(data.get("w", 960))), "image/jpeg")
            if path == "/api/timeline":
                timeline.save(data)
                return self.send(200, {"ok": True})
            if path == "/api/render":
                if RENDER["state"] == "running":
                    return self.send(409, {"error": "a render is already running"})
                timeline.validate(data)
                threading.Thread(target=run_preview, args=(data,), daemon=True).start()
                return self.send(200, {"ok": True})
        except Exception as exc:  # report validation and render errors to the page
            return self.send(400, {"error": str(exc)})
        self.send(404, {"error": "not found"})


if __name__ == "__main__":
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(f"port {PORT} is busy: is the editor already running? (or use another port: PORT=4848 {HERE / 'run.sh'})")
    def stop(*_):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)  # a plain `kill` stops it as cleanly as Ctrl-C
    print(f"editor on http://localhost:{PORT}  (Ctrl-C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\neditor stopped", flush=True)
    finally:
        server.server_close()

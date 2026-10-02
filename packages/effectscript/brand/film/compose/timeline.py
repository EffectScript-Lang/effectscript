"""The edit: the film as an ordered list of blocks plus the narration lines.

Scenes are authored in *source* time (the original 160 s cut in scenes.py).
The edit gives each block a duration; `to_src` maps an edited film time to the
source time the scenes should draw, and `to_edit` maps source-time cues (Foley
events, music anchors) onto the edited film. Blocks that get longer play
slower; blocks that get shorter play faster. Everything inside a block —
text, camera moves, Foley — stays in sync with it.

The edit lives in film/timeline.json, written by the editor (film/editor).
Without that file the film plays as authored."""

import bisect
import csv
import json
from pathlib import Path

FILM = Path(__file__).resolve().parent.parent
PATH = FILM / "timeline.json"

# (id, source start, source end, track label) in film order
BLOCKS = [
    ("cold-idea", 0.0, 6.2, "Cold open · // every idea starts as one line"),
    ("cold-line", 6.2, 12.0, "Cold open · getUser(id), push into the screen"),
    ("night-desk", 12.0, 16.0, "Photo · night desk · You found Effect."),
    ("hands", 16.0, 24.0, "Photo · hands · the four superpowers"),
    ("superpower", 24.0, 28.0, "Light field · It felt like a superpower."),
    ("wrote", 28.0, 30.0, "Card · Then you wrote it down."),
    ("typing", 30.0, 34.5, "Ceremony · the code types itself"),
    ("code-wall", 34.5, 38.0, "Ceremony · the code wall"),
    ("paper", 38.0, 40.0, "3D · paper avalanche"),
    ("tangle", 40.0, 46.0, "3D · cable tangle · You wanted reliability."),
    ("wirehall", 46.0, 49.5, "3D · wire cathedral · You got ceremony."),
    ("climax", 49.5, 54.0, "3D · tangle climax and strobe"),
    ("silence", 54.0, 55.0, "Silence"),
    ("thread", 55.0, 61.0, "3D · thread · What if the language just understood?"),
    ("converge", 61.0, 68.0, "3D · the tangle converges into one line"),
    ("monolith", 68.0, 76.2, "3D · monolith reveal · Introducing"),
    ("lockup", 76.2, 80.0, "Lockup · TypeScript with Effect built in"),
    ("f1", 80.0, 86.0, "Code · 01 effect functions"),
    ("f2", 86.0, 92.0, "Code · 02 typed errors"),
    ("f3", 92.0, 98.0, "Code · 03 try / catch"),
    ("f4", 98.0, 104.0, "Code · 04 pipelines"),
    ("f5", 104.0, 112.0, "Code · 05 services"),
    ("f6", 112.0, 117.0, "Code · 06 resources"),
    ("f7", 117.0, 122.0, "Code · 07 match"),
    ("terminal", 122.0, 126.0, "Terminal · efx build"),
    ("phone", 126.0, 131.0, "Photo · 3:07 AM"),
    ("log", 131.0, 137.0, "Retry log · your code already knew"),
    ("dawn", 137.0, 144.0, "Photo · dawn · You slept through it."),
    ("hero", 144.0, 151.8, "3D · hero · All of Effect. None of the ceremony."),
    ("plain", 151.8, 154.0, "3D · salt plain"),
    ("end", 154.0, 160.0, "End card · npm i effectscript"),
]


def authored():
    """The edit as authored: every block at its source length, voice from the cue sheet."""
    voice = []
    for i, r in enumerate(csv.DictReader(open(FILM / "prompts" / "voiceover-script.csv"))):
        voice.append({"id": i + 1, "line": r["line"], "start": float(r["start_time"])})
    return {
        "version": 1,
        "fps": 30,
        "blocks": [{"id": b, "src": [a, z], "dur": round(z - a, 3), "label": lab} for b, a, z, lab in BLOCKS],
        "voice": voice,
    }


class Edit:
    def __init__(self, data):
        self.data = data
        self.blocks = data["blocks"]
        self.starts = [0.0]
        for b in self.blocks:
            self.starts.append(self.starts[-1] + max(0.05, float(b["dur"])))
        self.src_starts = [b["src"][0] for b in self.blocks]

    @property
    def total(self):
        return self.starts[-1]

    def to_src(self, t):
        """Edited film time → source time."""
        i = max(0, min(len(self.blocks) - 1, bisect.bisect_right(self.starts, t) - 1))
        b = self.blocks[i]
        a, z = b["src"]
        u = (t - self.starts[i]) / (self.starts[i + 1] - self.starts[i])
        return a + u * (z - a)

    def to_edit(self, s):
        """Source time → edited film time."""
        i = max(0, min(len(self.blocks) - 1, bisect.bisect_right(self.src_starts, s) - 1))
        b = self.blocks[i]
        a, z = b["src"]
        u = (s - a) / (z - a)
        return self.starts[i] + u * (self.starts[i + 1] - self.starts[i])

    def speed(self, t):
        """Source seconds per edited second at film time t (1.0 = as authored)."""
        i = max(0, min(len(self.blocks) - 1, bisect.bisect_right(self.starts, t) - 1))
        a, z = self.blocks[i]["src"]
        return (z - a) / (self.starts[i + 1] - self.starts[i])

    def voice(self):
        return self.data.get("voice", [])


def validate(data):
    ids = [b["id"] for b in data["blocks"]]
    known = [b[0] for b in BLOCKS]
    if sorted(ids) != sorted(known):
        raise ValueError("blocks must be exactly the authored set")
    for b in data["blocks"]:
        if not (0.2 <= float(b["dur"]) <= 60):
            raise ValueError(f"{b['id']}: duration out of range")
    return data


def load():
    if PATH.exists():
        return Edit(validate(json.loads(PATH.read_text())))
    return Edit(authored())


def save(data):
    PATH.write_text(json.dumps(validate(data), indent=1) + "\n")


EDIT = load()


def use(data):
    """Swap in an unsaved edit (the editor's live preview)."""
    global EDIT
    EDIT = Edit(validate(data))
    return EDIT

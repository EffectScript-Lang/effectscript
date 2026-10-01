"""Every frame of the film as a function of time.

`draw(canvas, t)` paints the frame at film time t (seconds). Acts are plain
functions over local time; their timings mirror TREATMENT.md and the score's
cue sheet. `EVENTS` lists the picture events (keystrokes, stamps, blips) that
sfx.py turns into sound, so picture and Foley can never drift apart."""

import bisect
import math
from functools import cache
from pathlib import Path

import skia

from lib import (
    BODY,
    BODY_MED,
    CEREMONY,
    DISPLAY,
    DISPLAY_SEMI,
    FPS,
    H,
    INK,
    LINE,
    MONO,
    MONO_MED,
    MUTED,
    REPO,
    SCALE,
    SUBTLE,
    TILE,
    WHITE,
    Z300,
    W,
    Morph,
    argb,
    blender_frame,
    caret,
    clamp,
    code_size,
    draw_code,
    draw_frame,
    draw_lockup,
    ease_in,
    ease_in_out,
    ease_out,
    fill,
    flash,
    grid,
    hash01,
    kenburns,
    label,
    lerp,
    light_field,
    lockup,
    mark_paths,
    mono,
    mono_advance,
    paint,
    phase,
    plate,
    radial_glow,
    smooth,
    text,
    tilt,
    text_width,
    window,
    window_panel,
)

EVENTS = []  # (time, kind, strength)


def event(t, kind, strength=1.0):
    EVENTS.append((round(t, 4), kind, strength))


# ---------------------------------------------------------------- typing


class Typing:
    """Human-feeling keystroke times for `s`, starting at t0 at `cps`."""

    def __init__(self, s, t0, cps, kind="key", jitter=0.45, strength=1.0, sound=True):
        self.s, self.times = s, []
        t = t0
        for i, ch in enumerate(s):
            self.times.append(t)
            k = 1 + jitter * (hash01(i, len(s), t0) - 0.5) * 2
            if ch == " ":
                k *= 1.35
            t += k / cps
        self.end = t
        if sound:
            for i, tt in enumerate(self.times):
                event(tt, "space" if s[i] == " " else kind, strength)

    def count(self, t):
        return bisect.bisect_right(self.times, t)

    def text(self, t):
        return self.s[: self.count(t)]


class Backspace:
    def __init__(self, n, t0, cps):
        self.n, self.t0, self.cps = n, t0, cps
        for i in range(n):
            event(t0 + i / cps, "key", 0.6)

    def left(self, t):
        return self.n - clamp(int((t - self.t0) * self.cps) + 1 if t >= self.t0 else 0, 0, self.n)


def beat(t, start=0.0, period=0.5):
    """0..1 envelope that peaks on every beat and decays."""
    if t < start:
        return 0.0
    return math.exp(-((t - start) % period) * 7.0)


# ---------------------------------------------------------------- snippets

FIXTURES = REPO / "packages" / "effectscript" / "core" / "test" / "fixtures"

CEREMONY_CODE = """import { Context, Effect, Layer, Schema } from "effect"

class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound", { id: Schema.String }
) {}

class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String
}) {}

export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
  list(): Effect.Effect<ReadonlyArray<User>>
}>()("app/Users") {
  static readonly layer = Layer.effect(Users, Effect.gen(function*() {
    const cache = new Map<string, User>()
    yield* Effect.addFinalizer(() => Effect.log("released"))
    return Users.of({
      find: Effect.fn("Users.find")(function*(id: string) {
        return cache.get(id) ?? (yield* new UserNotFound({ id }))
      }),
      list: Effect.fnUntraced(function*() {
        return [...cache.values()]
      })
    })
  })).pipe(Layer.provide(SqlLive))

  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly list = () => Users.use((_) => _.list())
}

export const getUser = Effect.fn("getUser")(
  function*(id: string): Effect.fn.Return<User, UserNotFound> {
    return yield* Users.find(id)
  },
  Effect.retry({ times: 3 })
)"""

FEATURES = [
    dict(
        t=80.0,
        d=6.0,
        n="01",
        name="EFFECT FUNCTIONS",
        tabs=("users.ts", "users.efx"),
        caption="An effect is a function. await is yield*.",
        a='''import { Effect } from "effect"

export const getUser = Effect.fn("getUser")(
  function*(id: UserId): Effect.fn.Return<User, UserNotFound> {
    const users = yield* Users
    return yield* users.find(id)
  },
  Effect.retry({ times: 3 })
)''',
        b="""export effect getUser(id: UserId): User throws UserNotFound {
  const users = await Users
  return await users.find(id)
} |> retry({ times: 3 })""",
    ),
    dict(
        t=86.0,
        d=6.0,
        n="02",
        name="TYPED ERRORS",
        tabs=("errors.ts", "errors.efx"),
        caption="Errors live in the signature. throw means fail.",
        a='''import { Effect, Schema } from "effect"

class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound", { id: Schema.String }
) {}

const find = Effect.fn("find")(
  function*(id: string): Effect.fn.Return<User, UserNotFound> {
    if (!id) return yield* new UserNotFound({ id })
    return yield* db.get(id)
  }
)''',
        b="""error UserNotFound { id: string }

effect find(id: string): User throws UserNotFound {
  if (!id) throw new UserNotFound({ id })
  return await db.get(id)
}""",
    ),
    dict(
        t=92.0,
        d=6.0,
        n="03",
        name="TRY / CATCH",
        tabs=("load.ts", "load.efx"),
        caption="Catch by type. What you don't handle stays in the type.",
        a="""const load = Effect.fn("load")(function*(id: string) {
  return yield* Effect.gen(function*() {
    return yield* fetchUser(id)
  }).pipe(Effect.catchTags({
    NotFound: (e) => Effect.gen(function*() {
      return "missing"
    }),
    Timeout: (e) => Effect.gen(function*() {
      return "slow"
    })
  }))
})""",
        b="""effect load(id: string) {
  try {
    return await fetchUser(id)
  } catch (e: NotFound) {
    return "missing"
  } catch (e: Timeout) {
    return "slow"
  }
}""",
    ),
    dict(
        t=98.0,
        d=6.0,
        n="04",
        name="PIPELINES",
        tabs=("program.ts", "program.efx"),
        caption="Behaviour reads left to right.",
        a="""const program = Effect.gen(function*() {
  return yield* loadUser(id)
}).pipe(
  Effect.retry({ times: 3 }),
  Effect.timeout("1 second"),
  Effect.orElseSucceed(() => "anonymous")
)""",
        b="""const program = effect {
  return await loadUser(id)
} |> retry({ times: 3 })
  |> timeout("1 second")
  |> orElseSucceed(() => "anonymous")""",
    ),
    dict(
        t=104.0,
        d=8.0,
        n="05",
        name="SERVICES",
        tabs=("users.ts", "users.efx"),
        caption="Dependency injection, without the incantation.",
        a="""export class Users extends Context.Service<Users, {
  find(id: string): Effect.Effect<User, UserNotFound>
  list(): Effect.Effect<ReadonlyArray<User>>
}>()("app/Users") {
  static readonly layer = Layer.effect(Users, Effect.gen(function*() {
    const cache = new Map<string, User>()
    yield* Effect.addFinalizer(() => Effect.log("released"))
    return Users.of({
      find: Effect.fn("Users.find")(function*(id: string) {
        return cache.get(id) ?? (yield* new UserNotFound({ id }))
      }),
      list: Effect.fnUntraced(function*() {
        return [...cache.values()]
      })
    })
  })).pipe(Layer.provide(SqlLive))

  static readonly find = (id: string) => Users.use((_) => _.find(id))
  static readonly list = () => Users.use((_) => _.list())
}""",
        b="""export service Users {
  effect find(id: string): User throws UserNotFound
  effect list(): ReadonlyArray<User>

  layer = effect {
    const cache = new Map<string, User>()
    defer Effect.log("released")
    return {
      effect find(id: string) {
        return cache.get(id) ?? throw new UserNotFound({ id })
      },
      list: effect () => [...cache.values()]
    }
  } |> provide(SqlLive)
}""",
    ),
    dict(
        t=112.0,
        d=5.0,
        n="06",
        name="RESOURCES",
        tabs=("file.ts", "file.efx"),
        caption="Cleanup you can't forget.",
        a="""export const useResource = Effect.fn("useResource")(function*() {
  const handle = yield* acquire
  yield* Effect.addFinalizer(() => handle.close)
  yield* Effect.addFinalizer(() => Effect.sync(() => {
    console.info("cleanup")
  }))
  return yield* handle.read()
}, Effect.scoped)""",
        b="""export effect useResource() {
  using handle = await acquire
  defer handle.close
  defer { console.info("cleanup") }
  return await handle.read()
}""",
    ),
    dict(
        t=117.0,
        d=5.0,
        n="07",
        name="MATCH",
        tabs=("shape.ts", "shape.efx"),
        caption="Schemas and pattern matching, built in.",
        a="""class Circle extends Schema.TaggedClass<Circle>()("Circle", { radius: Schema.Number }) {}
class Square extends Schema.TaggedClass<Square>()("Square", { side: Schema.Number }) {}
const Shape = Schema.Union([Circle, Square])
type Shape = typeof Shape.Type

export const area = Match.valueTags(shape, {
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Square: ({ side }) => side ** 2
})""",
        b="""schema Shape =
  | Circle { radius: number }
  | Square { side: number }

export const area = match (shape) {
  when Circle({ radius }): Math.PI * radius ** 2
  when Square({ side }): side ** 2
}""",
    ),
]

STAMPS = [
    "yield*",
    "Effect.gen(function*() {",
    "}).pipe(",
    "Layer.effect(",
    "Context.Service<",
    "Schema.TaggedError<",
    "Effect.fn.Return<",
    "Effect.catchTags({",
    "Effect.addFinalizer(() =>",
    "Effect.scoped",
    "Layer.provide(",
    "Match.valueTags(",
    "Users.use((_) =>",
    "yield*",
    "function*",
    "Effect.fnUntraced(",
    "Schema.String",
    "yield*",
]


@cache
def wall_snippets():
    out = []
    for p in sorted(FIXTURES.glob("*/*.ts")):
        lines = [ln for ln in p.read_text().split("\n") if ln.strip() and not ln.startswith("declare")]
        if len(lines) >= 8:
            out.append("\n".join(lines[:30]))
    return out


# ---------------------------------------------------------------- 0–12 cold open

T_IDEA = Typing("// every idea starts as one line", 1.6, 15)
BS_IDEA = Backspace(len(T_IDEA.s), 5.0, 34)
T_LINE = Typing("getUser(id)", 6.3, 8.5)


def cold_open(c, t):
    fill(c)
    size = 46
    y = H / 2 + 16
    if t < 6.2:
        n = T_IDEA.count(t)
        if t >= BS_IDEA.t0:
            n = min(n, BS_IDEA.left(t))
        s = T_IDEA.s[:n]
        w = text_width(T_IDEA.s, size, MONO)
        x = W / 2 - w / 2
        text(c, s, x, y, size, MONO, MUTED)
        cx = x + text_width(s, size, MONO) + 4 if s else x
        caret(c, cx, y, size, t, alpha=window(t, 0.4, 7, 0.6, 0), solid=t > 1.55 and t < T_IDEA.end + 0.1)
        return
    s = T_LINE.text(t)
    w = text_width(T_LINE.s, size, MONO)
    x = W / 2 - w / 2
    # 8.5: the first piano note — the line breathes
    glow = math.exp(-max(0, t - 8.5) * 1.2) * (t >= 8.5) * 0.9
    push = ease_in(phase(t, 10.0, 12.0), 3)
    c.save()
    c.translate(W / 2, y - size * 0.35)
    k = 1 + push * 18
    c.scale(k, k)
    c.translate(-W / 2, -(y - size * 0.35))
    text(c, s, x, y, size, MONO, WHITE, glow=glow + push * 2, blur=push * 3)
    c.restore()
    if t < 10.2:
        caret(c, x + text_width(s, size, MONO) + 4, y, size, t, solid=t < T_LINE.end + 0.1)
    flash(c, ease_in(phase(t, 11.0, 12.0), 2) * 0.85)


# ---------------------------------------------------------------- 12–30 the promise

PROMISES = [
    ("Typed errors.", "Effect<User, UserNotFound>"),
    ("Retries.", "Effect.retry(policy)"),
    ("Resources that never leak.", "Effect.acquireRelease(open, close)"),
    ("Concurrency that just works.", "Effect.all(tasks, { concurrency: 8 })"),
]


def promise(c, t):
    fill(c)
    if t < 16.0:
        x = phase(t, 11.0, 16.6)
        kenburns(c, plate("night-desk"), ease_out(x, 2), 3.4, 1.06, (0.885, 0.43), (0.62, 0.5))
        flash(c, (1 - smooth(phase(t, 12.0, 13.2))) * 0.85)
        # left-side shade for legibility
        sh = skia.GradientShader.MakeLinear(
            [skia.Point(0, 0), skia.Point(W * 0.6, 0)], [argb(INK, 0.55), argb(INK, 0.0)], [0.0, 1.0]
        )
        c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=sh))
        a = window(t, 12.8, 15.75, 0.01, 0.35)
        text(c, "You found Effect.", 150, 600, 104, gradient=True, alpha=a, reveal=phase(t, 12.8, 14.0))
        return
    if t < 24.0:
        kenburns(c, plate("hands"), phase(t, 16, 24), 1.12, 1.0, (0.45, 0.6), (0.52, 0.55), exposure=0.9)
        sh = skia.GradientShader.MakeLinear(
            [skia.Point(0, 0), skia.Point(W * 0.75, 0)], [argb(INK, 0.82), argb(INK, 0.0)], [0.0, 1.0]
        )
        c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=sh))
        fade = window(t, 16, 24, 0.0, 0.5)
        y0 = 300
        for i, (head, hint) in enumerate(PROMISES):
            t0 = 16.0 + 2.0 * i
            if t < t0:
                break
            current = t < t0 + 2.0 or i == len(PROMISES) - 1
            a = fade * (1.0 if current else 0.38)
            y = y0 + i * 140
            text(c, head, 150, y, 74, alpha=a, reveal=phase(t, t0, t0 + 0.7))
            label(c, hint, 152, y + 46, alpha=a * phase(t, t0 + 0.35, t0 + 0.8) * 0.9, size=22, color=SUBTLE)
        return
    if t < 28.0:
        light_field(c, t, amp=0.55 * smooth(phase(t, 24.0, 25.5)) * (1 - smooth(phase(t, 27.3, 28.0))))
        a = window(t, 24.4, 27.85, 0.01, 0.45)
        text(c, "It felt like a superpower.", W / 2, H / 2 + 34, 100, align="center", gradient=True, alpha=a, reveal=phase(t, 24.4, 25.6))
        return
    a = window(t, 28.1, 29.7, 0.01, 0.3)
    text(c, "Then you wrote it down.", W / 2, H / 2 + 34, 100, align="center", alpha=a, reveal=phase(t, 28.1, 29.0))


# ---------------------------------------------------------------- 30–54 the ceremony

CER_LINES = CEREMONY_CODE.split("\n")
CER_TOTAL = len(CEREMONY_CODE)
CER_SIZE = 15.5
CER_LH = 1.6
PANEL = skia.Rect.MakeLTRB(120, 70, 1800, 1010)


def cer_chars(t):
    return int(CER_TOTAL * ease_in(phase(t, 30.0, 34.3), 2.4))


# keystroke rattle for the avalanche: capped so it reads as frantic typing
_last = -1
for _i in range(int((34.3 - 30.0) * FPS)):
    _t = 30.0 + _i / FPS
    _n = cer_chars(_t)
    if _n > _last:
        for _k in range(min(3, _n - max(_last, 0))):
            event(_t + _k / (FPS * 3), "key", 0.7)
        _last = _n


def ceremony_typing(c, t, highlight=0.0):
    n = cer_chars(t)
    shown = CEREMONY_CODE[:n]
    line = shown.count("\n")
    lines_total = line + 1
    adv = mono_advance(CER_SIZE)
    ox, oy = PANEL.left() + 48, PANEL.top() + 56 + 24
    cy = oy + (line + 0.5) * CER_SIZE * CER_LH
    cx = ox + len(shown.split("\n")[-1]) * adv
    z = lerp(2.2, 1.0, ease_in_out(phase(t, 30.0, 34.5)))
    # keep the panel's left edge in view, follow the caret down, then settle
    settle = ease_in_out(phase(t, 32.5, 34.5))
    fx = lerp(PANEL.left() - 30 + W / (2 * z), W / 2, settle)
    fy = lerp(max(cy, PANEL.top() + H / (2 * z) - 30), H / 2, settle)
    c.save()
    c.translate(W / 2, H / 2)
    c.scale(z, z)
    c.translate(-fx, -fy)
    window_panel(c, PANEL, "users.ts", right=f"{lines_total} lines")
    c.save()
    c.clipRect(PANEL)
    draw_code(c, CEREMONY_CODE, ox, oy, CER_SIZE, chars=n, lh=CER_LH, highlight=highlight)
    c.restore()
    if n < CER_TOTAL:
        caret(c, cx + 2, oy + (line + 0.8) * CER_SIZE * CER_LH, CER_SIZE, t, solid=True)
    c.restore()


@cache
def wall_image(i, level):
    """One code panel of the wall, rasterised once per highlight level."""
    snippets = wall_snippets()
    code = CEREMONY_CODE if i == 0 else snippets[(i * 7) % len(snippets)]
    # the hero panel gets full 4K detail; the wall around it is seen small
    k = SCALE if i == 0 else 1
    surf = skia.Surface(W * k, H * k)
    c = surf.getCanvas()
    c.clear(argb(INK, 0))
    c.scale(k, k)
    window_panel(c, PANEL, "users.ts" if i == 0 else f"module{i}.ts", right=f"{code.count(chr(10)) + 1} lines")
    c.save()
    c.clipRect(PANEL)
    size = CER_SIZE if i == 0 else min(18.0, code_size(code, PANEL.width() - 96, PANEL.height() - 100, cap=18))
    draw_code(c, code, PANEL.left() + 48, PANEL.top() + 80, size, lh=CER_LH, highlight=level / 4, dim=level / 4)
    c.restore()
    return surf.makeImageSnapshot().withDefaultMipmaps()


def code_wall(c, t, k=None, level=None):
    """The camera pulls back from one panel to a wall of ceremony."""
    if k is None:
        x = phase(t, 34.5, 38.0)
        k = math.exp(lerp(0.0, math.log(1 / 9.5), ease_in_out(x)))
    if level is None:
        level = int(round(4 * smooth(phase(t, 35.0, 37.5))))
    fill(c)
    span = int(math.ceil((1 / k) / 2)) + 1
    for j in range(-span, span + 1):
        for i in range(-span, span + 1):
            idx = 0 if (i, j) == (0, 0) else 1 + ((i * 31 + j * 17) % 12)
            x0 = W / 2 + (i * W - W / 2) * k
            y0 = H / 2 + (j * H - H / 2) * k
            if x0 > W or y0 > H or x0 + W * k < 0 or y0 + H * k < 0:
                continue
            img = wall_image(idx, level)
            p = skia.Paint(AntiAlias=True)
            c.drawImageRect(img, skia.Rect.MakeXYWH(x0, y0, W * k, H * k), skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear), p)


def stamps(c, t, t0, t1, period, seed, max_size=110):
    """Ceremony tokens slammed on screen on the grid."""
    if t < t0 or t >= t1:
        return
    k = int((t - t0) / period)
    for j in range(k - 2, k + 1):
        if j < 0:
            continue
        ts = t0 + j * period
        age = t - ts
        life = period * 2.2
        if age < 0 or age > life:
            continue
        r = lambda n: hash01(seed, j, n)  # noqa: E731
        s = STAMPS[int(r(1) * len(STAMPS)) % len(STAMPS)]
        size = 40 + r(2) * (max_size - 40)
        w = text_width(s, size, MONO_MED)
        x = 80 + r(3) * max(10, W - 160 - w)
        y = 140 + r(4) * (H - 240)
        a = (1 - age / life) ** 1.5
        sc = 1 + 0.25 * (1 - ease_out(age / 0.12))
        c.save()
        c.translate(x + w / 2, y)
        c.scale(sc, sc)
        text(c, s, -w / 2, 0, size, MONO_MED, WHITE, alpha=a, glow=0.4 * a)
        c.restore()


def _register_stamp_events(t0, t1, period, strength):
    t = t0
    while t < t1 - 1e-6:
        event(t, "stamp", strength)
        t += period


_register_stamp_events(38.5, 40.0, 0.25, 0.9)
_register_stamp_events(41.0, 41.9, 0.5, 0.45)
_register_stamp_events(49.5, 52.5, 0.25, 0.8)
_register_stamp_events(52.5, 54.0, 0.125, 1.0)


# 3D replacements for the photo plates. A shot is used only once every frame
# has rendered, so a half-finished render never reaches the cut.
SHOT_FRAMES = {"tangle2": 420, "wirehall": 105, "thread": 200, "paper": 60, "dawn": 222, "plain": 80}


@cache
def ready(shot):
    d = Path(__file__).resolve().parent.parent / "build" / "blender" / shot
    return d.exists() and sum(1 for p in d.iterdir() if p.suffix == ".exr") >= SHOT_FRAMES[shot]


def shot(c, name, t, t0, alpha=1.0, n=None):
    if n is None:
        n = int((t - t0) * FPS) + 1
    draw_frame(c, blender_frame(name, min(max(1, n), SHOT_FRAMES[name])), alpha=alpha)


def tangle(c, t):
    if ready("tangle2"):
        shot(c, "tangle2", t, 40.0)
    else:
        draw_frame(c, blender_frame("tangle", int((t - 40.0) * FPS) + 1))


def ceremony(c, t):
    fill(c)
    if t < 34.5:
        ceremony_typing(c, t, highlight=smooth(phase(t, 33.0, 34.5)) * 0.4)
        return
    if t < 38.0:
        code_wall(c, t)
        return
    if t < 40.0:
        if ready("paper"):
            shot(c, "paper", t, 38.0)
        else:
            kenburns(c, plate("paper-avalanche"), phase(t, 38, 40), 1.02, 1.16, (0.5, 0.42), (0.48, 0.38), shake=1.5 + 3 * phase(t, 38, 40), t=t)
        stamps(c, t, 38.5, 40.0, 0.25, 11)
        return
    if t < 46.0:
        tangle(c, t)
        stamps(c, t, 41.0, 41.9, 0.5, 23, max_size=70)
        a = window(t, 42.0, 45.6, 0.01, 0.4)
        # a soft pool of dark behind the line so it reads over the tangle
        g = skia.GradientShader.MakeRadial(
            skia.Point(W / 2, H / 2), 900, [argb(INK, 0.78 * a), argb(INK, 0.0)], [0.0, 1.0]
        )
        c.save()
        c.scale(1.0, 0.45)
        c.translate(0, H / 2 / 0.45 - H / 2)
        c.drawRect(skia.Rect.MakeXYWH(0, -H, W, H * 3), skia.Paint(Shader=g))
        c.restore()
        text(c, "You wanted reliability.", W / 2, H / 2 + 34, 96, align="center", alpha=a, reveal=phase(t, 42.0, 43.0))
        return
    if t < 49.5:
        if ready("wirehall"):
            shot(c, "wirehall", t, 46.0)
        else:
            kenburns(c, plate("threads-hall"), phase(t, 46, 49.5), 1.04, 1.2, (0.5, 0.78), (0.5, 0.42))
        flash(c, math.exp(-(t - 46.0) * 6) * 0.5)
        a = window(t, 46.0, 49.3, 0.01, 0.3)
        text(c, "You got ceremony.", W / 2, H / 2 + 40, 132, align="center", alpha=a, reveal=phase(t, 46.0, 46.45), glow=0.25)
        return
    # 49.5–54: the climax, then a strobe montage that cuts to nothing
    f = int((t - 49.5) * FPS)
    if t >= 52.5:
        sel = (f // 2) % 4
        if sel == 0:
            tangle(c, t)
        elif sel == 1:
            code_wall(c, t, k=0.16 + 0.05 * hash01(f), level=4)
        elif sel == 2:
            if ready("wirehall"):
                shot(c, "wirehall", t, 0, n=1 + int(hash01(f, 2) * 104))
            else:
                kenburns(c, plate("threads-hall"), hash01(f, 2), 1.3, 1.5, (0.5, 0.5), (0.5, 0.4))
        else:
            if ready("paper"):
                shot(c, "paper", t, 0, n=1 + int(hash01(f, 3) * 59))
            else:
                kenburns(c, plate("paper-avalanche"), hash01(f, 3), 1.2, 1.4, (0.5, 0.45), (0.45, 0.4))
        flash(c, ease_in(phase(t, 52.5, 54.0), 3) * 0.9 * (0.5 + 0.5 * (f % 2)))
    else:
        tangle(c, t)
    stamps(c, t, 49.5, 52.5, 0.25, 37)
    stamps(c, t, 52.5, 54.0, 0.125, 41, max_size=140)


# ---------------------------------------------------------------- 54–68 the question


def question(c, t):
    fill(c)
    if t < 55.0:
        return
    a_img = smooth(phase(t, 55.0, 57.8)) * 0.95
    if t < 62.2:
        if ready("thread"):
            shot(c, "thread", t, 55.0, alpha=a_img)
        else:
            kenburns(c, plate("one-thread"), phase(t, 55, 62), 1.16, 1.07, (0.5, 0.476), (0.5, 0.476), alpha=a_img)
    x = smooth(phase(t, 61.0, 62.2))
    if x > 0:
        draw_frame(c, blender_frame("converge", int((t - 58.0) * FPS) + 1), alpha=x)
    a = window(t, 56.5, 61.5, 0.01, 0.7)
    text(c, "What if the language", W / 2, 330, 92, align="center", alpha=a, reveal=phase(t, 56.5, 57.6))
    text(c, "just understood?", W / 2, 440, 92, align="center", alpha=a, gradient=True, reveal=phase(t, 58.5, 59.6))


# ---------------------------------------------------------------- 68–80 introducing

LOCKUP_CAP = 104
MARK3D_H = 420
MARK3D_C = (960, 500)


def draw_mark(c, x, y, h, alpha=1.0, glow=0.0):
    m = mark_paths(round(h, 1))
    c.save()
    c.translate(x, y)
    if glow > 0:
        c.drawPath(m["all"], paint(WHITE, alpha * glow, blur=h * 0.08))
    c.drawPath(m["all"], paint(WHITE, alpha))
    c.restore()
    return m["w"]


def introducing(c, t):
    fill(c)
    if t < 77.6:
        draw_frame(c, blender_frame("monolith", int((t - 68.0) * FPS) + 1), alpha=1 - smooth(phase(t, 76.2, 77.4)))
    flash(c, math.exp(-max(0.0, t - 70.0) * 5) * (t >= 70.0) * 0.55)
    a = window(t, 72.4, 75.8, 0.6, 0.5)
    text(c, "Introducing", W / 2, 880, 44, DISPLAY_SEMI, SUBTLE, alpha=a, align="center", tracking=0.01)
    if t < 76.2:
        return
    # the 3D mark flattens into the logo, then makes room for the wordmark
    light_field(c, t, amp=0.18 * smooth(phase(t, 76.5, 78)))
    mp, wp, lw, lh, mw = lockup(LOCKUP_CAP)
    k = ease_in_out(phase(t, 77.2, 78.3))
    mh0 = MARK3D_H
    mw0 = mark_paths(mh0)["w"]
    x0, y0 = MARK3D_C[0] - mw0 / 2, MARK3D_C[1] - mh0 / 2
    lx, ly = W / 2 - lw / 2, 470 - lh / 2
    h = lerp(mh0, lh, k)
    x, y = lerp(x0, lx, k), lerp(y0, ly, k)
    a_mark = smooth(phase(t, 76.2, 77.3))
    if k < 1:
        draw_mark(c, x, y, h, alpha=a_mark, glow=0.25 * (1 - k))
    else:
        draw_lockup(c, W / 2, 470, LOCKUP_CAP, word=phase(t, 78.2, 79.0))
    a = window(t, 78.6, 80.0, 0.5, 0.25)
    text(c, "TypeScript with Effect built into the language.", W / 2, 690, 38, BODY, SUBTLE, alpha=a, align="center", tracking=0)


# ---------------------------------------------------------------- 80–126 the language

TECH_PANEL = skia.Rect.MakeXYWH(240, 190, 1440, 720)


@cache
def feature_morph(i):
    f = FEATURES[i]
    inner_w = TECH_PANEL.width() - 120
    inner_h = TECH_PANEL.height() - 56 - 70
    size = min(code_size(f["a"], inner_w, inner_h, cap=30), code_size(f["b"], inner_w, inner_h, cap=30))
    lh = 1.62

    def origin(code):
        n = code.count("\n") + 1
        y = TECH_PANEL.top() + 56 + (TECH_PANEL.height() - 56 - n * size * lh) / 2 - size * 0.15
        return (TECH_PANEL.left() + 60, y)

    return Morph(f["a"], f["b"], size, origin(f["a"]), origin(f["b"]), lh), size


for _f in FEATURES:
    _ms = _f["t"] + _f["d"] * 0.32
    event(_ms, "morph", 1.0)
    Typing(f"// {_f['n']}  {_f['name']}", _f["t"] + 0.05, 55, kind="tick", strength=0.35)


def tech_background(c, t):
    fill(c)
    pulse = beat(t, 80.0, 1.0) if t < 88 else beat(t, 88.0, 0.5)
    radial_glow(c, W / 2, H * 0.48, 1100, 0.035 + 0.035 * pulse)
    grid(c, alpha=0.9, step=64, ox=-(t - 80) * 6, oy=0)


def feature(c, t, i):
    f = FEATURES[i]
    u, d = t - f["t"], f["d"]
    morph, size = feature_morph(i)
    enter = ease_out(phase(t, 80.0, 80.7), 4) if i == 0 else 1.0
    exit_ = smooth(phase(u, d - 0.3, d)) if i < len(FEATURES) - 1 else 0.0
    m0 = d * 0.32
    m = phase(u, m0, m0 + 1.35)
    c.save()
    c.translate(0, (1 - enter) * 120)
    na = f["a"].count("\n") + 1
    nb = f["b"].count("\n") + 1
    cnt = round(lerp(na, nb, ease_in_out(m)))
    window_panel(
        c,
        TECH_PANEL,
        f["tabs"][0],
        alpha=enter,
        title2=f["tabs"][1],
        tmix=smooth(phase(u, m0 + 0.4, m0 + 0.9)),
        right=f"{cnt} lines" if m < 1 else f"{na} → {nb} lines",
    )
    c.restore()
    lab = f"// {f['n']}  {f['name']}"
    label(c, lab, TECH_PANEL.left() + 4, TECH_PANEL.top() - 34, alpha=enter * (1 - exit_), size=22, color=SUBTLE, chars=(u - 0.05) * 55)
    # the code
    content = enter * (1 - exit_)
    if content > 0.002:
        c.save()
        c.clipRect(TECH_PANEL.makeInset(2, 58))
        c.translate(-exit_ * 40, (1 - enter) * 120)
        if m <= 0:
            appear = smooth(phase(u, 0.0, 0.5)) if i > 0 else smooth(phase(t, 80.3, 80.9))
            hl = smooth(phase(u, 0.6, 1.4)) * (0.75 + 0.25 * beat(t, 80.0, 0.5))
            draw_code(c, f["a"], morph.oa[0], morph.oa[1], size, alpha=appear * content, lh=morph.lh, highlight=hl, dim=hl)
        else:
            morph.draw(c, m, alpha=content, highlight=1 - m)
        c.restore()
    # caption
    ca = window(u, m0 + 1.45, d - 0.05, 0.01, 0.3)
    text(c, f["caption"], W / 2, TECH_PANEL.bottom() + 92, 44, DISPLAY_SEMI, WHITE, alpha=ca, align="center", reveal=phase(u, m0 + 1.45, m0 + 2.1), tracking=-0.015)


T_BUILD = Typing("$ npx efx build src", 122.3, 24)
CHIPS = ["Superset of TypeScript", "Idiomatic Effect v4 output", "Source maps", "Runs in the browser"]
for _i in range(4):
    event(124.0 + 0.5 * _i, "chip", 0.8)
event(123.35, "enter", 1.0)
event(123.9, "success", 0.9)


def terminal(c, t):
    r = skia.Rect.MakeXYWH(420, 250, 1080, 420)
    window_panel(c, r, "zsh")
    f = mono(34)
    x0, y0 = r.left() + 56, r.top() + 56 + 90
    s = T_BUILD.text(t)
    c.drawString(s, x0, y0, f, paint(WHITE))
    if t < 123.35:
        caret(c, x0 + mono_advance(34) * len(s) + 3, y0, 34, t, solid=t < T_BUILD.end)
    if t >= 123.35:
        c.drawString("  compiling 42 files…", x0, y0 + 64, f, paint(MUTED, smooth(phase(t, 123.35, 123.5))))
    if t >= 123.9:
        a = smooth(phase(t, 123.9, 124.05))
        c.drawString("✓ compiled 42 files", x0, y0 + 128, mono(34, MONO_MED), paint(WHITE, a))
        c.drawString("✓ compiled 42 files", x0, y0 + 128, mono(34, MONO_MED), paint(WHITE, a * math.exp(-(t - 123.9) * 3), blur=10))
    # capability chips on the beat
    widths = [text_width(s, 26, BODY_MED, 0) + 56 for s in CHIPS]
    gap = 18
    total = sum(widths) + gap * 3
    x = W / 2 - total / 2
    for i, s in enumerate(CHIPS):
        t0 = 124.0 + 0.5 * i
        k = ease_out(phase(t, t0, t0 + 0.35), 4)
        if k > 0:
            rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x, 760 + (1 - k) * 30, widths[i], 60), 30, 30)
            c.drawRRect(rr, paint(TILE, k))
            c.drawRRect(rr, paint(LINE, k, stroke=1.5))
            text(c, s, x + 28, 760 + (1 - k) * 30 + 39, 26, BODY_MED, Z300, alpha=k, tracking=0)
        x += widths[i] + gap



def language(c, t):
    tech_background(c, t)
    if t >= 122.0:
        terminal(c, t)
        return
    for i in range(len(FEATURES) - 1, -1, -1):
        if t >= FEATURES[i]["t"]:
            f = FEATURES[i]
            u = (t - f["t"]) / f["d"]
            # each slide drifts through a few degrees; the first swings in
            ry = lerp(-3.5, 3.5, u) * (1 if i % 2 == 0 else -1)
            rx = 2.0 * math.sin(u * math.pi)
            if i == 0:
                ry += -28 * (1 - ease_out(phase(t, 80.0, 81.0), 3))
            c.save()
            tilt(c, ry, rx)
            feature(c, t, i)
            c.restore()
            break
    # each feature cut lands with a soft white pulse
    for f in FEATURES:
        if f["t"] <= t < f["t"] + 0.3 and f["t"] > 80:
            flash(c, math.exp(-(t - f["t"]) * 14) * 0.08)


# ---------------------------------------------------------------- 126–144 3:07 AM

T_CLOCK = Typing("3:07 AM", 126.7, 10, kind="tick", strength=0.5)
RETRY_CODE = """export effect getUser(id: UserId): User throws DbError {
  return await db.users.find(id)
} |> retry({ times: 3 })"""
LOG = [
    (131.8, '03:07:12.481  getUser("u_8f2a")  DbError: connection reset', MUTED, "error"),
    (132.6, "03:07:12.683  retry 1/3", SUBTLE, "retry"),
    (133.4, "03:07:13.090  retry 2/3", SUBTLE, "retry"),
    (134.3, '03:07:13.902  ✓ getUser("u_8f2a")  ok', WHITE, "success"),
]
for _t, _s, _c, _k in LOG:
    event(_t, _k, 0.8)
event(127.4, "buzz", 1.0)


def three_am(c, t):
    fill(c)
    if t < 131.0:
        a = smooth(phase(t, 126.0, 126.6))
        kenburns(c, plate("phone-night"), phase(t, 126, 131.4), 1.0, 1.1, (0.32, 0.64), (0.3, 0.66), alpha=a)
        # the phone lights the room
        g = math.exp(-max(0, t - 127.4) * 1.5) * (t >= 127.4)
        radial_glow(c, W * 0.24, H * 0.7, 520, 0.18 * g)
        text(c, T_CLOCK.text(t), W - 150, 330, 30, MONO_MED, SUBTLE, align="right", tracking=0.06)
        aa = window(t, 128.4, 130.9, 0.01, 0.4)
        text(c, "The database blinks.", W - 150, 430, 76, align="right", alpha=aa, reveal=phase(t, 128.4, 129.3))
        return
    if t < 137.0:
        a = smooth(phase(t, 131.0, 131.4)) * (1 - smooth(phase(t, 136.6, 137.0)))
        r = skia.Rect.MakeXYWH(260, 180, 1400, 640)
        window_panel(c, r, "users.efx", alpha=a, right="production")
        size = 27
        ox, oy = r.left() + 56, r.top() + 56 + 34
        draw_code(c, RETRY_CODE, ox, oy, size, alpha=a)
        # the retry clause lights up while it works
        work = max((math.exp(-(t - lt) * 2.2) if t >= lt else 0) for lt, _, _, k in LOG if k == "retry")
        work = max(work, 0.35 * smooth(phase(t, 134.3, 135.0)))
        adv = mono_advance(size)
        rx = ox + 2 * adv
        ry = oy + 2 * size * 1.62
        if work > 0.01:
            rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(rx - 8, ry + 2, adv * 22 + 16, size * 1.3), 8, 8)
            c.drawRRect(rr, paint(WHITE, a * 0.10 * work))
            c.drawString("|> retry({ times: 3 })", rx, ry + 0.8 * size * 1.62, mono(size, MONO_MED), paint(WHITE, a * work, blur=10))
        c.drawLine(r.left(), oy + 3.6 * size * 1.62, r.right(), oy + 3.6 * size * 1.62, paint(LINE, a, stroke=1.5))
        f = mono(24)
        for i, (lt, s, col, kind) in enumerate(LOG):
            if t < lt:
                continue
            k = smooth(phase(t, lt, lt + 0.15))
            y = oy + 3.6 * size * 1.62 + 70 + i * 52
            c.drawString(s, ox + (1 - k) * 12, y, f, paint(col, a * k))
        ca = window(t, 134.9, 136.8, 0.01, 0.3)
        text(c, "Your code already knew what to do.", W / 2, 940, 52, DISPLAY_SEMI, WHITE, alpha=ca, align="center", reveal=phase(t, 134.9, 135.7))
        return
    x = phase(t, 137.0, 144.4)
    if ready("dawn"):
        shot(c, "dawn", t, 137.0, alpha=smooth(phase(t, 137.0, 138.6)))
    else:
        kenburns(c, plate("dawn"), x, 1.14, 1.0, (0.4, 0.42), (0.42, 0.45), alpha=smooth(phase(t, 137.0, 138.6)), exposure=lerp(0.75, 1.05, smooth(x)))
    sh = skia.GradientShader.MakeLinear(
        [skia.Point(0, H * 0.45), skia.Point(0, H)], [argb(INK, 0.0), argb(INK, 0.78)], [0.0, 1.0]
    )
    c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=sh))
    a = window(t, 138.2, 143.6, 0.01, 0.5)
    text(c, "You slept through it.", 150, 860, 84, alpha=a, reveal=phase(t, 138.2, 139.2))
    text(c, "Because you wrote what you meant.", 152, 950, 52, DISPLAY_SEMI, alpha=a, gradient=True, reveal=phase(t, 140.8, 141.8), tracking=-0.015)


# ---------------------------------------------------------------- 144–160 finale

T_NPM = Typing("npm i effectscript", 155.0, 20)


def finale(c, t):
    fill(c)
    if t < 152.2:
        draw_frame(c, blender_frame("hero", int((t - 144.0) * FPS) + 1), alpha=smooth(phase(t, 144.0, 144.5)))
        sh = skia.GradientShader.MakeLinear(
            [skia.Point(0, 0), skia.Point(W * 0.55, 0)], [argb(INK, 0.5), argb(INK, 0.0)], [0.0, 1.0]
        )
        c.drawRect(skia.Rect.MakeWH(W, H), skia.Paint(Shader=sh))
        a = window(t, 145.0, 151.8, 0.01, 0.5)
        text(c, "All of Effect.", 150, 490, 100, alpha=a, reveal=phase(t, 145.0, 146.0))
        text(c, "None of the ceremony.", 150, 610, 100, alpha=a, gradient=True, reveal=phase(t, 147.5, 148.6))
    if 151.8 <= t < 154.4:
        a = smooth(phase(t, 151.8, 152.3)) * (1 - smooth(phase(t, 153.9, 154.4)))
        if ready("plain"):
            shot(c, "plain", t, 151.8, alpha=a)
        else:
            kenburns(c, plate("monolith-plain"), phase(t, 151.8, 154.4), 1.0, 1.1, (0.38, 0.55), (0.37, 0.52), alpha=a)
    if t >= 154.0:
        out = 1 - smooth(phase(t, 158.2, 159.6))
        light_field(c, t, amp=0.16 * smooth(phase(t, 154.2, 156)) * out)
        k = ease_out(phase(t, 154.0, 155.0), 3)
        c.save()
        c.translate(W / 2, 450)
        sc = lerp(0.94, 1.0, k)
        c.scale(sc, sc)
        c.translate(-W / 2, -450)
        draw_lockup(c, W / 2, 450, 104, alpha=k * out, word=1.0)
        c.restore()
        # npm pill
        f = mono(32)
        s = T_NPM.text(t)
        pw = mono_advance(32) * (len(T_NPM.s) + 2) + 64
        pr = skia.Rect.MakeXYWH(W / 2 - pw / 2, 600, pw, 76)
        pa = smooth(phase(t, 154.6, 155.0)) * out
        c.drawRRect(skia.RRect.MakeRectXY(pr, 14, 14), paint(TILE, pa))
        c.drawRRect(skia.RRect.MakeRectXY(pr, 14, 14), paint(LINE, pa, stroke=1.5))
        x0 = pr.left() + 32
        c.drawString("$", x0, pr.top() + 49, f, paint(MUTED, pa))
        c.drawString(s, x0 + mono_advance(32) * 2, pr.top() + 49, f, paint(WHITE, pa))
        caret(c, x0 + mono_advance(32) * (2 + len(s)) + 3, pr.top() + 49, 32, t, alpha=pa, solid=t < T_NPM.end)
        ba = smooth(phase(t, 156.2, 157.0)) * out
        text(c, "Built on Effect", W / 2, 840, 28, BODY_MED, MUTED, alpha=ba, align="center", tracking=0.01)


# ---------------------------------------------------------------- the cut

ACTS = [
    (0.0, 12.0, cold_open),
    (12.0, 30.0, promise),
    (30.0, 54.0, ceremony),
    (54.0, 68.0, question),
    (68.0, 80.0, introducing),
    (80.0, 126.0, language),
    (126.0, 144.0, three_am),
    (144.0, 160.0, finale),
]


def draw(c, t):
    for a, b, fn in ACTS:
        if a <= t < b:
            fn(c, t)
            return
    fill(c)


for _t, _k, _s in [
    (10.6, "whoosh", 0.8),
    (34.4, "longwhoosh", 1.0),
    (79.75, "whoosh", 0.6),
    (86.0 - 0.18, "swish", 0.5),
    (92.0 - 0.18, "swish", 0.5),
    (98.0 - 0.18, "swish", 0.5),
    (104.0 - 0.18, "swish", 0.5),
    (112.0 - 0.18, "swish", 0.5),
    (117.0 - 0.18, "swish", 0.5),
    (122.0 - 0.18, "swish", 0.5),
]:
    event(_t, _k, _s)
for _f in range(45):
    if _f % 2 == 0:
        event(52.5 + _f / FPS, "glitch", 0.4 + 0.6 * _f / 45)

EVENTS.sort()

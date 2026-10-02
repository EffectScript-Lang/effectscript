"""Render Blender shots on Modal, many GPUs in parallel.

  modal run film/cloud/modal_render.py::smoke
  modal run film/cloud/modal_render.py --shot plain --frames 1-60 --chunk 3 --out plain_v2

The image pins the same Blender as the Mac (5.2.2) and is built once, then
cached. The brand scripts are mounted at run time, so editing a scene script
never rebuilds the image. Each container renders a slice of frames and returns
the EXRs, which are written to build/blender/<out>/."""

import subprocess
import time
from pathlib import Path

import modal

# the brand folder on the Mac; inside the container the scripts live under /work/brand
BRAND = Path(__file__).resolve().parents[2] if modal.is_local() else Path("/work/brand")
BLENDER = "5.2.2"
GPU = "RTX-PRO-6000"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "wget", "xz-utils", "libx11-6", "libxrender1", "libxi6", "libxkbcommon0", "libxkbcommon-x11-0",
        "libxxf86vm1", "libxfixes3", "libxext6", "libsm6", "libice6", "libgl1", "libegl1", "libglu1-mesa",
        "libgomp1", "libwayland-client0", "libdbus-1-3",
    )
    .run_commands(
        f"wget -q https://download.blender.org/release/Blender{BLENDER[:3]}/blender-{BLENDER}-linux-x64.tar.xz -O /tmp/b.tar.xz",
        "mkdir -p /opt/blender && tar -xJf /tmp/b.tar.xz -C /opt/blender --strip-components=1 && rm /tmp/b.tar.xz",
    )
    .env({"NVIDIA_DRIVER_CAPABILITIES": "all"})
    .add_local_dir(BRAND / "scripts", "/work/brand/scripts", ignore=["__pycache__"])
    .add_local_dir(BRAND / "film" / "blender-env", "/work/brand/film/blender-env", ignore=["__pycache__", "_cache", "logs"])
)

app = modal.App("effectscript-film", image=image)


@app.function(gpu=GPU, timeout=600)
def smoke():
    out = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv"], capture_output=True, text=True)
    print(out.stdout)
    out = subprocess.run(
        ["/opt/blender/blender", "-b", "--python-expr",
         "import bpy;p=bpy.context.preferences.addons['cycles'].preferences;"
         "[ (setattr(p,'compute_device_type',k), p.get_devices(), print(k,[d.name for d in p.devices if d.type==k])) for k in ('OPTIX','CUDA') ]"],
        capture_output=True, text=True,
    )
    print(out.stdout[-2000:], out.stderr[-2000:])


@app.function(gpu=GPU, timeout=3600, retries=1)
def render(shot: str, a: int, b: int, samples: int = 0) -> dict:
    t0 = time.time()
    args = ["/opt/blender/blender", "-b", "-P", f"/work/brand/film/blender-env/{shot}.py", "--",
            "--range", f"{a}-{b}", "--no-save"]
    if samples:
        args += ["--samples", str(samples)]
    p = subprocess.run(args, capture_output=True, text=True)
    log = (p.stdout + p.stderr).splitlines()
    outdir = Path("/work/brand/film/build/blender") / shot
    frames = {}
    for f in range(a, b + 1):
        exr = outdir / f"{f:04d}.exr"
        if exr.exists():
            frames[f] = exr.read_bytes()
    times = [ln for ln in log if "done in" in ln or "devices" in ln]
    if len(frames) != b - a + 1:
        times += log[-40:]
    return {"frames": frames, "log": times, "seconds": time.time() - t0}


@app.local_entrypoint()
def main(shot: str = "plain", frames: str = "1-60", chunk: int = 3, out: str = "", samples: int = 0):
    a, b = (int(x) for x in frames.split("-"))
    slices = [(shot, s, min(b, s + chunk - 1), samples) for s in range(a, b + 1, chunk)]
    dest = BRAND / "film" / "build" / "blender" / (out or shot)
    dest.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    got, container_s = 0, 0.0
    print(f"rendering {shot} frames {a}-{b} as {len(slices)} parallel slices on {GPU} …", flush=True)
    for res in render.starmap(slices, order_outputs=False):
        container_s += res["seconds"]
        for f, data in res["frames"].items():
            (dest / f"{f:04d}.exr").write_bytes(data)
            got += 1
        for ln in res["log"]:
            print("  ", ln)
        print(f"{got}/{b - a + 1} frames  ({time.time() - t0:.0f}s wall)", flush=True)
    print(f"done: {got} frames in {time.time() - t0:.0f}s wall, {container_s / 60:.1f} GPU-minutes → {dest}")

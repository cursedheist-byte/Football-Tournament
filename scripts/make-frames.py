#!/usr/bin/env python3
"""
Build the scroll-sequence frames used by the site.

Input  : a .zip, a folder of frames (frame_001.jpg ...), or a video file (.mp4/.mov/.webm).
Output : public/frames/d/0001.webp ... (desktop, 640px) and public/frames/m/0001.webp ... (mobile, 400px)

Processing per frame
  * square crop around the ball (removes the corner "Veo" watermark that sits outside the crop)
  * near-black noise (JPEG artefacts) is crushed to pure black so the frame blends invisibly
    with the page background when composited with mix-blend-mode: screen
  * resized + encoded to WebP

Usage:  python3 scripts/make-frames.py path/to/input [--quality 74]
Requires Pillow (pip install pillow). A video input additionally requires ffmpeg on PATH.
"""
import sys, os, glob, zipfile, tempfile, subprocess, shutil, argparse
from PIL import Image

# Ball centre/size measured over all 192 supplied frames: centre ~(630,343), diameter ~600px (1280x720 source)
CROP = 660            # square crop edge in source pixels
CX, CY = 630, 343     # crop centre
BLACK_FLOOR = 14      # luminance below this becomes 0
SETS = {"d": 640, "m": 400}

def collect_frames(src, tmp):
    if os.path.isdir(src):
        return sorted(glob.glob(os.path.join(src, "**", "*.jp*g"), recursive=True) +
                      glob.glob(os.path.join(src, "**", "*.png"), recursive=True))
    if src.lower().endswith(".zip"):
        with zipfile.ZipFile(src) as z:
            for n in z.namelist():
                if os.path.normpath(n).startswith(".."):  # zip-slip guard
                    raise SystemExit("unsafe path in zip: " + n)
            z.extractall(tmp)
        vids = [p for p in glob.glob(os.path.join(tmp, "**", "*"), recursive=True)
                if p.lower().endswith((".mp4", ".mov", ".webm", ".mkv"))]
        if vids:
            return collect_frames(vids[0], tmp)
        return collect_frames(tmp, tmp)
    if src.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
        out = os.path.join(tmp, "vid"); os.makedirs(out, exist_ok=True)
        subprocess.check_call(["ffmpeg", "-loglevel", "error", "-i", src, "-vf", "fps=24",
                               os.path.join(out, "f_%04d.png")])
        return sorted(glob.glob(os.path.join(out, "*.png")))
    raise SystemExit("unsupported input: " + src)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("--quality", type=int, default=74)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "frames"))
    a = ap.parse_args()
    tmp = tempfile.mkdtemp()
    try:
        frames = collect_frames(a.src, tmp)
        if not frames: raise SystemExit("no frames found")
        print(f"{len(frames)} source frames")
        lut = [0 if v < BLACK_FLOOR else v for v in range(256)]
        box = (CX - CROP // 2, CY - CROP // 2, CX + CROP // 2, CY + CROP // 2)
        for key in SETS:
            d = os.path.join(a.out, key); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        tot = {k: 0 for k in SETS}
        for i, f in enumerate(frames, 1):
            im = Image.open(f).convert("RGB").crop(box).point(lut * 3)
            for key, size in SETS.items():
                p = os.path.join(a.out, key, f"{i:04d}.webp")
                im.resize((size, size), Image.LANCZOS).save(p, "WEBP", quality=a.quality, method=6)
                tot[key] += os.path.getsize(p)
        for k, v in tot.items(): print(f"set {k}: {SETS[k]}px, {len(frames)} frames, {v/1e6:.2f} MB total")
        print("FRAME_COUNT =", len(frames))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__": main()

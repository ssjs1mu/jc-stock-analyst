#!/usr/bin/env python3
"""Extract Joshi's Corner letterhead art (tree logo + wordmark banner) from the
synced skill's letterhead template.pdf into PNGs.

The PNGs are committed to pipeline/branding/, so scheduled runs normally never
need this script. It is kept so the branding can be re-extracted if the
letterhead template ever changes.

Usage: python3 setup_branding.py [--out-dir branding]
"""
import argparse
import glob
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image


def find_template_pdf():
    hits = sorted(glob.glob("/root/.claude/skills/**/letterhead/template.pdf", recursive=True))
    hits += sorted(glob.glob("/mnt/skills/**/letterhead/template.pdf", recursive=True))
    if hits:
        return hits[0]
    raise FileNotFoundError("Letterhead template.pdf not found under any skills path - report this, do not fabricate branding.")


def composite(rgb_path, mask_path):
    base = np.array(Image.open(rgb_path).convert("RGB"))
    mask = np.array(Image.open(mask_path).convert("L"))
    return Image.fromarray(np.dstack([base, mask]), mode="RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "branding"))
    args = ap.parse_args()
    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    template_pdf = find_template_pdf()

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-all", template_pdf, os.path.join(tmp, "img")], check=True)
        files = sorted(os.listdir(tmp))
        jpgs = [f for f in files if f.endswith(".jpg")]
        pngs = [f for f in files if f.endswith(".png")]
        pairs = []
        for jf in jpgs:
            size = Image.open(os.path.join(tmp, jf)).size
            match = next((pf for pf in pngs if Image.open(os.path.join(tmp, pf)).size == size), None)
            if match:
                pairs.append((jf, match, size))

        def sat(p):
            return np.array(Image.open(os.path.join(tmp, p)).convert("HSV"))[:, :, 1].mean()

        squares = [(j, p) for j, p, (w, h) in pairs if 0.8 < w / h < 1.2]
        banners = [(j, p) for j, p, (w, h) in pairs if w / h > 1.8]
        if not squares or not banners:
            raise RuntimeError("Could not identify logo/banner in the letterhead template - report this, do not guess.")
        logo_pair = max(squares, key=lambda pr: sat(pr[0]))
        tree = composite(os.path.join(tmp, logo_pair[0]), os.path.join(tmp, logo_pair[1]))
        banner = composite(os.path.join(tmp, banners[0][0]), os.path.join(tmp, banners[0][1]))
        tree.save(os.path.join(out_dir, "tree_logo.png"))
        banner.save(os.path.join(out_dir, "wordmark_banner.png"))

        rgb = np.array(tree.convert("RGB")).astype(float)
        alpha = np.clip((rgb.max(axis=2) - 18) * 1.8, 0, 255).astype("uint8")
        Image.fromarray(np.dstack([rgb.astype("uint8"), alpha]), mode="RGBA").save(os.path.join(out_dir, "tree_logo_transparent.png"))
    print("Branding written to", out_dir)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Shorts Factory — tek komutla konu dosyasından yayına hazır dikey video.

Kullanım:
  python make_video.py topics/turkiyenin-en-yuksek-10-dagi.json
  python make_video.py topics/x.json --snap 2 9 30      # sadece kontrol kareleri
  python make_video.py --next                            # kuyruktaki sıradaki konuyu üret
"""
import argparse
import glob
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import render  # noqa: E402
import sfx  # noqa: E402
import timeline  # noqa: E402
import voice  # noqa: E402


def log(*a):
    print(*a, flush=True)


def is_explainer(spec):
    return spec.get("template") == "explainer3d"


def narration(spec):
    body = spec["scenes"] if is_explainer(spec) else spec["items"]
    return [spec["hook"]["say"]] + [i["say"] for i in body] + [spec["outro"]["say"]]


def make(spec_path, snap=None, workers=2):
    spec = json.load(open(spec_path, encoding="utf-8"))
    vid = spec["id"]
    cache = os.path.join(ROOT, "cache", vid)
    outdir = os.path.join(ROOT, "out", vid)
    os.makedirs(outdir, exist_ok=True)

    log("1/5 Seslendirme (Google TTS)…")
    texts = narration(spec)
    mp3s = voice.fetch_segments(texts, os.path.join(cache, "tts"), spec.get("voice", {}))
    vcfg = spec.get("voice", {})
    voice_wav = os.path.join(cache, "voice.wav")
    segs, words, vdur = voice.build_voice(texts, mp3s, vcfg.get("speed", 1.28), vcfg.get("gap", 0.18),
                                          0.25, voice_wav)

    log("2/5 Zaman çizelgesi + altyazı…")
    build = timeline.build_explainer if is_explainer(spec) else timeline.build
    page = "explainer.html" if is_explainer(spec) else "index.html"
    tl, events, intensity, T = build(spec, segs, words, vdur)
    tl_path = os.path.join(cache, "timeline.json")
    json.dump(tl, open(tl_path, "w", encoding="utf-8"), ensure_ascii=False)
    open(os.path.join(outdir, f"{vid}.srt"), "w", encoding="utf-8").write(timeline.srt(tl["captions"]))
    log(f"   süre: {T:.1f} sn, {len(tl['captions'])} altyazı öbeği")

    if snap:
        return render.snapshot(tl_path, snap, os.path.join(cache, "snaps"), page=page)

    log("3/5 Ses tasarımı (sentez + miks)…")
    v, _ = sf.read(voice_wav, dtype="float32")
    mix = sfx.mix(v, T, events, intensity)
    mix_wav = os.path.join(cache, "mix.wav")
    sf.write(mix_wav, mix, sfx.SR, subtype="FLOAT")
    aac = os.path.join(cache, "mix.m4a")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mix_wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
                    "-ar", "48000", "-c:a", "aac", "-b:a", "192k", aac], check=True)

    log("4/5 3D render…")
    # parça sınırları: her sahnenin ortası (geçişlerden uzak)
    cuts = [(s["t0"] + s["t1"]) / 2 for s in tl["scenes"]]
    silent = render.render_video(tl_path, T, tl["fps"], os.path.join(cache, "frames"), workers=workers,
                                 cut_points=cuts, log=log, page=page)

    log("5/5 Birleştirme…")
    final = os.path.join(outdir, f"{vid}.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", aac, "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", final], check=True)
    meta = spec.get("meta") or {}
    open(os.path.join(outdir, "paylasim.txt"), "w", encoding="utf-8").write(
        f"{meta.get('caption', spec['title'])}\n\n{' '.join(meta.get('hashtags', ['#shorts', '#bilgi', '#keşfet']))}\n")
    log(f"Hazır: {final}")
    return final


def next_topic():
    """topics/ içinde henüz out/ altında videosu olmayan ilk konu."""
    for p in sorted(glob.glob(os.path.join(ROOT, "topics", "*.json"))):
        vid = json.load(open(p, encoding="utf-8"))["id"]
        if not os.path.exists(os.path.join(ROOT, "out", vid, f"{vid}.mp4")):
            return p
    return None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", nargs="?")
    ap.add_argument("--next", action="store_true")
    ap.add_argument("--snap", nargs="*", type=float)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    a = ap.parse_args()
    spec = a.spec or (next_topic() if a.next else None)
    if not spec:
        sys.exit("Üretilecek konu yok. scriptgen.py ile yeni konu ekleyin.")
    make(spec, a.snap, a.workers)

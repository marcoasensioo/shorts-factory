#!/usr/bin/env python3
"""Uzun belgesel (yatay 16:9): long_topics/ içindeki sıradaki senaryoyu üretir, YouTube'a normal video
olarak yükler (#shorts yok), altyazı ve yorum ekler. Durum: state/long_done.json."""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "engine"))
import make_video  # noqa: E402
from autopilot_yardim import build_comment  # noqa: E402

STATE = os.path.join(ROOT, "state", "long_done.json")
done = json.load(open(STATE)) if os.path.exists(STATE) else []
spec = next((p for p in sorted(glob.glob(os.path.join(ROOT, "long_topics", "*.json")))
             if json.load(open(p, encoding="utf-8"))["id"] not in done), None)
if not spec:
    sys.exit(print("Sirada uzun video senaryosu yok (long_topics/ bos).") or 0)

d = json.load(open(spec, encoding="utf-8"))
from engine.timeline import nesne_kontrol
nesne_kontrol(d)  # ses üretilmeden önce: yanlış nesne varsa kota harcanmasın
video = make_video.make(spec, workers=int(os.environ.get("RENDER_WORKERS") or 2))
meta = d.get("meta", {})
title = meta.get("title") or d["title"]
desc = f"{meta.get('caption', d['title'])}\n\n{' '.join(meta.get('hashtags', []))}"

if os.environ.get("GITHUB_ACTIONS"):
    subprocess.run(["gh", "release", "create", d["id"], video, video[:-4] + ".srt", "--title", d["title"],
                    "--notes", desc], check=False)

if os.environ.get("YT_UPLOAD") == "1" and os.environ.get("YT_REFRESH_TOKEN"):
    import youtube
    vid = youtube.upload(video, title, desc, [h.lstrip("#") for h in meta.get("hashtags", [])])
    print("YouTube:", f"https://youtube.com/watch?v={vid}")
    for ad, is_ in (("yorum", lambda: youtube.comment(vid, build_comment(d))),
                    ("altyazi", lambda: youtube.caption(vid, video[:-4] + ".srt"))):
        try:
            print(f"{ad}:", is_())
        except Exception as e:  # noqa
            print(f"UYARI - {ad}:", e)

done.append(d["id"])
os.makedirs(os.path.dirname(STATE), exist_ok=True)
json.dump(done, open(STATE, "w"), indent=1)

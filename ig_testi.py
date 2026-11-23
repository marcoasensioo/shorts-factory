#!/usr/bin/env python3
"""Instagram kurulum testi: en son YouTube'a yüklenen videoyu (GitHub Release'teki) Instagram'a Reels olarak gönderir.
Yeni video üretmez, YouTube'a dokunmaz, sırayı değiştirmez."""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import instagram  # noqa: E402

if not os.environ.get("IG_TOKEN"):
    sys.exit("IG_TOKEN eklenmemis: GitHub Secrets'a IG_TOKEN ekle.")
print("Instagram hesabi:", instagram._call("GET", f"{instagram.API}/me", {"fields": "user_id,username"}))
done = json.load(open(os.path.join(ROOT, "state", "done.json")))
specs = {json.load(open(p, encoding="utf-8"))["id"]: p for p in glob.glob(os.path.join(ROOT, "topics", "*.json"))}
son = next(i for i in reversed(done) if i in specs)
d = json.load(open(specs[son], encoding="utf-8"))
print("Gonderilen video:", d["title"])
print("Instagram yayin kimligi:", instagram.publish_reel(f"{son}.mp4", instagram.build_caption(d), son))

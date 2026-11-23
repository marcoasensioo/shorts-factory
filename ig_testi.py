#!/usr/bin/env python3
"""Instagram testi: en son YouTube'a yüklenen videoyu (GitHub Release'teki) Instagram'a HİKÂYE olarak gönderir.
(Reels testi zaten yapıldı; aynı Reels'i tekrar paylaşmamak için sadece hikâye denenir.)
IG_TEST_REELS=1 verilirse Reels olarak da gönderir. Yeni video üretmez, YouTube'a dokunmaz, sırayı değiştirmez."""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "engine"))
import instagram  # noqa: E402

if not os.environ.get("IG_TOKEN"):
    sys.exit("IG_TOKEN eklenmemis: GitHub Secrets'a IG_TOKEN ekle.")
print("Instagram hesap kimligi:", instagram.user_id(), "| Unified login:", instagram.unified())
done = json.load(open(os.path.join(ROOT, "state", "done.json")))
specs = {json.load(open(p, encoding="utf-8"))["id"]: p for p in glob.glob(os.path.join(ROOT, "topics", "*.json"))}
son = next(i for i in reversed(done) if i in specs)
d = json.load(open(specs[son], encoding="utf-8"))
print("Gonderilen video:", d["title"])
if os.environ.get("IG_TEST_REELS") == "1":
    print("Instagram yayin kimligi:", instagram.publish_reel(f"{son}.mp4", instagram.build_caption(d), son))
print("Instagram hikaye kimligi:", instagram.publish_story(f"{son}.mp4", son))

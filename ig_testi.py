#!/usr/bin/env python3
"""Elle Instagram paylaşımı: en son YouTube'a yüklenen videoyu Instagram'a Reels + yorum + hikâye olarak gönderir.
IG_TEST_REELS=0 verilirse sadece hikâye. Yeni video üretmez, YouTube'a dokunmaz, sırayı değiştirmez."""
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
sys.path.insert(0, ROOT)
from autopilot_yardim import build_comment  # noqa: E402
if os.environ.get("IG_TEST_REELS", "1") == "1":
    ig_id = instagram.publish_reel(f"{son}.mp4", instagram.build_caption(d), son)
    print("Instagram yayin kimligi:", ig_id)
    try:
        print("Instagram yorum:", instagram.comment(ig_id, build_comment(d)))
    except Exception as e:  # noqa
        print("UYARI - Instagram yorumu yazilamadi:", e)
    import datetime
    open(os.path.join(ROOT, "state", "ig_son.txt"), "w").write(
        (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).date().isoformat())
print("Instagram hikaye kimligi:", instagram.publish_story(f"{son}.mp4", son))

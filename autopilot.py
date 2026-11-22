#!/usr/bin/env python3
"""Tam otomatik döngü (GitHub Actions'ta da çalışır):
render edilmemiş konu yoksa senaryo yaz → videoyu üret → GitHub Release'e koy → (açıksa) YouTube'a yükle.
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "engine"))
import make_video  # noqa: E402

STATE = os.path.join(ROOT, "state", "done.json")
done = json.load(open(STATE)) if os.path.exists(STATE) else []


def pending():
    for p in sorted(glob.glob(os.path.join(ROOT, "topics", "*.json"))):
        if json.load(open(p, encoding="utf-8"))["id"] not in done:
            return p



def build_comment(d):
    """Konuya göre yorum: meta.comment varsa onu, yoksa outro sorusundan otomatik üret."""
    meta = d.get("meta", {})
    if meta.get("comment"):
        return meta["comment"]
    import re
    say = d.get("outro", {}).get("say", "")
    soru = next((c.strip() for c in re.split(r"(?<=[?])\s+", say) if c.strip().endswith("?")), "")
    if not soru:
        soru = f"{d['title']} hakkında ne düşünüyorsun?"
    cap = meta.get("caption", "")
    em = next((ch for ch in reversed(cap) if ord(ch) > 0x2600 and not 0xFE00 <= ord(ch) <= 0xFE0F and ch != "\u200d"), "💡")
    kapanis = [
        "👇 Cevabını aşağıya yaz, merak ediyoruz!\n🔎 Bir sonraki videoda hangi konuyu görmek istersin? Önerini bırak.",
        "👇 Yorumlarda buluşalım!\n📚 Sen bu konuda başka ne biliyorsun? Bildiğin ilginç bir bilgiyi paylaş.",
        "👇 Cevabını yaz, diğer yorumlara da göz at!\n💭 Hangi konuyu merak ediyorsun? Yaz, belki sıradaki video o olur.",
    ]
    k = kapanis[sum(map(ord, d["id"])) % len(kapanis)]
    return f"{em} {soru}\n\n{k}"


spec = pending()
if not spec:
    r = subprocess.run([sys.executable, os.path.join(ROOT, "scriptgen.py")], capture_output=True, text=True)
    print(r.stdout, r.stderr)
    spec = pending()
    if not spec:
        sys.exit("Yeni senaryo yok: topics_queue.txt boş olabilir.")

d = json.load(open(spec, encoding="utf-8"))
video = make_video.make(spec)
meta = d.get("meta", {})
title = meta.get("title") or f"{d['title']} #shorts"
desc = f"{meta.get('caption', d['title'])}\n\n{' '.join(meta.get('hashtags', ['#shorts']))}"

if os.environ.get("GITHUB_ACTIONS"):
    srt = video[:-4] + ".srt"
    subprocess.run(["gh", "release", "create", d["id"], video, srt, "--title", d["title"], "--notes", desc], check=False)

if os.environ.get("YT_UPLOAD") == "1" and os.environ.get("YT_REFRESH_TOKEN"):
    import youtube
    vid = youtube.upload(video, title, desc, [h.lstrip("#") for h in meta.get("hashtags", [])])
    print("YouTube:", f"https://youtube.com/shorts/{vid}")
    if os.environ.get("YT_COMMENT", "1") != "0":
        try:
            text = build_comment(d)
            cid = youtube.comment(vid, text)
            print("Yorum yazildi:", cid, "\n" + text)
        except Exception as e:  # yorum hatası videoyu/durumu bozmasın
            print("UYARI - yorum yazilamadi:", e)

done.append(d["id"])
os.makedirs(os.path.dirname(STATE), exist_ok=True)
json.dump(done, open(STATE, "w"), indent=1)

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
from engine.timeline import nesne_kontrol
nesne_kontrol(d)  # ses üretilmeden önce: yanlış nesne varsa kota harcanmasın
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
    srt = video[:-4] + ".srt"
    if os.environ.get("YT_CAPTION", "1") != "0" and os.path.exists(srt):
        try:
            print("Altyazi yuklendi:", youtube.caption(vid, srt))
        except Exception as e:  # altyazı hatası videoyu/durumu bozmasın
            print("UYARI - altyazi yuklenemedi:", e)

def ig_sirasi():
    """Instagram'a günde 1 video: Türkiye saatiyle 15:00'ten sonra biten ilk video."""
    import datetime
    simdi = datetime.datetime.utcnow() + datetime.timedelta(hours=3)
    son = os.path.join(ROOT, "state", "ig_son.txt")
    bugun = simdi.date().isoformat()
    if simdi.hour < int(os.environ.get("IG_SAAT") or 15):
        print("Instagram: saat", simdi.strftime("%H:%M"), "- aksam videosu degil, atlandi.")
        return False
    if os.path.exists(son) and open(son).read().strip() == bugun:
        print("Instagram: bugun zaten paylasildi, atlandi.")
        return False
    return True


if os.environ.get("IG_TOKEN") and os.environ.get("IG_UPLOAD", "1") != "0" and os.environ.get("GITHUB_ACTIONS") \
        and ig_sirasi():
    try:
        import instagram
        ig_id = instagram.publish_reel(video, instagram.build_caption(d), d["id"])
        print("Instagram:", ig_id)
        import datetime
        open(os.path.join(ROOT, "state", "ig_son.txt"), "w").write(
            (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).date().isoformat())
        if os.environ.get("IG_COMMENT", "1") != "0":
            try:
                print("Instagram yorum:", instagram.comment(ig_id, build_comment(d)))
            except Exception as e:  # noqa
                print("UYARI - Instagram yorumu yazilamadi:", e)
        if os.environ.get("IG_STORY", "1") != "0":
            try:
                print("Instagram hikaye:", instagram.publish_story(video, d["id"]))
            except Exception as e:  # hikâye hatası Reels'i bozmasın
                print("UYARI - Instagram hikayesi paylasilamadi:", e)
    except Exception as e:  # Instagram hatası YouTube'u/durumu bozmasın
        print("UYARI - Instagram'a yuklenemedi:", e)

done.append(d["id"])
os.makedirs(os.path.dirname(STATE), exist_ok=True)
json.dump(done, open(STATE, "w"), indent=1)

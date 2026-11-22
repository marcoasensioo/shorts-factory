#!/usr/bin/env python3
"""Sadece ses testi: sıradaki senaryonun anlatımını seslendirir, video yapmaz, YouTube'a yüklemez,
konuyu 'yapıldı' saymaz. Çıktı: ses_testi/ klasöründe mp3 (Actions sayfasından indirilir)."""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "engine"))
import make_video  # noqa: E402
import voice  # noqa: E402

done = json.load(open(os.path.join(ROOT, "state", "done.json")))
spec = next((json.load(open(p, encoding="utf-8")) for p in sorted(glob.glob(os.path.join(ROOT, "topics", "*.json")))
             if json.load(open(p, encoding="utf-8"))["id"] not in done), None)
if not spec:
    sys.exit("Sırada senaryo yok.")
print("Test edilen senaryo:", spec["title"])
out = os.path.join(ROOT, "ses_testi")
os.makedirs(out, exist_ok=True)
texts = make_video.narration(spec)
vcfg = spec.get("voice", {})
mp3s = voice.fetch_segments(texts, os.path.join(out, "parcalar"), vcfg)
wav = os.path.join(out, "ses.wav")
voice.build_voice(texts, mp3s, vcfg.get("speed", 1.28), vcfg.get("gap", 0.18), 0.25, wav)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-b:a", "192k",
                os.path.join(out, f"ses-testi-{spec['id']}.mp3")], check=True)
os.remove(wav)
print("Hazır: Actions sayfasında en alttaki 'ses-testi' dosyasını indir.")

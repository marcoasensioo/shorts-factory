#!/usr/bin/env python3
"""Sırada 3'ten az senaryo kalınca depoda bir 'issue' açar (GitHub sana e-posta gönderir).
Yeni senaryolar eklenip sayı 3'e çıkınca uyarıyı kendiliğinden kapatır."""
import glob
import json
import os
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
SINIR = 3
BASLIK = "⚠️ Senaryolar azaldı"
SAHIP = os.environ.get("GITHUB_REPOSITORY_OWNER", "")

done = json.load(open(os.path.join(ROOT, "state", "done.json")))
kalan = [json.load(open(p, encoding="utf-8"))["title"] for p in sorted(glob.glob(os.path.join(ROOT, "topics", "*.json")))
         if json.load(open(p, encoding="utf-8"))["id"] not in done]
print("Sirada bekleyen senaryo:", len(kalan))


def gh(*a):
    return subprocess.run(["gh", *a], capture_output=True, text=True)


acik = gh("issue", "list", "--state", "open", "--search", f"in:title {BASLIK}", "--json", "number,title")
acik = [i for i in json.loads(acik.stdout or "[]") if i["title"].startswith(BASLIK)]

if len(kalan) < SINIR:
    if acik:
        print("Uyari zaten acik: #", acik[0]["number"])
    else:
        gunde = 2
        liste = "\n".join(f"- {t}" for t in kalan) or "- (hiç kalmadı, yeni video üretilemeyecek!)"
        govde = (f"@{SAHIP} Sırada **{len(kalan)}** senaryo kaldı "
                 f"(yaklaşık {len(kalan) / gunde:g} günlük video).\n\nKalanlar:\n{liste}\n\n"
                 "Claude'dan yeni senaryolar isteyip `topics/` klasörüne yükle. "
                 "Sayı 3'e çıkınca bu uyarı kendiliğinden kapanır.")
        r = gh("issue", "create", "--title", f"{BASLIK} ({len(kalan)} kaldı)", "--body", govde)
        print("Uyari acildi:", r.stdout, r.stderr)
else:
    for i in acik:
        gh("issue", "close", str(i["number"]), "--comment", f"Yeni senaryolar eklendi, sırada {len(kalan)} senaryo var. ✅")
        print("Uyari kapatildi: #", i["number"])

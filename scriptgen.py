#!/usr/bin/env python3
"""Konu kuyruğundan (topics_queue.txt) yeni video senaryosu üretir → topics/<id>.json

Claude API kullanır (ANTHROPIC_API_KEY). Üretilen her JSON, make_video.py ile doğrudan videoya dönüşür.
Kullanım:
  python scriptgen.py                 # kuyruktaki ilk konuyu işler ve kuyruktan düşer
  python scriptgen.py "Türkiye'nin en yüksek 10 volkanı"
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(ROOT, "topics_queue.txt")
MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")

EXAMPLE = json.load(open(os.path.join(ROOT, "topics", "turkiyenin-en-yuksek-10-dagi.json"), encoding="utf-8"))

PROMPT = """Sen viral Türkçe bilgi videoları (YouTube Shorts / Reels / TikTok) yazan bir senaristsin.
Konu: "{topic}"

Görsel şablon "countdown3d": her madde, yüksekliği sayısal değere göre ölçeklenen 3D bir yeryüzü şekli
(dağ/volkan/tepe) olarak çizilir, Türkiye haritasında konumu gösterilir. Bu yüzden konu, Türkiye'deki
konumu olan ve sayısal değeri olan 10 doğal yer sıralaması olmalı. Değilse konuyu bu kalıba en yakın
şekle uyarla.

Kurallar:
- SADECE doğruluğundan emin olduğun, kaynaklarda yaygın geçen bilgiler. Emin değilsen o maddeyi alma.
- Kanca (hook.say): ilk 2 saniyede şaşırtan, merak uyandıran tek cümle + "İşte ..." cümlesi.
- Her madde "say" metni 8-12 kelime, sıra sayısıyla başlar ("Onuncu sırada, ...", "Dokuzuncu, ...")
  ve rakamla biten değerle biter ("... 3524 metre."). Rakamları rakamla yaz, nokta koyma.
- Birinci madde için gerilim: "Ve birinci: ..." diye başlat.
- Toplam anlatım en fazla 150 kelime (yaklaşık 60 saniye).
- fact: en fazla 34 karakter, region: "Bölge · İl" biçiminde.
- shape: "volcano" ya da "alpine". seed: farklı tam sayılar. lat/lon: ondalık derece.
- outro.say: izleyiciyi yoruma çağıran soru + takip çağrısı.
- meta.title: YouTube başlığı (merak uyandıran, en fazla 70 karakter, sonunda #shorts).
- meta.caption: platform açıklaması (1-2 cümle, emoji serbest); meta.hashtags: 5-8 Türkçe etiket.
- id: Türkçe karaktersiz kebab-case.

Aşağıdaki örnekle AYNI şemada, sadece geçerli JSON döndür:
{example}
"""


def slug(s):
    s = s.replace("ı", "i").replace("İ", "i")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def ask_github_models(prompt):
    """GitHub Actions içinde ücretsiz (GitHub Models, GITHUB_TOKEN ile)."""
    req = urllib.request.Request(
        "https://models.github.ai/inference/chat/completions",
        data=json.dumps({"model": os.environ.get("GH_MODEL", "openai/gpt-4.1"), "temperature": 0.4,
                         "messages": [{"role": "user", "content": prompt}]}).encode(),
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)["choices"][0]["message"]["content"]


def ask_claude(prompt):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return ask_github_models(prompt)
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps({"model": MODEL, "max_tokens": 4000,
                         "messages": [{"role": "user", "content": prompt}]}).encode(),
        headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)["content"][0]["text"]


def validate(d):
    assert len(d["items"]) >= 5, "en az 5 madde"
    for it in d["items"]:
        for k in ("rank", "name", "value", "region", "lat", "lon", "shape", "seed", "fact", "say"):
            assert k in it, f"eksik alan: {k}"
        assert 35 < it["lat"] < 43 and 25 < it["lon"] < 45.5, f"Türkiye dışı konum: {it['name']}"
    d["items"].sort(key=lambda i: -i["rank"])
    words = len((d["hook"]["say"] + " " + " ".join(i["say"] for i in d["items"]) + " " + d["outro"]["say"]).split())
    assert words <= 175, f"anlatım çok uzun ({words} kelime)"
    d.setdefault("voice", {"engine": "gtts", "lang": "tr", "speed": 1.28, "gap": 0.18})
    d.setdefault("template", "countdown3d")
    return d


def generate(topic):
    ex = {k: v for k, v in EXAMPLE.items() if k != "sources"}
    for attempt in range(3):
        txt = ask_claude(PROMPT.format(topic=topic, example=json.dumps(ex, ensure_ascii=False)))
        m = re.search(r"\{.*\}", txt, re.S)
        try:
            d = validate(json.loads(m.group()))
            d["id"] = slug(d.get("id") or topic)
            path = os.path.join(ROOT, "topics", f"{d['id']}.json")
            json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            return path
        except Exception as e:  # noqa
            print(f"deneme {attempt + 1} geçersiz: {e}")
    raise SystemExit("Geçerli senaryo üretilemedi.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        topic = " ".join(sys.argv[1:])
    else:
        lines = [l for l in open(QUEUE, encoding="utf-8").read().splitlines() if l.strip()] if os.path.exists(QUEUE) else []
        if not lines:
            sys.exit("Kuyruk boş: topics_queue.txt dosyasına konu ekleyin.")
        topic = lines[0]
        open(QUEUE, "w", encoding="utf-8").write("\n".join(lines[1:]) + "\n")
    print(generate(topic))

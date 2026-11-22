"""Seslendirme: Microsoft Edge nöral ses (varsayılan, ücretsiz, kelime zamanlı) ya da Google TTS (yedek).

Akış:
  1) Her anlatım parçası için Google TTS'ten mp3 alınır (önbelleğe yazılır).
  2) Baş/son sessizlik kırpılır, uzun duraklar kısaltılır, tempo artırılır (perde korunur).
  3) Türkçede her hecede tam bir ünlü olduğu için, kelime süreleri ünlü sayısına göre
     dağıtılır; noktalama ile ayrılmış öbekler, sesteki gerçek duraklarla eşleştirilir.
     Böylece TTS zaman damgası vermese de karaoke altyazı senkronu tutarlı olur.
"""
import base64
import json
import os
import re
import subprocess

import numpy as np

SR = 48000
VOWELS = set("aeıioöuüâîûAEIİOÖUÜÂÎÛ")

# ---------------------------------------------------------------- sayı -> yazı
_ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]


def tr_number(n: int) -> str:
    if n == 0:
        return "sıfır"
    parts = []
    for div, name in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        q, n = divmod(n, div)
        if q:
            parts.append(name if (q == 1 and name == "bin") else f"{tr_number(q)} {name}")
    h, n = divmod(n, 100)
    if h:
        parts.append("yüz" if h == 1 else f"{_ONES[h]} yüz")
    t, o = divmod(n, 10)
    if t:
        parts.append(_TENS[t])
    if o:
        parts.append(_ONES[o])
    return " ".join(parts)


def syllables(word: str) -> int:
    w = re.sub(r"\d+", lambda m: tr_number(int(m.group())), word)
    return max(1, sum(c in VOWELS for c in w))


# ---------------------------------------------------------------- TTS motorları
def synth_gtts(text, lang, path):
    from gtts import gTTS
    gTTS(text, lang=lang).save(path)


def synth_gcloud(text, lang, path, voice_name=None):
    """Google Cloud Text-to-Speech (daha doğal ses). GOOGLE_TTS_API_KEY gerekir."""
    import urllib.request
    key = os.environ["GOOGLE_TTS_API_KEY"]
    body = {
        "input": {"text": text},
        "voice": {"languageCode": "tr-TR", "name": voice_name or "tr-TR-Wavenet-E"},
        "audioConfig": {"audioEncoding": "MP3", "sampleRateHertz": 48000},
    }
    req = urllib.request.Request(
        f"https://texttospeech.googleapis.com/v1/text:synthesize?key={key}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        audio = json.load(r)["audioContent"]
    open(path, "wb").write(base64.b64decode(audio))


EDGE_VOICE = "tr-TR-AhmetNeural"   # kadın ses için: tr-TR-EmelNeural


def synth_edge(text, path, voice=None, rate="+8%", pitch="+0Hz"):
    """Edge nöral TTS: mp3 + kelime sınırları (path + '.words.json')."""
    import asyncio
    import edge_tts

    async def run():
        kw = dict(rate=rate, pitch=pitch)
        try:
            com = edge_tts.Communicate(text, voice or EDGE_VOICE, boundary="WordBoundary", **kw)
        except TypeError:
            com = edge_tts.Communicate(text, voice or EDGE_VOICE, **kw)
        audio, words = bytearray(), []
        async for ch in com.stream():
            if ch["type"] == "audio":
                audio.extend(ch["data"])
            elif ch["type"] == "WordBoundary":
                t0 = ch["offset"] / 1e7
                words.append({"w": ch["text"], "t0": round(t0, 3), "t1": round(t0 + ch["duration"] / 1e7, 3)})
        if not audio:
            raise RuntimeError("Edge TTS ses döndürmedi")
        open(path, "wb").write(audio)
        json.dump(words, open(path + ".words.json", "w", encoding="utf-8"), ensure_ascii=False)
    asyncio.run(run())


def fetch_segments(texts, cache_dir, voice_cfg):
    os.makedirs(cache_dir, exist_ok=True)
    engine = os.environ.get("TTS_ENGINE", voice_cfg.get("engine", "edge"))
    if engine == "gtts" and not voice_cfg.get("force_gtts"):
        engine = "edge"  # eski senaryolar da yeni sesi kullansın
    if engine == "gtts" and os.environ.get("GOOGLE_TTS_API_KEY"):
        engine = "gcloud"
    paths = []
    for i, t in enumerate(texts):
        p = os.path.join(cache_dir, f"seg{i:02d}.mp3")
        meta = p + ".txt"
        if not (os.path.exists(p) and os.path.exists(meta) and open(meta, encoding="utf-8").read() == t):
            if os.path.exists(p) and not os.path.exists(meta):
                pass  # önceden indirilmiş (ör. tarayıcıdan) dosya: olduğu gibi kullan
            elif engine == "edge":
                try:
                    synth_edge(t, p, voice_cfg.get("edge_voice"), voice_cfg.get("edge_rate", "+8%"),
                               voice_cfg.get("edge_pitch", "+0Hz"))
                except Exception as e:  # noqa — ağ/servis sorunu: Google TTS'e düş
                    print("Edge TTS başarısız, gTTS kullanılıyor:", e)
                    engine = "gtts"
                    synth_gtts(t, voice_cfg.get("lang", "tr"), p)
                    if os.path.exists(p + ".words.json"):
                        os.remove(p + ".words.json")
            elif engine == "gcloud":
                synth_gcloud(t, voice_cfg.get("lang", "tr"), p, voice_cfg.get("gcloud_voice"))
            else:
                synth_gtts(t, voice_cfg.get("lang", "tr"), p)
            open(meta, "w", encoding="utf-8").write(t)
        paths.append(p)
    return paths


# ---------------------------------------------------------------- ses işleme
def decode(path, tempo=1.0):
    af = f"atempo={tempo}" if abs(tempo - 1) > 1e-3 else "anull"
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-af", af, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def speech_mask(x, thresh_db=-42, win=0.02):
    n = int(SR * win)
    m = len(x) // n
    rms = np.sqrt(np.mean(x[: m * n].reshape(m, n) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms + 1e-12)
    return db > thresh_db, n


def regions(mask, n, min_gap=0.11):
    """Konuşma bölgeleri (saniye), min_gap'ten kısa sessizlikler birleştirilir."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i]); start = None
    if start is not None:
        out.append([start, len(mask)])
    merged = []
    for r in out:
        if merged and (r[0] - merged[-1][1]) * n / SR < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(a * n / SR, b * n / SR) for a, b in merged if (b - a) * n / SR > 0.06]


def tighten(x, max_pause=0.13, pad=0.03):
    mask, n = speech_mask(x)
    regs = regions(mask, n, min_gap=0.05)
    if not regs:
        return x
    pieces = []
    for i, (a, b) in enumerate(regs):
        a = max(0, int((a - pad) * SR)); b = min(len(x), int((b + pad) * SR))
        pieces.append(x[a:b])
        if i < len(regs) - 1:
            gap = regs[i + 1][0] - regs[i][1]
            pieces.append(np.zeros(int(min(gap, max_pause) * SR), np.float32))
    y = np.concatenate(pieces)
    fade = int(0.008 * SR)
    y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    return y


def word_timings(text, x, offset):
    """Metni öbeklere böler, sesteki duraklarla eşler, kelimeye zaman verir."""
    words = text.split()
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[,.:;!?]$", w):
            phrases.append(cur); cur = []
    if cur:
        phrases.append(cur)
    mask, n = speech_mask(x)
    regs = regions(mask, n, min_gap=0.09)
    # öbek sayısı kadar bölgeye indir: hece oranlarına en iyi uyan durak kombinasyonunu seç
    if len(regs) > len(phrases) and len(phrases) > 1:
        from itertools import combinations
        syl = np.array([sum(syllables(w) for w in p) for p in phrases], float)
        exp = syl / syl.sum()
        span = regs[-1][1] - regs[0][0]
        best, best_err = None, 1e9
        cands = list(range(1, len(regs)))
        if len(cands) <= 14:
            for cut in combinations(cands, len(phrases) - 1):
                b = [0, *cut, len(regs)]
                durs = np.array([regs[b[k + 1] - 1][1] - regs[b[k]][0] for k in range(len(phrases))])
                gapw = sum(regs[c][0] - regs[c - 1][1] for c in cut)  # uzun duraklar tercih edilir
                err = np.sum((durs / span - exp) ** 2) - 0.02 * gapw
                if err < best_err:
                    best, best_err = b, err
            regs = [(regs[best[k]][0], regs[best[k + 1] - 1][1]) for k in range(len(phrases))]
    while len(regs) > len(phrases):
        gaps = [regs[i + 1][0] - regs[i][1] for i in range(len(regs) - 1)]
        i = int(np.argmin(gaps))
        regs[i] = (regs[i][0], regs[i + 1][1]); del regs[i + 1]
    if len(regs) < len(phrases):  # eşleşmedi: tüm konuşmayı tek bölge say, hecelerle böl
        total = regs[0][0] if regs else 0, regs[-1][1] if regs else len(x) / SR
        syl = [sum(syllables(w) for w in p) + 1.5 for p in phrases]
        acc, regs = total[0], []
        span = total[1] - total[0]
        for s in syl:
            d = span * s / sum(syl); regs.append((acc, acc + d)); acc += d
    out = []
    for p, (a, b) in zip(phrases, regs):
        wts = [syllables(w) + 0.35 for w in p]
        acc = a
        for w, wt in zip(p, wts):
            d = (b - a) * wt / sum(wts)
            out.append({"w": w, "t0": round(offset + acc, 3), "t1": round(offset + acc + d, 3)})
            acc += d
    return out


def build_voice(texts, mp3s, tempo, gap, lead_in, out_wav):
    """Parçaları birleştirir. Döner: segment zamanları + kelime zamanları."""
    import soundfile as sf
    track, segs, words, t = [np.zeros(int(lead_in * SR), np.float32)], [], [], lead_in
    for i, (txt, p) in enumerate(zip(texts, mp3s)):
        wj = p + ".words.json"
        if os.path.exists(wj):  # nöral ses: tempo değiştirme, kelime zamanlarını aynen kullan
            y = decode(p, 1.0)
            mask, n = speech_mask(y)
            idx = np.nonzero(mask)[0]
            a = max(0, int(idx[0] * n - 0.03 * SR)) if len(idx) else 0
            b = min(len(y), int((idx[-1] + 1) * n + 0.06 * SR)) if len(idx) else len(y)
            y = y[a:b].copy()
            shift = a / SR
            bw = json.load(open(wj, encoding="utf-8"))
            toks = txt.split()
            if len(bw) == len(toks):
                ww = [{"w": tk, "t0": round(t + max(0, x["t0"] - shift), 3), "t1": round(t + max(0, x["t1"] - shift), 3)}
                      for tk, x in zip(toks, bw)]
            else:
                ww = word_timings(txt, y, t)
        else:
            y = tighten(decode(p, tempo))
            ww = word_timings(txt, y, t)
        segs.append({"i": i, "t0": round(t, 3), "t1": round(t + len(y) / SR, 3)})
        words.append(ww)
        track.append(y)
        g = gap[i] if isinstance(gap, list) else gap
        track.append(np.zeros(int(g * SR), np.float32))
        t += len(y) / SR + g
    v = np.concatenate(track)
    v = v / (np.max(np.abs(v)) + 1e-9) * 0.89
    sf.write(out_wav, v, SR, subtype="FLOAT")
    return segs, words, len(v) / SR

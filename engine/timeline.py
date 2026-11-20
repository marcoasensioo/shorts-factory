"""Senaryo + ses zamanlamasından görsel zaman çizelgesi, altyazı öbekleri ve ses efekti olayları üretir."""
import re


def fmt_num(s):
    return re.sub(r"\d{4,}", lambda m: f"{int(m.group()):,}".replace(",", "."), s)


def caption_chunks(words, max_words=3, max_chars=18):
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        txt = " ".join(x["w"] for x in cur)
        if len(cur) >= max_words or len(txt) >= max_chars or re.search(r"[,.:;!?]$", w["w"]):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    out = []
    for i, c in enumerate(chunks):
        t1 = chunks[i + 1][0]["t0"] if i + 1 < len(chunks) else c[-1]["t1"] + 0.25
        t1 = min(t1, c[-1]["t1"] + 0.45)
        out.append({
            "t0": c[0]["t0"], "t1": round(t1, 3),
            "words": [{"w": fmt_num(re.sub(r"[,.:;]+$", "", x["w"])), "t0": x["t0"], "t1": x["t1"]} for x in c],
        })
    return out


def srt(chunks):
    def ts(t):
        h, r = divmod(t, 3600); m, s = divmod(r, 60)
        return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"
    lines = []
    for i, c in enumerate(chunks, 1):
        lines += [str(i), f"{ts(c['t0'])} --> {ts(c['t1'])}", " ".join(w["w"] for w in c["words"]), ""]
    return "\n".join(lines)


def build(spec, segs, words, total):
    items = spec["items"]
    n = len(items)
    LEAD = 0.25
    starts = [segs[k + 1]["t0"] - LEAD for k in range(n)]
    outro_start = segs[n + 1]["t0"] - LEAD
    end = segs[n + 1]["t1"] + 1.3
    scenes = [{"type": "hook", "t0": 0.0, "t1": starts[0]}]
    events = []
    # kanca
    hw = words[0]
    slam = next((w["t0"] for w in hw if w["w"].lower().startswith("işte")), hw[len(hw) // 2]["t0"])
    events += [
        {"t": 0.0, "type": "impact", "gain": 0.7},
        {"t": 0.15, "type": "pop", "gain": 0.5, "args": {"pitch": 1.2}},
        {"t": 1.1, "type": "whoosh", "gain": 0.45},
        {"t": slam - 0.32, "type": "whoosh", "gain": 0.6},
        {"t": slam, "type": "impact", "gain": 0.9},
    ]
    scenes[0]["slam"] = slam
    for k, it in enumerate(items):
        s0, s1 = starts[k], (starts[k + 1] if k + 1 < n else outro_start)
        w = words[k + 1]
        num = next((x for x in w if re.fullmatch(r"\d+[.,:!?]*", x["w"])), w[-2])
        c0, c1 = s0 + 0.9, num["t1"]
        scenes.append({"type": "item", "k": k, "t0": s0, "t1": s1, "count0": c0, "count1": c1})
        is_one = it["rank"] == 1
        if is_one:
            events.append({"t": s0 - 3.0, "type": "riser", "gain": 0.75, "args": {"d": 3.0}})
            events.append({"t": s0, "type": "boom", "gain": 1.0})
        else:
            events.append({"t": s0 - 0.38, "type": "whoosh", "gain": 0.75, "args": {"up": k % 2 == 0}})
            events.append({"t": s0 + 0.02, "type": "impact", "gain": 0.75})
        events.append({"t": s0 + 0.18, "type": "pop", "gain": 0.35, "args": {"pitch": 1.0}})
        # sayaç tıkırtısı: başta hızlı, sona doğru yavaşlayan (easeOutExpo ile uyumlu)
        steps = 16
        for j in range(steps):
            u = j / steps
            tt = c0 + (c1 - c0) * (u ** 1.8)
            events.append({"t": tt, "type": "tick", "gain": 0.32, "args": {"pitch": round(0.9 + 0.4 * u, 2)}})
        events.append({"t": c1, "type": "shimmer", "gain": 0.55 if not is_one else 0.8,
                       "args": {"base": 660 if not is_one else 990}})
    scenes.append({"type": "outro", "t0": outro_start, "t1": end})
    events.append({"t": outro_start - 0.38, "type": "whoosh", "gain": 0.7})
    for j in range(n):
        events.append({"t": outro_start + 0.5 + j * 0.09, "type": "pop", "gain": 0.3, "args": {"pitch": round(0.8 + j * 0.06, 2)}})
    events.append({"t": outro_start + 1.5, "type": "shimmer", "gain": 0.4, "args": {"base": 880}})

    def intensity(t):
        if t < starts[0]:
            return 0.35
        if t >= outro_start:
            return max(0.0, 0.5 - (t - outro_start) * 0.12)
        k = max(i for i in range(n) if starts[i] <= t)
        return min(1.0, 0.4 + 0.065 * k)

    chunks = []
    for w in words:
        chunks += caption_chunks(w)
    tl = {
        "fps": 30, "W": 1080, "H": 1920, "duration": round(end, 3),
        "title": spec["title"], "unit": spec.get("unit", "m"),
        "hook": spec["hook"], "outro": spec["outro"], "items": items,
        "scenes": scenes, "captions": chunks,
    }
    return tl, events, intensity, end

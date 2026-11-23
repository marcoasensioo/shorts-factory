"""Ortak yardımcılar."""
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



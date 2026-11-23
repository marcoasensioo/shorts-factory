#!/usr/bin/env python3
"""Instagram anahtarını 60 gün daha uzatır ve GitHub Secrets'taki IG_TOKEN'ı günceller.
GH_PAT (Secrets yazma izinli kişisel erişim anahtarı) yoksa sadece uyarı verir."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine"))
if not os.environ.get("IG_TOKEN"):
    sys.exit(print("IG_TOKEN yok, Instagram kapali.") or 0)
import instagram  # noqa: E402

try:
    yeni, sure = instagram.refresh_token()
except Exception as e:  # anahtar 24 saatten yeniyse ya da başka bir sorun varsa
    sys.exit(print("UYARI - Instagram anahtari yenilenemedi:", e) or 0)
print("::add-mask::" + yeni)
print(f"Instagram anahtari yenilendi, {sure // 86400} gun gecerli.")
if not os.environ.get("GH_PAT"):
    sys.exit(print("UYARI - GH_PAT yok: yeni anahtar kaydedilemedi, eski anahtar 60 gun sonra bitecek.") or 0)
r = subprocess.run(["gh", "secret", "set", "IG_TOKEN", "--repo", os.environ["GITHUB_REPOSITORY"], "--body", yeni],
                   capture_output=True, text=True, env={**os.environ, "GH_TOKEN": os.environ["GH_PAT"]})
print("IG_TOKEN guncellendi." if r.returncode == 0 else f"UYARI - IG_TOKEN kaydedilemedi: {r.stderr[:300]}")

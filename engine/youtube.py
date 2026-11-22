"""YouTube'a yükleme (YouTube Data API v3, OAuth yenileme anahtarı ile)."""
import json
import os
import urllib.parse
import urllib.request


def access_token():
    data = urllib.parse.urlencode({
        "client_id": os.environ["YT_CLIENT_ID"], "client_secret": os.environ["YT_CLIENT_SECRET"],
        "refresh_token": os.environ["YT_REFRESH_TOKEN"], "grant_type": "refresh_token"}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", data=data, timeout=60) as r:
        return json.load(r)["access_token"]


def upload(path, title, description, tags, privacy="public"):
    tok = access_token()
    meta = {"snippet": {"title": title[:100], "description": description[:4900], "tags": tags[:15],
                        "categoryId": "27", "defaultLanguage": "tr", "defaultAudioLanguage": "tr"},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}}
    size = os.path.getsize(path)
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=json.dumps(meta).encode(), method="POST",
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
    with urllib.request.urlopen(req, timeout=60) as r:
        loc = r.headers["Location"]
    with open(path, "rb") as f:
        put = urllib.request.Request(loc, data=f.read(), method="PUT",
                                     headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
        with urllib.request.urlopen(put, timeout=1800) as r:
            return json.load(r)["id"]


def comment(video_id, text, tries=4, wait=45):
    """Videoya kanal adına üst düzey yorum yazar (youtube.force-ssl izni gerekir).
    Yeni yüklenen video henüz işleniyorsa birkaç kez bekleyip yeniden dener."""
    import time
    import urllib.error
    body = {"snippet": {"videoId": video_id,
                        "topLevelComment": {"snippet": {"textOriginal": text[:9000]}}}}
    last = None
    for i in range(tries):
        tok = access_token()
        req = urllib.request.Request(
            "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet",
            data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["id"]
        except urllib.error.HTTPError as e:
            last = f"{e.code} {e.read().decode('utf-8', 'replace')[:400]}"
            if e.code in (401, 403) and ("insufficient" in last.lower() or "scope" in last.lower()):
                raise RuntimeError("Yorum izni yok: YT_REFRESH_TOKEN'ı youtube.force-ssl izniyle yenile. " + last)
        if i < tries - 1:
            time.sleep(wait)
    raise RuntimeError("Yorum yazılamadı: " + str(last))

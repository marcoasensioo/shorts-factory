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

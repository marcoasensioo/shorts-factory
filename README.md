**Keşif Kutusu YouTube kanalı için video yükleme aracı (YouTube API Servisleri kullanır).** [Gizlilik Politikası](PRIVACY.md)

# Shorts Factory: otomatik 3D bilgi videosu üreticisi

Varsayılan kurulum tamamen ücretsizdir: Python, ffmpeg, Chrome, gTTS (Google TTS). Senaryoları Claude Pro yazar.

Konu yaz → senaryo (Claude) → seslendirme (Google TTS) → 3D motion graphics (three.js) →
sentezlenmiş ses tasarımı → karaoke altyazı → 1080×1920, 30 fps MP4. Shorts, Reels ve TikTok'a hazır.

## Kurulum (Windows)
1. Python 3.11+ ve **ffmpeg** kurulu ve PATH'te olmalı (`winget install Gyan.FFmpeg`).
2. Klasörde:
   ```
   pip install -r requirements.txt
   python -m playwright install chromium
   ```
   (Chrome kuruluysa onu kullanır; `CHROME_PATH` ile yol verilebilir.)
3. Ekran kartın varsa render'ı çok hızlandırır: `set RENDER_GPU=1`

## Kullanım
```
python make_video.py topics/turkiyenin-en-yuksek-10-dagi.json   # tek video
python make_video.py topics/x.json --snap 2 10 30               # sadece kontrol kareleri
python scriptgen.py "Türkiye'nin en yüksek 10 volkanı"          # yeni senaryo (Claude API)
python autopilot.py                                             # kuyruktan sıradakini üret + render et
```
Çıktı: `out/<id>/<id>.mp4`, `<id>.srt` (platform altyazısı), `paylasim.txt` (açıklama + etiketler).

## Sürekli/otomatik üretim
- **Ücretsiz mod (varsayılan):** Senaryoları Claude Pro'dan iste. `SENARYO_ISTEGI.md` dosyasındaki
  metni claude.ai'ye yapıştır, gelen JSON'ları `topics/` klasörüne koy. Autopilot her çalıştığında
  render edilmemiş sıradaki konuyu üretir. Konu kalmayınca log'a yazar ve durur.
- İsteğe bağlı (ücretli): `ANTHROPIC_API_KEY` tanımlarsan `scriptgen.py`, `topics_queue.txt` dosyasından
  kendiliğinden senaryo yazar. Bu API kullanımı Pro aboneliğinden ayrı faturalanır.
- Windows Görev Zamanlayıcısı'na günde 2 kez ekle (yönetici olmayan komut istemi yeterli):
  ```
  schtasks /Create /SC DAILY /ST 10:00 /TN "ShortsFactory-10" /TR "\"%CD%\run_autopilot.bat\""
  schtasks /Create /SC DAILY /ST 18:00 /TN "ShortsFactory-18" /TR "\"%CD%\run_autopilot.bat\""
  ```
  Kayıt: `autopilot.log`.

## Seslendirme
- Varsayılan: **gTTS** (Google Çeviri'nin TTS'i, ücretsiz, anahtar gerekmez).
- İsteğe bağlı: Google Cloud Text-to-Speech. Aylık ücretsiz kotası var, ama kart bilgisi ister. `GOOGLE_TTS_API_KEY` tanımlanırsa otomatik kullanılır
  (ses: `tr-TR-Wavenet-E`; konu dosyasında `"voice": {"gcloud_voice": "tr-TR-Chirp3-HD-..."}` ile değişir).
- Tempo `voice.speed` (varsayılan 1.28), parçalar arası boşluk `voice.gap`.

## Dosyalar
| Dosya | Görev |
|---|---|
| `engine/voice.py` | Google TTS, sessizlik kırpma, tempo, hece tabanlı kelime zamanlaması |
| `engine/timeline.py` | Sahne zamanları, altyazı öbekleri, ses efekti olayları, SRT |
| `engine/sfx.py` | whoosh, impact, boom, riser, tick, pop, shimmer + rüzgâr/pad/nabız atmosferi, ducking |
| `render/scene.js` | three.js sahnesi: prosedürel dağlar, ışık, bulut, kar, harita, kinetik tipografi |
| `engine/render.py` | Headless Chrome'da kare kare çizim, paralel parçalar, ffmpeg |

## Şablon sınırı
`countdown3d` şablonu, Türkiye'de konumu olan ve yüksekliği olan 10 doğal yer sıralaması için
tasarlandı (dağ, volkan, zirve). Farklı konu türleri (ör. nehirler, şehirler) için `render/`
altına yeni bir şablon eklemek gerekir; ses, altyazı ve otomasyon katmanı aynen kullanılır.

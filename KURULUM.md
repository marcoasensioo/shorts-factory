# Kurulum (bir kez, ~30 dk) — sonra bilgisayarın kapalıyken de çalışır

Her şey ücretsiz: GitHub (sunucu + senaryo yazan yapay zekâ), Google TTS, YouTube API.

## 1) GitHub deposu
1. github.com'a kendi hesabınla gir → sağ üst **+** → **New repository**.
2. Ad: `shorts-factory`, **Public** seç → **Create repository**.
3. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
4. Bu zip'i bilgisayarında klasöre çıkar. `shorts-factory` klasörünün **içindeki her şeyi**
   (`.github` klasörü dahil) seçip sayfaya sürükle → aşağıda **Commit changes**.
   (Windows'ta `.github` görünmüyorsa Gezgin → Görünüm → Gizli öğeler'i aç.)
5. Depoda **Settings → Actions → General → Workflow permissions** → **Read and write permissions** → Save.
6. Test: **Actions** sekmesi → **Shorts Factory** → **Run workflow**. ~15-25 dk sonra
   **Releases** bölümünde video hazır olur (telefondan indirebilirsin).

Bundan sonra her gün 09:00 ve 18:00'de kendiliğinden bir video üretir.
Konular `topics_queue.txt` dosyasından alınır; GitHub'ın ücretsiz yapay zekâsı senaryoyu yazar.
Yeni konu eklemek için GitHub'da bu dosyayı aç → kalem simgesi → her satıra bir konu yaz → Commit.

## 2) YouTube bağlantısı
1. console.cloud.google.com → üstten **Yeni proje** (ad: shorts-factory).
2. **API'ler ve Hizmetler → Kitaplık** → "YouTube Data API v3" → **Etkinleştir**.
3. **OAuth izin ekranı (Google Auth Platform)**: Uygulama adı yaz, e-postanı seç, kullanıcı türü **Harici**.
   **Kitle (Audience)** sayfasında **Uygulamayı yayınla (Publish app)** → Üretim (In production).
   (Bu adım şart; yoksa bağlantı 7 günde kopar.)
4. **İstemciler (Clients) → İstemci oluştur** → tür: **Web uygulaması** →
   Yetkili yönlendirme URI'si: `https://developers.google.com/oauthplayground` → Oluştur.
   Çıkan **Client ID** ve **Client secret**'ı bir kenara kopyala.
5. developers.google.com/oauthplayground aç → sağ üst ⚙️ → **Use your own OAuth credentials** işaretle,
   Client ID ve secret'ı yapıştır.
6. Soldaki kutuya `https://www.googleapis.com/auth/youtube.upload` yaz → **Authorize APIs** →
   YouTube kanalının hesabını seç → "doğrulanmamış uygulama" uyarısında **Gelişmiş → devam et** → İzin ver.
7. **Exchange authorization code for tokens** → çıkan **Refresh token**'ı kopyala.
8. GitHub deposu → **Settings → Secrets and variables → Actions → New repository secret**, üç tane ekle:
   `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

## 3) YouTube onayı (denetim) — ÖNEMLİ
Google, onaysız projelerin yüklediği videoları **kalıcı olarak gizli** yapar. Bu yüzden otomatik
yükleme kapalı başlar. Ücretsiz onay için şu formu doldur:
https://support.google.com/youtube/contact/yt_api_form
(Kullanım: "kendi kanalıma kendi ürettiğim videoları yükleyen kişisel otomasyon".)
Onay e-postası gelince: GitHub → **Settings → Secrets and variables → Actions → Variables** →
`YT_UPLOAD` = `1`. O andan itibaren videolar başlık + açıklama + etiketlerle kendiliğinden yüklenir.

## Notlar
- Senaryoları GitHub'ın yapay zekâsı yazar; hata yapabilir. Ara sıra Releases'taki videolara göz at.
- İstersen Claude'dan `SENARYO_ISTEGI.md` ile daha güvenilir senaryolar alıp `topics/` klasörüne yükleyebilirsin; önce onlar kullanılır.

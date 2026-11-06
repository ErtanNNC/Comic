# Panel: çizgi roman okuyucu

Google Drive'daki (veya telefondaki) CBZ ve PDF çizgi romanları indirip cihazda saklayan ve rahat okutan bir mobil uygulama. Expo (SDK 58) ve Expo Router ile yazıldı. iOS ve Android'de çalışır.

## Çalıştırma

```bash
npm install
npx expo start          # QR kodu Expo Go ile okut
npm test                # dosya adı / Drive / CBZ açma testleri
npm run typecheck && npx expo lint
```

Kullanılan tüm native modüller Expo Go içinde var, o yüzden ilk denemeler için development build gerekmiyor.

## Neler var (v0.1)

**Kütüphane**
- "Okumaya devam et" satırı: yarım kalan sayılar, son okunan en başta.
- Sayılar seri halinde gruplanır. Seri adı ve sayı numarası dosya adından çıkarılır (`Batman_012_(2016).cbz` → *Batman #12*). Drive klasöründen indirilenlerde seri adı olarak klasör adı kullanılır.
- Seri sayfası: sayı sırası, ilerleme çubukları, "Oku / Devam et" (ilk okunmamış sayıyı açar). Uzun basınca okundu işaretleme ve cihazdan silme seçenekleri çıkar.

**İndirme**
- Google Drive **dosya** bağlantısı → doğrudan indirilir.
- Google Drive **klasör** bağlantısı → içerik listelenir, alt klasörlerde gezilebilir, sayılar seçilip toplu indirilir. API anahtarı gerekmez (herkese açık `embeddedfolderview` sayfası okunur).
- Telefondan CBZ/ZIP/PDF seçme.
- İndirme kuyruğu: ilerleme yüzdesi, hata mesajı, tekrar deneme. Drive kota sayfası ya da izin hatası döndüğünde bu algılanır ve açıklanır.
- **PDF:** cizgiarsiv'deki PDF'ler sayfa başına bir JPEG resimden oluşuyor. Bu JPEG'ler PDF'in içinden olduğu gibi çıkarılır; PDF render motoru ya da native modül gerekmez ve Expo Go'da da çalışır. Örnek bir sayı (30 sayfa, 41 MB) yaklaşık 0,5 saniyede açıldı ve çıktı `pdfimages` aracıyla bayt bayt aynı.
- Arşivler akış halinde (1 MB'lık parçalarla) açılır, böylece büyük CBZ dosyaları belleği doldurmaz. Sayfalar `Documents/comics/<id>/` altında tutulur ve okumak için internet gerekmez.

**Okuyucu** (Marvel Unlimited'dan esinlenildi)
- Tam ekran, siyah zemin. Ekranın ortasına dokununca menü açılır ya da kapanır.
- Kenarlara dokunarak veya kaydırarak sayfa çevrilir.
- Parmakların altındaki noktaya doğru iki parmakla yakınlaştırma, yakınken kaydırma, çift dokunuşla o bölgeye 2.5x yakınlaşma ve geri çıkma. Bu, "Smart Panels"in hafif bir karşılığı.
- **Sayfa** ve **Dikey (webtoon)** okuma modları, manga için **sağdan sola** seçeneği.
- Alt kısımda küçük resim şeridi ve sayfa sayacı. Son sayfada **Sonraki sayı →** düğmesi çıkar.
- İlerleme otomatik kaydedilir ve okurken ekran kapanmaz.

## Araştırma notları

**cizgiarsiv.com:** bu geliştirme ortamının ağ politikası siteye ve drive.google.com'a erişimi engelledi, bu yüzden site doğrudan incelenemedi. Uygulama hiçbir siteye bağımlı olmayacak şekilde tasarlandı: herhangi bir herkese açık Drive dosya veya klasör bağlantısıyla çalışır.

**Marvel Unlimited'dan alınanlar:**
| Marvel Unlimited | Panel |
|---|---|
| Continue Reading rafı | "Okumaya devam et" satırı |
| Seri / sayı sıralaması, "next issue" | Seri gruplama, son sayfada "Sonraki sayı" |
| Smart Panels (panel panel okuma) | Çift dokunuşla bölgeye yakınlaşma (tam panel algılama yol haritasında) |
| Infinity Comics (dikey kaydırma) | Dikey okuma modu |
| Çevrimdışı indirme (limitli, kullanıcılar sorun yaşıyor) | Sınırsız, tamamen yerel depolama |
| Okuma listeleri, okundu işaretleri | Okundu/okunmadı işaretleri |

## Yol haritası

1. **CBR (RAR) ve metin/vektör tabanlı PDF desteği.** Bunlar için native modül gerekiyor (development build).
2. **Akıllı panel algılama:** sayfadaki panel kenarlarını bularak panel panel okuma.
3. Arka planda indirme ve indirmeyi duraklatıp sürdürme (`File.createDownloadTask`).
4. Arama, okuma listeleri, yazara ve yayınevine göre filtreleme.
5. İsteğe bağlı bulut senkronizasyonu (Supabase): okuma ilerlemesi cihazlar arasında taşınır.

> Not: Yalnızca indirme hakkına sahip olduğun içerikleri indir.

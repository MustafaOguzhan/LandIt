# finn.no watcher (kişisel araç, LandIt ürününden bağımsız)

Her ~5 dakikada `searches.json`'daki finn.no aramalarına bakar. **Yeni** çıkan
bir ilan, o aramadaki güncel medyan fiyatın `minDiscountPct` % altındaysa
(veya `maxPrice`'ın altındaysa) sana e-posta atar.

## Kurulum
1. GitHub repo → Settings → Secrets and variables → Actions → şu 3 secret:
   - `RESEND_API_KEY`, `FEEDBACK_FROM_EMAIL` (LandIt'te kullandığınla aynı)
   - `ALERT_TO_EMAIL` (bildirimin geleceği adres)
2. `searches.json`'ı düzenle: finn.no'da aramayı yap, filtreleri ayarla,
   tarayıcıdaki URL'yi `url` alanına yapıştır.
3. **Bu dosyalar varsayılan branch'e (main) merge edilmeli** — GitHub zamanlanmış
   iş akışlarını sadece orada çalıştırır. Sonra Actions → "finn.no watcher" →
   Run workflow ile elle bir kez başlat.

## Notlar
- İlk çalışma sadece mevcut ilanları kaydeder (bildirim atmaz).
- Medyan için aramada en az 8 fiyatlı ilan gerekir; azsa yalnızca `maxPrice` kullanılır.
- `minPrice` 1 kr'lık "fiyat sorunuz" ilanlarını eler.
- finn.no resmi bir API sunmuyor; araç sitenin dahili arama JSON'unu kullanır.
  finn.no yapıyı değiştirirse çalışma **hata verir** (Actions'ta kırmızı + GitHub'dan mail).

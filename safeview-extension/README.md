# SafeView — Görsel Filtresi (Chrome / Edge / Brave eklentisi)

Web sayfalarındaki görselleri ve videoları **cihazınızın içinde** tarar; açık veya
revealing (çıplaklık, mayo/iç çamaşırı vb.) bulduğu her şeyi otomatik bulanıklaştırır.
Hiçbir görüntü internete gönderilmez ve hesap gerekmez.
(LandIt ürününden bağımsızdır; istenirse ayrı bir depoya taşınabilir.)

## Kurulum (geliştirici olmadan)
1. Chrome'da `chrome://extensions` adresini açın, sağ üstten **Geliştirici modu**'nu açın.
2. **Paketlenmemiş öğe yükle**'ye basın ve bu klasördeki `dist/` klasörünü seçin.
3. Sayfaları yenileyin. İlk açılışta model yüklenirken görseller birkaç saniye bulanık kalır.

Eklenti ikonundan filtreyi açıp kapatabilir ve hassasiyeti değiştirebilirsiniz.

## Nasıl çalışır
- **Güvenli varsayılan:** her görsel önce bulanıktır; yalnızca model "güvenli" derse açılır.
  Model çalışmazsa veya görsel doğrulanamazsa (ör. bazı çapraz-kaynak videolar) bulanık kalır.
- Model: NSFWJS (MobileNetV2), eklentinin içinde paketli, WebGL ile yerel çalışır.
  `Porn + Hentai + Sexy` olasılık toplamı eşiği aşarsa bulanıklaştırılır
  (Yüksek ≥ %25, Orta ≥ %45, Düşük ≥ %65).
- Kapsam: `<img>`, CSS arka plan görselleri, `<video>` (her ~0,6 sn'de bir kare örneklenir).

## Bilinen sınırlar (dürüstçe)
- Hiçbir sınıflandırıcı %100 değildir: bazı görseller kaçabilir, bazı masum görseller bulanıklaşabilir.
- Videolarda kareler arasında (~0,6 sn) kısa bir açık kare görünebilir.
- Animasyonlu GIF'te yalnızca ilk kare taranır. Shadow DOM içindeki görseller ve `<canvas>` kapsanmaz.
- Sadece tarayıcıda çalışır; mobil uygulamalar, masaüstü programları veya gerçek hayat için değil.

## Geliştirme
```
npm install
node make-icons.mjs   # ikonlar (bir kez)
npm run build         # src/ -> dist/
```

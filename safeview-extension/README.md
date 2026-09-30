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
- **Sinyal 1 — NSFW sınıflandırıcı** (NSFWJS/MobileNetV2): görseli parçalara bölüp tarar, en riskli parçanın
  Porn+Sexy+Hentai olasılığını alır.
- **Sinyal 2 — Vücut açıklığı analizi** (Human: kişi bulma + 17 nokta vücut iskeleti + yüz): kişi bulunur, omuz/kol/gövde/bacak
  bölgeleri çıkarılır, her bölgede ten renkli piksel oranı ölçülür (ten rengi kişinin yüzünden kalibre edilir).
  Kolsuz üst, kırpık üst, şort, kısa elbise gibi "açık ama çıplak olmayan" görselleri yakalar. Ayrı bir çerçevede çalışır.
- Hassasiyet (herhangi biri eşiği aşarsa gizlenir):
  **Yüksek** = risk ≥ %3 veya açıklık ≥ %15 veya gövde ≥ %25; **Orta** = %15 / %28 / %40; **Düşük** = %50 / %50 / %65.
  Ayar değişince açık sayfadaki görseller de anında yeniden değerlendirilir.
- Hepsi eklentinin içinde paketli modellerle, WebGL ile (olmazsa işlemciyle) yerel çalışır.
- Kapsam: `<img>`, CSS arka plan görselleri, `<video>` (her ~0,6 sn'de bir kare örneklenir).

## Bilinen sınırlar (dürüstçe)
- **Erkek/kadın ayrımı yapılmaz.** Denediğimiz cinsiyet modeli güvenilir çıkmadı, kapatıldı. Kolsuz/üstsüz erkekler de gizlenebilir.
- Vücut analizi görsel başına birkaç yüz ms'den birkaç saniyeye kadar sürebilir (ekran kartına göre); görseller sırayla açılır.
- Kalabalık (çok kişili) fotoğraflarda kişiler tek tek değil kaba analiz edilir; ten rengine yakın arka planlar yanlış alarm verebilir.
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

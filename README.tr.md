[English](README.md) | **Türkçe**

# Watchtower

Bilgisayarınızın (ya da sunucunuzun) ne durumda olduğunu tarayıcıdan canlı izlemenizi sağlayan küçük bir panel. CPU, RAM ve ağ trafiğini saniyeler içinde gösterir, belirlediğiniz servislerin ayakta olup olmadığını kontrol eder, bir şey ters giderse olay günlüğüne yazar ve isterseniz Discord'a haber verir.

<!-- Ekran görüntüsünü docs/screenshot.png olarak ekleyince bu satırı açın:
![Watchtower](docs/screenshot.png)
-->

## Neden yaptım?

Otomasyon ve bot sistemleriyle çalışınca şunu öğreniyorsunuz: sessizce çöken bir sistem, hata veren bir sistemden daha tehlikeli. Bu proje o fikrin küçük ve bağımsız bir hali. Ölçüm, canlı iletim, servis kontrolü ve uyarı mantığını tek bir Node.js uygulamasında, az bağımlılıkla bir araya getiriyor.

## Neler yapıyor?

- **Canlı metrikler:** CPU, RAM, ağ indirme/yükleme hızı ve çalışma süresi, varsayılan olarak 1,5 saniyede bir güncellenir.
- **Servis kontrolü:** HTTP adreslerini ve TCP portlarını 10 saniyede bir yoklar, yanıt süresini gösterir. Bir servis çökerse ya da geri gelirse bunu günlüğe yazar.
- **Uyarılar:** CPU veya RAM eşiği aşılınca ya da bir servis yanıt vermeyince uyarı üretir. Aynı uyarı sürekli tekrarlanmasın diye varsayılan 5 dakikalık bekleme süresi vardır.
- **Discord bildirimi (isteğe bağlı):** Webhook adresi verirseniz uyarılar kanala düşer. Panelde "Alarmı test et" butonuyla hattı deneyebilirsiniz.
- **Bağlantı dayanıklılığı:** Sunucu kapanırsa sayfa yenilemeden, bekleme süresini kademeli artırarak yeniden bağlanır. Yeni açılan sekme son 60 ölçümü hazır alır, grafik boş başlamaz.
- **Arayüz dili:** Varsayılan İngilizcedir. Sağ üstteki EN/TR düğmesiyle Türkçeye geçilir, seçim tarayıcıda hatırlanır.
- **REST API:** `/health`, `/api/stats`, `/api/events`, `/api/services`.

## Nasıl çalışıyor?

```
systeminformation ──> tek ölçüm döngüsü ──> WebSocket ──> tarayıcılar (Chart.js)
servis kontrolleri ──> uyarı motoru ──────> olay günlüğü + Discord webhook
```

Ölçümü her istemci için ayrı yapmak yerine sunucuda tek bir döngü çalışır ve sonuç bağlı herkese gönderilir. Kaç sekme açık olursa olsun işletim sistemine yapılan sorgu sayısı değişmez.

## Kurulum

Node.js 20.12 veya üstü gerekir (`node -v` ile kontrol edebilirsiniz).

```bash
git clone https://github.com/bydefuse/watchtower.git
cd watchtower
npm install
npm start
```

Sonra tarayıcıda `http://localhost:3000` adresini açın. Ayar yapmak istemezseniz başka bir şeye gerek yok. Ayarlar için `.env.example` dosyasını `.env` olarak kopyalayın.

> Arayüz Tailwind CSS ve Chart.js'i CDN'den yükler, bu yüzden panelin görünmesi için internet bağlantısı gerekir.

## Yapılandırma

| Değişken | Varsayılan | Ne işe yarar? |
|---|---|---|
| `PORT` | `3000` | Sunucunun portu |
| `HOST` | `127.0.0.1` | Dinlenen adres. Ağdan erişim için `0.0.0.0` |
| `INTERVAL_MS` | `1500` | Ölçüm aralığı (ms) |
| `CPU_ALERT` | `90` | CPU uyarı eşiği (%) |
| `RAM_ALERT` | `90` | RAM uyarı eşiği (%) |
| `ALERT_COOLDOWN_SEC` | `300` | Aynı uyarının yeniden gönderilme süresi |
| `DISCORD_WEBHOOK_URL` | boş | Uyarıların gideceği webhook |

### İzlenecek servisler

`services.json` dosyasına istediğiniz kadar kayıt ekleyebilirsiniz:

```json
[
  { "name": "Web sitem", "type": "http", "target": "https://example.com" },
  { "name": "MySQL", "type": "tcp", "target": "127.0.0.1:3306" }
]
```

`http` türü yanıt kodu başarılıysa, `tcp` türü port bağlantı kabul ediyorsa servisi çevrimiçi sayar. Hazır gelen listede XAMPP'taki Apache ve MySQL örnek olarak var. Sizde çalışmıyorlarsa panelde çevrimdışı görünürler, listeyi kendinize göre düzenleyin.

## WebSocket mesajları

| Mesaj | Ne zaman gelir? |
|---|---|
| `hello` | Bağlanınca bir kez: sunucu bilgisi, geçmiş ölçümler, servisler, olaylar |
| `stats` | Her ölçümde |
| `services` | Her servis kontrolünde |
| `event` | Yeni bir uyarı veya olay oluşunca |

İstemci `{"type":"test-alert"}` göndererek bildirim hattını deneyebilir.

## Sık karşılaşılan sorunlar

- **`Cannot GET /`:** `index.html` dosyası `public` klasörünün içinde değil.
- **Sayfa beyaz ve yazılar silik:** `public/style.css` ya da `public/app.js` eksik. Tarayıcıda `/style.css` ve `/app.js` adreslerini açıp kontrol edin.
- **`EADDRINUSE`:** 3000 portu başka bir uygulamada. `.env` içinde `PORT` değerini değiştirin.
- **Sürekli RAM uyarısı:** Bilgisayarınızın RAM'i gerçekten doluysa uyarı doğrudur. Eşiği `RAM_ALERT` ile yükseltebilirsiniz.

## Güvenlik notu

Panelde kimlik doğrulama yok ve sunucu bilgilerinizi (bilgisayar adı, işletim sistemi, servis listesi) gösterir. Bu yüzden varsayılan olarak yalnızca `127.0.0.1` üzerinde dinler. `HOST=0.0.0.0` ile ağa açarsanız bunu yalnızca güvendiğiniz bir ağda yapın, internete doğrudan açmayın. Discord webhook adresi bir sırdır: `.env` dosyası `.gitignore` içinde olduğu için repoya girmez, ama paylaşmayın.

## Yol haritası

- [ ] Disk kullanımı ve en çok kaynak kullanan işlemler
- [ ] Çekirdek bazlı CPU görünümü
- [ ] Web Push ve SMS bildirimleri
- [ ] Panel için parola koruması

## Yazar

**Zeix (Bydefuse)**: [portfolyo](https://zeix-portfolio.netlify.app/) · [GitHub](https://github.com/bydefuse)

MIT lisansı ile paylaşılmıştır, ayrıntı için `LICENSE` dosyasına bakın.

// =========================================================================
// takip.js — 🚨 İzleme & Uyarı · 📅 Geçmiş / Takvim · 📊 Gelişim süzgeci
//                                                              (23.09.2026)
// -------------------------------------------------------------------------
// Kullanıcı istekleri (birebir özet):
//   • "adını gireceğimiz hesaplar ve ordular özel olarak (konumuyla)
//      gösterilsin; kasaba değiştirdiyse KOCAMAN YAZIYLA ek uyarı."
//   • "geçmişe dönük tüm raporlar + TAKVİM: tarih seç → o günkü nüfuslar."
//   • "bize ait multilerde (Gelişim) FİLTRE: kayıt tarihi aralığı + nick ile
//      yazarak süz ve DIŞA AKTAR (kopyala / CSV)."
//
// Dosya İKİ parçadır:
//   1) `TakipSaf` — DOM'a DOKUNMAYAN saf fonksiyonlar (durum hesabı, tarih
//      ayrıştırma, süzgeç, CSV, kaçış). Node ile test edilir
//      (testler/test_site_takip.py) — dosyanın sonundaki module.exports.
//   2) Tarayıcı kısmı — kendi try/catch'i içinde; burada bir hata olsa bile
//      script.js / panel.js / harita.js ÇALIŞMAYA DEVAM EDER.
//
// Veri kaynakları (hiçbiri için oyuna/bota istek YOK, hepsi docs/ JSON'u):
//   hareket.json → script.js'in global dizileri (sakinlerListesi,
//                  hareketKayitlari, hareketKayiplar, inzivaDonusler)
//   ordu.json    → window.orduVerisi (harita.js yükler; yoksa burası çeker)
//   nobet.json   → burası çeker (gün içi 2,5 saatlik ordu/grup nöbeti)
//   izleme.json  → burası çeker (ORTAK liste, salt okunur, 🌐)
//   gecmis/      → YALNIZCA Geçmiş sekmesi ilk açılınca (index + gün dosyası)
//   ordu_hadise.json → YALNIZCA ⚔️ Ordu sekmesi ilk açılınca (25.09.2026:
//                  Ordu Takip hesaplarımız + son 30 günün ordu hadiseleri)
//
// ⚠️ Hesap adı eşleşmesi `.toLowerCase()` iledir, tr-TR DEĞİL (Ironfoot →
//    "ıronfoot" tuzağı; CLAUDE.md `_kucult` notu). Ordu adı / komutan
//    eşleşmesi tr-TR küçültme + "içerir" ile yapılır (komutan
//    "Kazasker: Emmalogan" gibi unvanlıdır).
// ⚠️ localStorage gizli pencerede / engellenmişken HATA fırlatır — her
//    erişim try/catch'lidir; o durumda liste yalnızca sayfa açıkken durur.
// ⚠️ Dış kaynaklı metin (oyuncu adı, rapor, fark metni) innerHTML'e ASLA
//    ham basılmaz: `kacis()`.
// =========================================================================

var TakipSaf = (function () {
  "use strict";

  // Kasaba OLMAYAN konum etiketleri (script.js'teki KASABA_DISI_ETIKETLER ile aynı).
  var KASABA_DISI = [
    "Şehir Dışı", "İnzivada", "Arafta", "Öldü", "Profil Yok", "Bilinmiyor",
    "İngiltere yolu", "Glasgow-Girvan arası"
  ];
  // Büyük uyarı bandına çıkan durumlar.
  var UYARI_DURUMLARI = ["degisti", "kayboldu", "durum_degisti"];

  function metin(m) { return m === null || m === undefined ? "" : String(m); }

  // HTML kaçışı — innerHTML'e giden HER dış kaynaklı metin buradan geçer.
  function kacis(m) {
    return metin(m).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Hesap adı: .toLowerCase() (tr-TR DEĞİL). Klavyeden gelen İ/ı da i sayılır
  // ki "IRONFOOT", "Ironfoot", "ıronfoot" hepsi aynı hesabı bulsun.
  function adKucult(m) {
    return metin(m).trim().replace(/İ/g, "i").replace(/ı/g, "i").toLowerCase();
  }

  // Ordu adı / komutan: tr-TR küçültme + noktasız ı → i (büyük harfle
  // yazılan "HIGHLANDS" da "Highlands"ı bulsun).
  function metinKucult(m) {
    return metin(m).trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/̇/g, "");
  }

  // Ay adları için tam sadeleştirme (Türkçe harfler → ASCII).
  function sadeKucult(m) {
    return metinKucult(m).replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u")
      .replace(/ö/g, "o").replace(/ç/g, "c");
  }

  function kasabaDisiMi(konum) {
    var k = metin(konum);
    return KASABA_DISI.indexOf(k) >= 0 || k.indexOf("Ara Nokta") === 0;
  }

  // ---------------------------------------------------------------------
  // TARİH
  // ---------------------------------------------------------------------
  var AYLAR = {
    ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7,
    agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12
  };
  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function gecerliGun(y, a, g) {
    if (!(y >= 1900 && y <= 2100 && a >= 1 && a <= 12 && g >= 1 && g <= 31)) return false;
    var d = new Date(Date.UTC(y, a - 1, g));
    return d.getUTCFullYear() === y && d.getUTCMonth() === a - 1 && d.getUTCDate() === g;
  }
  function isoKur(y, a, g) { return gecerliGun(y, a, g) ? y + "-" + iki(a) + "-" + iki(g) : ""; }

  // "18 Aralık 2020" · "≈12 Eylül 2026" · "2020-12-18" · "18.12.2020" → "YYYY-MM-DD"
  // Çözülemezse "".
  function turkceTarihCoz(m) {
    var s = metin(m).trim().replace(/^[≈~]\s*/, "");
    if (!s) return "";
    var r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (r) return isoKur(+r[1], +r[2], +r[3]);
    r = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(s);
    if (r) return isoKur(+r[3], +r[2], +r[1]);
    r = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/.exec(s);
    if (r) {
      var ay = AYLAR[sadeKucult(r[2])];
      return ay ? isoKur(+r[3], ay, +r[1]) : "";
    }
    return "";
  }
  function isoMu(m) { return /^\d{4}-\d{2}-\d{2}$/.test(metin(m)) && turkceTarihCoz(m) === metin(m); }

  // Gelişim satırının kayıt günü: önce üreticinin yazdığı kayit_iso, yoksa metin.
  function kayitIso(k) {
    if (!k) return "";
    if (isoMu(k.kayit_iso)) return k.kayit_iso;
    return turkceTarihCoz(k.kayit_tarihi);
  }

  // "2026-09-12" → "12.09"
  function kisaGun(iso) {
    var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(metin(iso));
    return r ? r[3] + "." + r[2] : metin(iso);
  }
  function gunSayisi(iso) {
    var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(metin(iso));
    return r ? Date.UTC(+r[1], +r[2] - 1, +r[3]) / 86400000 : null;
  }
  // gün sayısı (UTC, gunSayisi'nin tersi) → "YYYY-MM-DD"
  function gundenIso(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + "-" + iki(d.getUTCMonth() + 1) + "-" + iki(d.getUTCDate());
  }

  // ---------------------------------------------------------------------
  // 📊 GELİŞİM SÜZGECİ + DIŞA AKTARMA
  // ---------------------------------------------------------------------
  // s = {ad, bas, bit, bilinmeyen}. bas/bit "YYYY-MM-DD" ya da "".
  // bilinmeyen false ise kayıt tarihi çözülemeyen hesaplar gizlenir.
  function gelisimSuzgecUygun(k, s) {
    s = s || {};
    if (!k) return false;
    var aranan = adKucult(s.ad);
    if (aranan && adKucult(k.karakter).indexOf(aranan) < 0) return false;
    var bas = isoMu(s.bas) ? s.bas : "", bit = isoMu(s.bit) ? s.bit : "";
    if (bas && bit && bas > bit) { var t = bas; bas = bit; bit = t; }   // ters girilmişse çevir
    var iso = kayitIso(k);
    if (!iso) return s.bilinmeyen !== false;
    if (bas && iso < bas) return false;
    if (bit && iso > bit) return false;
    return true;
  }
  function gelisimSuz(liste, s) {
    return (liste || []).filter(function (k) { return gelisimSuzgecUygun(k, s); });
  }
  function suzgecAcikMi(s) {
    s = s || {};
    return !!(adKucult(s.ad) || isoMu(s.bas) || isoMu(s.bit) || s.bilinmeyen === false);
  }

  var CSV_SUTUNLAR = ["karakter", "kasaba", "kayit_tarihi", "kayit_iso", "seviye", "akce", "gorev_ozet"];
  var CSV_AYRAC = ";";   // Türkçe Excel ondalık virgül kullandığı için liste ayracı ";"
  function csvHucre(v, sayiMi) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    // Excel formül enjeksiyonu: =, +, -, @ ile başlayan METİN tek tırnakla başlar.
    if (!sayiMi && s.length > 1 && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function akceCsv(v) {
    if (typeof v === "number" && isFinite(v)) return v.toFixed(2).replace(".", ",");
    return metin(v);
  }
  function gorevOzet(k) {
    if (k.gorev_ozet) return metin(k.gorev_ozet);
    return Array.isArray(k.gorevler) ? k.gorevler.join(", ") : "";
  }
  // UTF-8 BOM'lu CSV (Excel Türkçe karakterleri doğru açsın), satır sonu CRLF.
  function gelisimCsv(liste) {
    var satirlar = [CSV_SUTUNLAR.join(CSV_AYRAC)];
    (liste || []).forEach(function (k) {
      if (!k) return;
      satirlar.push([
        csvHucre(k.karakter), csvHucre(k.kasaba), csvHucre(k.kayit_tarihi),
        csvHucre(kayitIso(k)),
        csvHucre(typeof k.seviye === "number" ? k.seviye : metin(k.seviye), typeof k.seviye === "number"),
        csvHucre(akceCsv(k.akce), typeof k.akce === "number"),
        csvHucre(gorevOzet(k))
      ].join(CSV_AYRAC));
    });
    return String.fromCharCode(0xFEFF) + satirlar.join("\r\n") + "\r\n";
  }
  function nickListesi(liste) {
    return (liste || []).map(function (k) { return metin(k && k.karakter); }).filter(Boolean).join("\n");
  }

  // ---------------------------------------------------------------------
  // 🚨 İZLEME LİSTESİ
  // ---------------------------------------------------------------------
  var TURLER = { hesap: "hesap", "kişi": "hesap", kisi: "hesap", karakter: "hesap",
                 oyuncu: "hesap", ordu: "ordu", otomatik: "otomatik" };
  function turNormalize(t) { return TURLER[metinKucult(t)] || "otomatik"; }
  function anahtarAd(tur, ad) { return tur === "ordu" ? metinKucult(ad) : adKucult(ad); }

  // localStorage JSON'u (ya da izleme.json'un `liste`si) → [{ad, tur, not}]
  // Bozuk JSON / yanlış tür → boş liste (site ÇÖKMEZ).
  function izlemeListesiCoz(ham) {
    var v = ham;
    if (typeof ham === "string") {
      try { v = JSON.parse(ham); } catch (e) { return []; }
    }
    if (!Array.isArray(v)) return [];
    var out = [], gorulen = {};
    v.forEach(function (x) {
      var ad = (x && typeof x === "object") ? x.ad : x;
      ad = metin(ad).trim();
      if (!ad || ad.length > 80) return;
      var tur = turNormalize(x && typeof x === "object" ? x.tur : "");
      var a = tur + "|" + anahtarAd(tur, ad);
      if (gorulen[a]) return;
      gorulen[a] = 1;
      out.push({ ad: ad, tur: tur, not: (x && typeof x === "object" && x.not) ? metin(x.not).slice(0, 200) : "" });
    });
    return out.slice(0, 200);
  }

  // Yerel (bu tarayıcı) + ortak (izleme.json) → tek liste; aynı kayıt tekse
  // iki bayrak birden taşır. Sıra: önce yerel, sonra yalnız-ortak olanlar.
  function izlemeBirlestir(yerel, ortak) {
    var out = [], dizin = {};
    (yerel || []).forEach(function (o) {
      var a = o.tur + "|" + anahtarAd(o.tur, o.ad);
      if (dizin[a]) return;
      dizin[a] = { ad: o.ad, tur: o.tur, not: o.not || "", yerel: true, ortak: false };
      out.push(dizin[a]);
    });
    (ortak || []).forEach(function (o) {
      var a = o.tur + "|" + anahtarAd(o.tur, o.ad);
      if (dizin[a]) { dizin[a].ortak = true; if (!dizin[a].not && o.not) dizin[a].not = o.not; return; }
      dizin[a] = { ad: o.ad, tur: o.tur, not: o.not || "", yerel: false, ortak: true };
      out.push(dizin[a]);
    });
    return out;
  }

  // Nöbet kontrollerindeki GRUPLARDA bu hesap görüldü mü → kronolojik liste.
  // ⚠️ Görülmemek "gitti" demek DEĞİLDİR (gruba üye olmayan hiç görünmez);
  //    yalnızca görülen yer bilgi verir.
  function nobetGorulmeler(ad, nobet) {
    var a = adKucult(ad), out = [];
    if (!a || !nobet || !Array.isArray(nobet.kontroller)) return out;
    nobet.kontroller.forEach(function (k) {
      if (!k || !Array.isArray(k.gruplar)) return;
      k.gruplar.forEach(function (g) {
        if (!g) return;
        var lider = adKucult(g.lider) === a;
        var uye = (g.uyeler || []).some(function (u) { return adKucult(u) === a; });
        if (lider || uye) {
          out.push({ kasaba: metin(k.kasaba), saat: metin(k.saat), saat_tam: metin(k.saat_tam || k.saat),
                     rol: lider ? "lider" : "üye", lider: metin(g.lider), grup_id: metin(g.id) });
        }
      });
    });
    out.sort(function (x, y) { return x.saat_tam < y.saat_tam ? -1 : x.saat_tam > y.saat_tam ? 1 : 0; });
    return out;
  }

  // Nöbet farklarından bu hesabı / orduyu ilgilendirenler (bilgi satırı).
  function nobetFarklari(ad, tur, nobet) {
    var out = [];
    if (!nobet || !Array.isArray(nobet.kontroller)) return out;
    var a = adKucult(ad), q = metinKucult(ad);
    nobet.kontroller.forEach(function (k) {
      ((k && k.farklar) || []).forEach(function (f) {
        if (!f) return;
        var ilgili = false;
        if (tur === "ordu") {
          ilgili = metinKucult(f.ad) === q && !!q;
        } else {
          var adlar = [f.lider, f.onceki_lider].concat(f.uyeler || [], f.eklenen || [], f.cikan || []);
          ilgili = !!a && adlar.some(function (x) { return adKucult(x) === a; });
        }
        if (ilgili) out.push({ kasaba: metin(k.kasaba), saat: metin(k.saat), metin: metin(f.metin || f.tip) });
      });
    });
    return out;
  }

  function sonucKur(tur, ad, tarih) {
    return { tur: tur, ad: ad, durum: "ayni", eski: "", yeni: "", yeniAnahtar: "", neZaman: "",
             tarih: tarih || "", alt: "", konum: "", gunOnce: 0, satirlar: [], baglantilar: [] };
  }

  // ---------------------------------------------------------------------
  // [23.09.2026 — inceleme düzeltmeleri] Hesap durumunun yardımcıları
  // ---------------------------------------------------------------------
  // Hareket penceresinin gün sayısı (town_module.HAREKET_GUN_SAYISI ile aynı).
  // Yalnızca hareket.json'un ilk_gun'u bilinmiyorsa kullanılır.
  var PENCERE_GUN = 6;

  // O sabah sakin listesi GERÇEKTEN okunmuş kasabalar → {kasaba: 1}.
  // veri.taranan verilmişse o; yoksa sakin listesindeki kasabalardan kurulur.
  // ⚠️ Listede hiç yoksa kasaba TARANMAMIŞ sayılır (bir kasabanın kişisi
  //    görünmüyorsa "gitti" denemez — town_module'ün "hüküm verilmez" kuralı).
  function tarananKume(veri) {
    var t = veri && veri.taranan, out = {};
    if (t && typeof t === "object" && !Array.isArray(t)) return t;
    if (Array.isArray(t)) { t.forEach(function (k) { if (k) out[metin(k)] = 1; }); return out; }
    (veri && Array.isArray(veri.sakinler) ? veri.sakinler : []).forEach(function (x) {
      if (x && x.kasaba) out[metin(x.kasaba)] = 1;
    });
    return out;
  }

  // Uyarıya girebilecek en eski gün: hareket.json penceresinin ilk günü;
  // bilinmiyorsa sakin gününden geriye PENCERE_GUN gün. İkisi de yoksa "".
  function pencereIlk(veri) {
    var p = veri && veri.pencere;
    if (p && isoMu(p.ilk)) return p.ilk;
    var t = gunSayisi(veri && veri.sakinTarihi);
    return t === null ? "" : gundenIso(t - (PENCERE_GUN - 1));
  }

  // Konum adımları [{konum, tarih}] — ardışık tekrarlar sıkıştırılmış, her
  // adım BAŞLADIĞI günle. Önce kayit.rota (town_module böyle yazar), rota
  // yoksa gunluk'ten aynı şekilde kurulur. sonTarih'ten sonraki adım atılır.
  function konumAdimlari(kayit, sonTarih) {
    if (!kayit) return [];
    var kaynak = (Array.isArray(kayit.rota) && kayit.rota.length >= 2) ? kayit.rota
      : (Array.isArray(kayit.gunluk) ? kayit.gunluk : []);
    var out = [];
    kaynak.forEach(function (e) {
      if (!e || !e.tarih || !metin(e.konum)) return;
      if (sonTarih && metin(e.tarih) > sonTarih) return;
      if (out.length && out[out.length - 1].konum === metin(e.konum)) return;
      out.push({ konum: metin(e.konum), tarih: metin(e.tarih) });
    });
    return out;
  }

  // Son GERÇEK geçiş: adımlar sondan taranır, "etiket → etiket" (Şehir Dışı →
  // İnzivada gibi, kişi zaten dışarıdaydı) atlanır. eskiTarih = eski yerin
  // SON görüldüğü gün (gunluk'ten), yoksa o adımın başladığı gün.
  function sonGecis(adimlar, gunluk) {
    for (var i = adimlar.length - 1; i >= 1; i--) {
      var e = adimlar[i - 1], y = adimlar[i];
      if (kasabaDisiMi(e.konum) && kasabaDisiMi(y.konum)) continue;
      var eskiTarih = e.tarih;
      (gunluk || []).forEach(function (g) {
        if (g && g.tarih && metin(g.konum) === e.konum && g.tarih < y.tarih && g.tarih > eskiTarih) eskiTarih = metin(g.tarih);
      });
      return { eski: e.konum, eskiTarih: eskiTarih, yeni: y.konum, tarih: y.tarih,
               simdiki: adimlar[adimlar.length - 1].konum };
    }
    return null;
  }

  // "Stirling → Stirling" gibi eski === yeni sonuç HİÇBİR ZAMAN uyarı olmaz.
  function ayniYerMi(s) {
    return !!s && !!metin(s.eski) && metinKucult(s.eski) === metinKucult(s.yeni);
  }

  // Bir HESABIN durumu. veri = {sakinTarihi, sakinler, kayitlar, kayiplar,
  // donusler, gelisim, nobet, taranan?, pencere?}. Hiçbir kaynakta yoksa null.
  //
  // ⚠️ [23.09.2026 — inceleme] Karşılaştırma artık yalnızca "dün ↔ bugün"
  //    DEĞİL: hareket penceresindeki (ilk_gun..son_gun) SON GERÇEK GEÇİŞ
  //    kullanılır ve uyarı anahtarı o geçişin TARİHİYLE kurulur. Siteye bir
  //    gün bakmayan kişi dünkü taşınmayı yine görür; "✔ gördüm" deyince
  //    kalkar ve ertesi gün geri gelmez (anahtar değişmez).
  // ⚠️ Kasabası o sabah TARANAMAYAN kişi için "kayboldu" denmez (eskiden
  //    "KASABALARIMIZDAN ÇIKTI: Stirling → Stirling" çıkıyordu); nöbet de
  //    sabah taranmamış kasabada gördüğü kişi için uyarı üretmez.
  // Olay önceliği (en yeni bilgi kazanır): nöbet > bugünkü fark > bugün
  //    kasabasından ayrıldı > penceredeki son geçiş > dönüş > kayıp listesi.
  function hesapDurumu(ad, veri) {
    veri = veri || {};
    var a = adKucult(ad);
    if (!a) return null;
    function bul(liste) {
      liste = Array.isArray(liste) ? liste : [];
      for (var i = 0; i < liste.length; i++) if (liste[i] && adKucult(liste[i].karakter) === a) return liste[i];
      return null;
    }
    var sakin = bul(veri.sakinler), kayit = bul(veri.kayitlar), kayip = bul(veri.kayiplar);
    var donus = bul(veri.donusler), gel = bul(veri.gelisim);
    var gor = nobetGorulmeler(ad, veri.nobet);
    if (!sakin && !kayit && !kayip && !donus && !gel && !gor.length) return null;

    var tarih = metin(veri.sakinTarihi);
    var taranan = tarananKume(veri);
    var pIlk = pencereIlk(veri);
    function pencerede(t) { t = metin(t); return !!t && (!pIlk || t >= pIlk) && (!tarih || t <= tarih); }
    var gorunen = (sakin || kayit || kayip || donus || gel || {}).karakter || ad;
    var s = sonucKur("hesap", gorunen, tarih);
    var bugun = sakin ? metin(sakin.kasaba) : "";
    var gunluk = (kayit && Array.isArray(kayit.gunluk))
      ? kayit.gunluk.filter(function (e) { return e && e.tarih && (!tarih || metin(e.tarih) <= tarih); }) : [];
    var bugunKaydi = null;
    if (tarih) gunluk.forEach(function (e) { if (e.tarih === tarih) bugunKaydi = e; });
    // Sakin listesinde yok ama hareket kaydı BUGÜN bir kasabada diyorsa
    // (liste eksik okunmuş olabilir) → oradadır; "kayboldu" alarmı verme.
    if (!bugun && bugunKaydi && metin(bugunKaydi.konum) && !kasabaDisiMi(bugunKaydi.konum)) bugun = metin(bugunKaydi.konum);
    // Bilgi satırı: bir önceki kayıtlı gün.
    var onceki = "", oncekiTarih = "";
    var gl = gunluk.filter(function (e) { return !tarih || e.tarih < tarih; });
    if (!tarih) gl = gl.slice(0, -1);
    if (gl.length) { onceki = metin(gl[gl.length - 1].konum); oncekiTarih = metin(gl[gl.length - 1].tarih); }
    var hareketsiz = !kayit && !!sakin;

    var adimlar = konumAdimlari(kayit, tarih);
    var sonAdim = adimlar.length ? adimlar[adimlar.length - 1] : null;
    // Son adımdaki yerin SON görüldüğü gün (bilgi + "ne zaman" metni).
    var sonGorulme = sonAdim ? sonAdim.tarih : "";
    gunluk.forEach(function (e) { if (sonAdim && metin(e.konum) === sonAdim.konum && e.tarih > sonGorulme) sonGorulme = metin(e.tarih); });
    // Bugün listede YOKSA bilinen son KASABASI (bugünden eski — bayat olabilir).
    var sonKasaba = (!bugun && tarih && sonAdim && !kasabaDisiMi(sonAdim.konum) && sonAdim.tarih < tarih) ? sonAdim.konum : "";
    var sonKasabaTaranmadi = !!sonKasaba && !taranan[sonKasaba];
    var gecis = sonGecis(adimlar, gunluk);
    if (gecis && !pencerede(gecis.tarih)) gecis = null;
    // Kasabalarımız DIŞINDAYSA en açıklayıcı etiket: kayıp listesindeki profil
    // durumu ("İnzivada", "İskoçya'da (...)"), yoksa hareket kaydının KASABA
    // DIŞI etiketi. ⚠️ Kaydın son konumu bir KASABAYSA ve kişi bugünkü
    // listede yoksa o konum BAYATTIR (kasaba bugün taranmamış olabilir) →
    // "dışarıda" diye YAZILMAZ (eski hata: "Stirling → Stirling").
    var disarida = (kayip && metin(kayip.durum)) ||
      (kayit && kasabaDisiMi(kayit.su_anki_konum) ? metin(kayit.su_anki_konum) : "");
    // Nöbet YALNIZCA sakin listesiyle AYNI günse sabah→nöbet karşılaştırmasına girer.
    // Sakin listesinin günü bilinmiyorsa (hareket.json henüz gelmedi) hiç
    // karşılaştırılmaz — yoksa sabah yeri "boş" sanılıp SAHTE uyarı çıkardı.
    var nobetGunu = veri.nobet ? metin(veri.nobet.tarih) : "";
    var ayniGun = !!veri.nobet && !!tarih && (!nobetGunu || nobetGunu === tarih);
    var gorGun = ayniGun ? gor : [];
    var son = gorGun.length ? gorGun[gorGun.length - 1] : null;
    var nobetBilgi = null;
    var o = null;
    function olay(durum, eski, yeni, neZaman, t, ek) {
      o = { durum: durum, eski: eski, yeni: yeni, neZaman: neZaman, tarih: t, alt: "", yeniAnahtar: "" };
      if (ek) for (var k in ek) if (ek.hasOwnProperty(k)) o[k] = ek[k];
    }

    // 1) Gün içi nöbet: sabahki yerinden BAŞKA bir kasabanın grubunda görüldü.
    if (son && son.kasaba && son.kasaba !== bugun) {
      if (bugun) {
        olay("degisti", bugun, son.kasaba, "sabah → nöbet " + son.saat, tarih);
      } else if (taranan[son.kasaba]) {
        olay("degisti", disarida || (sonKasaba && sonKasaba !== son.kasaba
          ? sonKasaba + " (son bilinen " + kisaGun(sonGorulme) + ")" : "kasabalarımızda değildi"),
          son.kasaba, "sabah → nöbet " + son.saat, tarih);
      } else {
        // ⚠️ Sabah bu kasaba TARANMADI → sabahki yeri bilinmiyor, karşılaştırılamaz.
        nobetBilgi = son;
      }
    }
    // 2) Bugün listede, ama hareket kaydının son yerinden BAŞKA bir kasabada
    //    (kayıt bugünü henüz içermiyor).
    if (!o && bugun && tarih && sonAdim && sonAdim.konum !== bugun && sonAdim.tarih < tarih) {
      olay("degisti", sonAdim.konum, bugun, kisaGun(sonGorulme) + " → " + kisaGun(tarih), tarih);
    }
    // 3) Son kasabası bugün TARANDI ve orada yok (kayıtta bugün yok → nereye gittiği belirsiz).
    if (!o && sonKasaba && !sonKasabaTaranmadi && !bugunKaydi) {
      olay("kayboldu", sonKasaba, disarida || "görünmüyor", kisaGun(sonGorulme) + " → " + kisaGun(tarih), tarih,
        { alt: disarida ? "" : "belirsiz" });
    }
    // 4) Hareket penceresindeki SON gerçek geçiş (görülene kadar uyarı).
    if (!o && gecis) {
      var gz = kisaGun(gecis.eskiTarih) + " → " + kisaGun(gecis.tarih);
      if (!kasabaDisiMi(gecis.yeni)) olay("degisti", gecis.eski, gecis.yeni, gz, gecis.tarih);
      else olay("kayboldu", gecis.eski, disarida || gecis.simdiki, gz, gecis.tarih, { yeniAnahtar: gecis.yeni });
    }
    // 5) İnzivadan / dışarıdan dönüş (hareket kaydında geçiş yoksa).
    if (!o && bugun && !gecis && donus && pencerede(donus.cikis_tarihi)) {
      olay("degisti", "kasabalarımızda değildi", bugun,
        metin(donus.cikis_tarihi) === tarih ? "bugün döndü" : kisaGun(donus.cikis_tarihi) + " döndü", metin(donus.cikis_tarihi));
    }
    // 6) Kayıp listesi (inziva takibi): kasabalarımızdan çıkış günü pencerede.
    if (!o && !bugun && kayip && pencerede(kayip.giris_tarihi) && (!sonAdim || metin(kayip.giris_tarihi) >= sonAdim.tarih)) {
      olay("kayboldu", metin(kayip.son_kasaba) || "?", metin(kayip.durum) || "görünmüyor",
        metin(kayip.giris_tarihi) === tarih ? "bugün ayrıldı" : kisaGun(kayip.giris_tarihi) + " ayrıldı", metin(kayip.giris_tarihi),
        { yeniAnahtar: "çıkış:" + (metin(kayip.son_kasaba) || "?") });
    }

    if (o) {
      s.durum = o.durum; s.eski = o.eski; s.yeni = o.yeni; s.neZaman = o.neZaman;
      s.tarih = o.tarih || tarih; s.alt = o.alt || ""; s.yeniAnahtar = o.yeniAnahtar || "";
    } else if (bugun) {
      s.durum = "ayni";
    } else if (sonKasabaTaranmadi) {
      s.durum = "bilinmiyor"; s.alt = "taranmadi";
    } else if (kayit || kayip || donus) {
      s.durum = "ayni";
    } else {
      s.durum = "bilinmiyor";
    }
    if (tarih && s.tarih && s.tarih < tarih) s.gunOnce = gunSayisi(tarih) - gunSayisi(s.tarih);
    // Kartta gösterilen yer: en yeni BİLİNEN bilgi.
    var konum = bugun || disarida;
    if (o && o.durum === "degisti" && son && o.yeni === son.kasaba) konum = son.kasaba;
    if (!bugun && nobetBilgi) konum = nobetBilgi.kasaba + " (nöbet " + nobetBilgi.saat + ")";
    if (!konum && sonKasaba) konum = sonKasaba + " (son bilinen " + kisaGun(sonGorulme) + (sonKasabaTaranmadi ? ", bugün taranmadı" : "") + ")";
    s.konum = konum || (gel ? metin(gel.kasaba) : "");

    var sat = s.satirlar;
    var bugunEt = "Bugün" + (tarih ? " (" + kisaGun(tarih) + ")" : "");
    if (bugun) sat.push([bugunEt, bugun + (sakin && sakin.pr !== undefined && sakin.pr !== null ? " · PR " + sakin.pr : "")]);
    else if (sonKasabaTaranmadi) sat.push([bugunEt, sonKasaba + " taranmadı — şu anki yeri bilinmiyor (son görüldüğü: " +
      sonKasaba + ", " + kisaGun(sonGorulme) + ")"]);
    else if (kayit || kayip) sat.push([bugunEt, ((bugunKaydi || !kayit) ? "kasabalarımızda yok" : "bugün taranan kasabalarda yok") +
      (disarida ? " — " + disarida : "")]);
    if (onceki) sat.push(["Önceki gün" + (oncekiTarih ? " (" + kisaGun(oncekiTarih) + ")" : ""), onceki]);
    if (hareketsiz) sat.push(["Son günler", "hareket kaydı yok — hep " + bugun]);
    if (kayit && Array.isArray(kayit.rota) && kayit.rota.length) {
      sat.push(["Rota", kayit.rota.map(function (r) { return metin(r.konum) + " (" + kisaGun(r.tarih) + ")"; }).join(" → ")]);
    }
    if (gor.length) {
      sat.push([ayniGun ? "Gün içi (nöbet)" : "Nöbet (" + kisaGun(nobetGunu) + ")",
        gor.map(function (x) { return x.saat + " " + x.kasaba + " (" + (x.rol === "lider" ? "grup lideri" : "grupta, lider " + x.lider) + ")"; }).join(" · ")]);
    }
    if (nobetBilgi) {
      sat.push(["Nöbet " + nobetBilgi.saat, nobetBilgi.kasaba + " grubunda görüldü — sabah " + nobetBilgi.kasaba +
        " taranmadığı için sabahki yerle karşılaştırılamadı (uyarı verilmedi)"]);
    }
    // ⚠️ Nöbet farkları YALNIZCA sakin listesiyle aynı günün nöbetiyse eklenir.
    if (ayniGun) nobetFarklari(ad, "hesap", veri.nobet).slice(0, 5).forEach(function (f) {
      sat.push(["Nöbet " + f.saat + " " + f.kasaba, f.metin]);
    });
    if (kayip) sat.push(["Kasabalarımızdan çıkış", [kayip.giris_tarihi, kayip.son_kasaba ? "son kasaba " + kayip.son_kasaba : "", kayip.durum]
      .filter(Boolean).join(" · ")]);
    if (donus) sat.push(["Dönüş", [donus.cikis_tarihi, donus.donus_kasaba].filter(Boolean).join(" → ")]);
    if (gel) sat.push(["Bizim hesap", "Gelişim kaydı: " + (gel.kasaba || "?") + " · seviye " + metin(gel.seviye)]);

    var e = encodeURIComponent(gorunen);
    s.baglantilar.push(["📍 Kim Nerede", "#sakinler/ara/" + e], ["🔄 Hareket", "#hareket/ara/" + e]);
    if (kayip || donus) s.baglantilar.push(["🔒 İnziva", "#inziva/ara/" + e]);
    if (gel) s.baglantilar.push(["👤 Hesap kartı", "#hesap/" + e]);
    return s;
  }

  function orduEslesir(o, q, icerir) {
    var ad = metinKucult(o.ad);
    if (ad === q) return true;
    if (!icerir || q.length < 3) return false;
    return ad.indexOf(q) >= 0 || metinKucult(o.komutan).indexOf(q) >= 0;
  }

  function orduSonucu(o, ayrildi, veri) {
    var ordu = veri.ordu || {};
    var tarih = metin(ordu.rapor_tarihi);
    var s = sonucKur("ordu", metin(o.ad), tarih);
    var kasaba = metin(o.kasaba), durum = metin(o.durum);
    // ⚠️ [23.09.2026 — inceleme] Üretici o kasabaya bugün BAKAMADIYSA
    //    (`bakilamadi: true`, dünkü kayıt taşındı) uyarı ÜRETİLMEZ —
    //    "dünden farklı" bilgisi bugünün değil, taşınan kaydın farkıdır.
    var bakilamadi = !ayrildi && o.bakilamadi === true;
    if (bakilamadi) {
      s.durum = "bilinmiyor"; s.alt = "bakilamadi";
    } else if (ayrildi) {
      s.durum = "kayboldu";
      s.eski = kasaba || "?"; s.yeni = "görünmüyor";
      s.neZaman = o.not ? metin(o.not) : "dün vardı, bugün görünmüyor";
      // [23.09.2026 — ikinci kontrol] Birkaç gün önce kaybolan ordu
      // (`eski_ayrilanlar`): anahtar KAYBOLMA günüyle kurulur → uyarı
      // "✔ gördüm" denene kadar kalır, ertesi gün sessizce silinmez.
      if (o.ayrilis_tarihi) {
        s.tarih = metin(o.ayrilis_tarihi);
        s.neZaman = "o günden beri görünmüyor";   // tarih + "N gün önce" uyariMetni'nde
        if (tarih && s.tarih < tarih) s.gunOnce = gunSayisi(tarih) - gunSayisi(s.tarih);
      }
    } else if (o.sabah_kasaba && o.sabah_kasaba !== kasaba) {
      s.durum = "degisti";
      s.eski = metin(o.sabah_kasaba); s.yeni = kasaba;
      s.neZaman = "sabah → nöbet " + metin(o.anlik_saat);
    } else if (o.degisim === "tasindi") {
      s.durum = "degisti";
      s.eski = metin(o.onceki_kasaba) || "?"; s.yeni = kasaba;
      s.neZaman = "dün → bugün";
    } else if (o.degisim === "yeni") {
      s.durum = "degisti"; s.alt = "geldi";
      s.eski = "dün görülmedi"; s.yeni = kasaba;
      s.neZaman = "dün → bugün";
    } else if (o.sabah_durum && o.sabah_durum !== durum) {
      s.durum = "durum_degisti";
      s.eski = metin(o.sabah_durum); s.yeni = durum;
      s.neZaman = "sabah → nöbet " + metin(o.anlik_saat);
    } else if (o.degisim === "degisti") {
      s.durum = "durum_degisti";
      s.eski = metin(o.onceki_durum) || "?"; s.yeni = durum;
      s.neZaman = "dün → bugün";
    } else if (o.degisim === "ayni" && o.son_gecis && o.son_gecis.tarih) {
      // [23.09.2026 — ikinci kontrol] Bugün "aynı" ama son 7 günde yer/durum
      // değiştirmiş ordu (üretici `son_gecis`). Hesap tarafındaki "rotanın
      // son geçişi" kuralının ordu karşılığı: anahtar GEÇİŞ günüyle kurulur,
      // uyarı ertesi gün kaybolmaz, "✔ gördüm" ile kalkar.
      var g = o.son_gecis;
      s.tarih = metin(g.tarih);
      if (g.tur === "tasindi") {
        s.durum = "degisti";
        s.eski = metin(g.onceki_kasaba) || "?"; s.yeni = kasaba;
      } else if (g.tur === "yeni") {
        s.durum = "degisti"; s.alt = "geldi";
        s.eski = "görülmedi"; s.yeni = kasaba;
      } else if (g.tur === "degisti") {
        s.durum = "durum_degisti";
        s.eski = metin(g.onceki_durum) || "?"; s.yeni = durum;
      }
      s.neZaman = "son değişim";   // tarih + "N gün önce" uyariMetni'nde
      if (tarih && s.tarih < tarih) s.gunOnce = gunSayisi(tarih) - gunSayisi(s.tarih);
    }
    if (s.durum === "durum_degisti") s.yeniAnahtar = kasaba + ":" + durum;
    s.konum = ayrildi ? "" : (bakilamadi ? kasaba + " (son bilinen)" : kasaba);
    s.kasaba = kasaba;
    var sat = s.satirlar;
    if (bakilamadi) sat.push(["Bugün" + (tarih ? " (" + kisaGun(tarih) + ")" : ""),
      "bakılamadı — " + (kasaba || "kasabası") + " bu sabah taranmadı; aşağıdaki yer SON BİLİNEN kayıttır"]);
    if (ayrildi) sat.push(["Son görüldüğü", kasaba + (durum ? " · " + durum : "")]);
    else sat.push([bakilamadi ? "Son bilinen" : "Kasaba", kasaba + (durum ? " · " + (durum === "Şehir Dışında" ? "🟠 " : "🟢 ") + durum : "")]);
    if (o.komutan) sat.push(["Komutan", metin(o.komutan)]);
    if (o.sabah_kasaba) sat.push(["Sabah", metin(o.sabah_kasaba) + (o.sabah_durum ? " · " + o.sabah_durum : "")]);
    if (o.anlik_saat) sat.push(["Nöbet", "son kontrol " + metin(o.anlik_saat)]);
    if (!ayrildi && o.son_gecis && o.son_gecis.tarih) {
      var gm = { tasindi: "taşındı: " + metin(o.son_gecis.onceki_kasaba) + " → " + kasaba,
                 yeni: "geldi", degisti: "durumu değişti: " + metin(o.son_gecis.onceki_durum) + " → " + durum
               }[o.son_gecis.tur] || metin(o.son_gecis.tur);
      sat.push(["Son değişim", kisaGun(o.son_gecis.tarih) + " — " + gm]);
    }
    if (ayrildi && o.ayrilis_tarihi) sat.push(["Kayboldu", kisaGun(o.ayrilis_tarihi)]);
    if (!ayrildi && o.degisim) {
      var dm = { yeni: "dün görülmedi (yeni)", tasindi: "taşındı: " + metin(o.onceki_kasaba) + " → " + kasaba,
                 degisti: "durumu değişti: " + metin(o.onceki_durum) + " → " + durum, ayni: "aynı" }[o.degisim] || metin(o.degisim);
      sat.push([bakilamadi ? "Son bilinen değişim" : "Düne göre", dm]);
    }
    if (ayrildi && o.not) sat.push(["Not", metin(o.not)]);
    // ⚠️ Nöbet farkları YALNIZCA ordu verisiyle AYNI günün nöbetiyse eklenir
    //    (sabah yayınında nobet.json dünkü kalabilir).
    var nbGun = veri.nobet ? metin(veri.nobet.tarih) : "", orduGun = tarih || metin(veri.sakinTarihi);
    if (veri.nobet && orduGun && (!nbGun || nbGun === orduGun)) {
      nobetFarklari(o.ad, "ordu", veri.nobet).slice(0, 5).forEach(function (f) {
        sat.push(["Nöbet " + f.saat + " " + f.kasaba, f.metin]);
      });
    }
    s.baglantilar.push(["🗺️ Haritada", "#harita/ordu/" + encodeURIComponent(metin(o.ad))]);
    return s;
  }

  // Komutanın unvansız adı ("Kazasker: Emmalogan" → "emmalogan", adKucult).
  function komutanAdi(komutan) {
    return adKucult(metin(komutan).split(":").pop());
  }

  // Bir ada uyan ordular (tam eşleşme varsa YALNIZCA onlar, yoksa "içerir").
  // secenek.sadeceKomutan: YALNIZCA komutanın unvansız adı TAM eşleşenler
  // ("otomatik" izlemede ad zaten bir HESABI bulduysa — ⚠️ [23.09.2026
  // inceleme] kısa nick 'emma', 'Kazasker: Emmalogan'ın ordusunu
  // "içerir" ile yakalayıp ilgisiz KOCAMAN uyarı üretiyordu).
  function orduDurumlari(ad, veri, secenek) {
    veri = veri || {};
    var q = metinKucult(ad), ordu = veri.ordu;
    if (!q || !ordu) return [];
    var ordular = Array.isArray(ordu.ordular) ? ordu.ordular : [];
    var ayrilan = Array.isArray(ordu.ayrilanlar) ? ordu.ayrilanlar : [];
    // [23.09.2026 — ikinci kontrol] Birkaç gün önce kaybolanlar da aranır.
    if (Array.isArray(ordu.eski_ayrilanlar)) ayrilan = ayrilan.concat(ordu.eski_ayrilanlar);
    var tam = function (o) { return o && orduEslesir(o, q, false); };
    var icer = function (o) { return o && orduEslesir(o, q, true); };
    var ka = adKucult(ad);
    var komutanTam = function (o) { return !!o && !!ka && komutanAdi(o.komutan) === ka; };
    var secici = (secenek && secenek.sadeceKomutan) ? komutanTam
      : ((ordular.some(tam) || ayrilan.some(tam)) ? tam : icer);
    var out = [], adlar = {};
    ordular.forEach(function (o) {
      if (secici(o)) { out.push(orduSonucu(o, false, veri)); adlar[metinKucult(o.ad)] = 1; }
    });
    ayrilan.forEach(function (o) {
      if (secici(o) && !adlar[metinKucult(o.ad)]) out.push(orduSonucu(o, true, veri));
    });
    return out.slice(0, 6);
  }

  function uyariAnahtari(s) {
    return [s.tur, anahtarAd(s.tur, s.ad), s.yeniAnahtar || s.yeni, s.tarih].join("|");
  }

  // Tek izlenen kayıt → sonuç listesi (çoğu zaman 1; "otomatik" hem hesap
  // hem ordu bulabilir: komutanı izlerken ordusu da gelir).
  function izlemeDurumu(oge, veri) {
    veri = veri || {};
    var tur = turNormalize(oge && oge.tur), ad = metin(oge && oge.ad).trim(), out = [];
    if (!ad) return out;
    var h = null;
    if (tur !== "ordu") { h = hesapDurumu(ad, veri); if (h) out.push(h); }
    // "otomatik" bir HESAP bulduysa ordu yalnızca komutan adı TAM eşleşirse gelir.
    if (tur !== "hesap") orduDurumlari(ad, veri, { sadeceKomutan: tur === "otomatik" && !!h })
      .forEach(function (x) { out.push(x); });
    // Genel emniyet: eski === yeni olan bir "değişiklik" uyarıya ÇEVRİLMEZ.
    out.forEach(function (x) {
      if (UYARI_DURUMLARI.indexOf(x.durum) >= 0 && x.alt !== "geldi" && ayniYerMi(x)) {
        x.satirlar.push(["Not", "değişiklik doğrulanamadı (" + x.eski + " → " + x.yeni + ") — uyarı verilmedi"]);
        x.durum = "bilinmiyor"; x.alt = "";
      }
    });
    if (!out.length) {
      var s = sonucKur(tur === "otomatik" ? "otomatik" : tur, ad, metin(veri.sakinTarihi));
      s.durum = "bilinmiyor";
      s.satirlar.push(["Durum", tur === "ordu"
        ? (veri.ordu ? "bugünkü ordu listesinde yok" : "ordu verisi henüz yüklenmedi")
        : "bugün 7 kasabanın listesinde, kayıp/dönüş listelerinde ve nöbet kontrollerinde görünmüyor"]);
      out.push(s);
    }
    out.forEach(function (x) { x.izlenen = ad; x.anahtar = uyariAnahtari(x); });
    return out;
  }

  // Görülmemiş uyarılar. Aynı değişiklik iki kez izleniyorsa (ör. komutan
  // "otomatik" + ordunun kendisi) bantta TEK satır çıkar.
  function uyarilar(sonuclar, gorulen) {
    gorulen = gorulen || {};
    var tekil = {};
    return (sonuclar || []).filter(function (s) {
      if (!s || UYARI_DURUMLARI.indexOf(s.durum) < 0 || gorulen[s.anahtar] || tekil[s.anahtar]) return false;
      if (s.alt !== "geldi" && ayniYerMi(s)) return false;   // "Stirling → Stirling" HİÇBİR ZAMAN
      tekil[s.anahtar] = 1;
      return true;
    });
  }

  // Büyük bant yazısı. Adlar .toUpperCase() ile (tr-TR DEĞİL: "IZASKUN").
  function uyariMetni(s) {
    var AD = metin(s.ad).toUpperCase(), b = "";
    if (s.tur === "ordu") {
      if (s.durum === "degisti" && s.alt === "geldi") b = "⚠️ ORDU " + AD + " GELDİ: " + s.yeni;
      else if (s.durum === "degisti") b = "⚠️ ORDU " + AD + " KASABA DEĞİŞTİRDİ: " + s.eski + " → " + s.yeni;
      else if (s.durum === "kayboldu") b = "⚠️ ORDU " + AD + " GÖRÜNMÜYOR: " + s.eski + " terk edildi";
      else if (s.durum === "durum_degisti") b = "⚠️ ORDU " + AD + " DURUM DEĞİŞTİ: " + s.eski + " → " + s.yeni +
        (s.kasaba ? " (" + s.kasaba + ")" : "");
    } else {
      if (s.durum === "degisti") b = "⚠️ " + AD + " KASABA DEĞİŞTİRDİ: " + s.eski + " → " + s.yeni;
      // "belirsiz": son kasabası bugün tarandı ve orada yok, ama taranmayan
      // bir kasabada olabilir → "kasabalarımızdan çıktı" diye KESİN konuşulmaz.
      else if (s.durum === "kayboldu" && s.alt === "belirsiz") b = "⚠️ " + AD + " KASABASINDAN AYRILDI: " + s.eski + " → " + s.yeni;
      else if (s.durum === "kayboldu") b = "⚠️ " + AD + " KASABALARIMIZDAN ÇIKTI: " + s.eski + " → " + s.yeni;
    }
    var k = [s.neZaman, s.tarih ? "gün " + s.tarih : "", s.gunOnce > 0 ? s.gunOnce + " gün önce" : ""]
      .filter(Boolean).join(" · ");
    return { buyuk: b, kucuk: k };
  }

  function durumEtiketi(s) {
    switch (s && s.durum) {
      case "degisti": return s.alt === "geldi" ? "🆕 GELDİ" : "⚠️ KASABA DEĞİŞTİRDİ";
      case "kayboldu": return s.tur === "ordu" ? "🚪 GÖRÜNMÜYOR" : (s.alt === "belirsiz" ? "🚪 KASABASINDAN AYRILDI" : "🚪 KASABALARIMIZDAN ÇIKTI");
      case "durum_degisti": return "🔁 DURUM DEĞİŞTİ";
      case "ayni": return "✅ yerinde";
      default: return s && s.alt === "bakilamadi" ? "❔ bugün bakılamadı"
        : (s && s.alt === "taranmadi" ? "❔ bugün taranmadı" : "❔ bilinmiyor");
    }
  }

  // Sıralama: uyarılar önce, sonra değişmeyenler, bilinmeyenler en sonda.
  var DURUM_SIRASI = { degisti: 0, kayboldu: 1, durum_degisti: 2, ayni: 3, bilinmiyor: 4 };
  function durumSirasi(d) { return DURUM_SIRASI.hasOwnProperty(d) ? DURUM_SIRASI[d] : 5; }

  // 🛡️ Nöbet özeti (Başlangıç kartı + İzleme sekmesi başlığı).
  // Nöbet kontrolleri saat sırasına (üretici zaten sıralı yazar; savunma).
  function kronolojik(kontroller) {
    return (Array.isArray(kontroller) ? kontroller.filter(Boolean) : [])
      .map(function (k, i) { return { k: k, i: i, t: metin(k.saat_tam || k.saat) }; })
      .sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i; })
      .map(function (x) { return x.k; });
  }

  function nobetOzeti(nobet) {
    if (!nobet || typeof nobet !== "object") return null;
    var k = kronolojik(nobet.kontroller);
    var fark = 0;
    k.forEach(function (x) { fark += Array.isArray(x.farklar) ? x.farklar.length : 0; });
    var son = k.length ? k[k.length - 1] : null;
    return {
      tarih: metin(nobet.tarih), aralik: Number(nobet.aralik_dk) || 150, sayi: k.length, farkSayisi: fark,
      son: son ? { saat: metin(son.saat), kasaba: metin(son.kasaba),
                   fark: Array.isArray(son.farklar) ? son.farklar.length : 0 } : null,
      ordulu: Array.isArray(nobet.ordulu_kasabalar) ? nobet.ordulu_kasabalar.slice() : []
    };
  }

  // 150 dk → "2,5" (Türkçe ondalık; toLocaleString'e bağlı değil).
  function aralikSaatMetni(dk) {
    return String(Math.round((Number(dk) || 150) / 6) / 10).replace(".", ",");
  }
  // nobet.json günü sakin listesinin günüyle AYNIYSA "bugün", değilse
  // "22.09"; nöbet günü bilinmiyorsa "". ⚠️ [23.09.2026 — inceleme] Sabah
  // yayınında nobet.json DÜNKÜ kalabilir → sakin günü bilinmiyorsa da
  // "bugün" DENMEZ (tarih yazılır).
  function nobetGunEtiketi(nobetTarih, bugun) {
    nobetTarih = metin(nobetTarih); bugun = metin(bugun);
    if (nobetTarih && bugun && nobetTarih === bugun) return "bugün";
    return nobetTarih ? kisaGun(nobetTarih) : "";
  }
  // Başlangıç kartı (kart) + İzleme sekmesi başlık satırı (baslik) metinleri.
  // Başka günün verisiyse vurgu (fark) VERİLMEZ ve "bugün" kelimesi geçmez.
  function nobetMetinleri(nobet, bugun) {
    var oz = nobetOzeti(nobet);
    if (!oz) return null;
    var et = nobetGunEtiketi(oz.tarih, bugun);
    var bugunMu = et === "bugün";
    var gunOn = bugunMu ? "bugün " : (et ? et + " günü " : "");
    var ordulu = oz.ordulu.join(", ") || "yok";
    var orduluEt = bugunMu ? "ordulu kasaba: " : "o günün ordulu kasabası: ";
    var aralik = aralikSaatMetni(oz.aralik);
    var kart, baslik;
    if (oz.son) {
      kart = { deger: bugunMu || !et ? oz.son.saat : et + " " + oz.son.saat,
               alt: "son kontrol " + oz.son.kasaba + ", " + oz.son.fark + " değişiklik · " + gunOn + oz.sayi + " kontrol",
               fark: bugunMu ? oz.son.fark : 0 };
      baslik = (bugunMu || !et ? "" : et + " günü — ") + "Son kontrol " + oz.son.saat + " " + oz.son.kasaba +
        " (" + oz.son.fark + " değişiklik) · " + (bugunMu ? "bugün " : "") + oz.sayi + " kontrol, toplam " + oz.farkSayisi +
        " değişiklik · " + orduluEt + ordulu + " · her " + aralik + " saatte bir";
    } else {
      kart = { deger: "—", alt: gunOn + "kontrol yok · ordulu kasaba " + oz.ordulu.length, fark: 0 };
      baslik = (bugunMu ? "Bugün henüz nöbet kontrolü yok" : (et ? et + " günü nöbet kontrolü yok" : "Nöbet kontrolü yok")) +
        " · " + orduluEt + ordulu + " (ordu olan kasabalar " + aralik + " saatte bir kontrol edilir).";
    }
    return { oz: oz, etiket: et, bugunMu: bugunMu, kart: kart, baslik: baslik };
  }

  // ---------------------------------------------------------------------
  // 📅 GEÇMİŞ / TAKVİM
  // ---------------------------------------------------------------------
  // gunler: artan sıralı "YYYY-MM-DD" listesi. Tam yoksa EN YAKINI
  // (eşitlikte öncekini) döndürür.
  function enYakinGun(gunler, hedef) {
    gunler = gunler || [];
    if (!gunler.length) return "";
    if (gunler.indexOf(hedef) >= 0) return hedef;
    var h = gunSayisi(hedef);
    if (h === null) return gunler[gunler.length - 1];
    var en = gunler[0], fark = Infinity;
    gunler.forEach(function (g) {
      var d = Math.abs(gunSayisi(g) - h);
      if (d < fark) { fark = d; en = g; }
    });
    return en;
  }
  // yon = -1 (önceki) / +1 (sonraki); bulunamazsa "".
  function komsuGun(gunler, tarih, yon) {
    gunler = gunler || [];
    var i = gunler.indexOf(tarih);
    if (i < 0) {
      if (yon < 0) { for (var j = gunler.length - 1; j >= 0; j--) if (gunler[j] < tarih) return gunler[j]; return ""; }
      for (var k = 0; k < gunler.length; k++) if (gunler[k] > tarih) return gunler[k];
      return "";
    }
    return gunler[i + (yon < 0 ? -1 : 1)] || "";
  }
  function sayilariVar(g) { return !!(g && g.sayilar && Object.keys(g.sayilar).length); }

  // Son N günün (kasaba listesi olan günler) nüfus tablosu; her hücrede
  // bir önceki BİLİNEN değere göre fark.
  function nufusTablosu(index, adet) {
    adet = adet || 14;
    var gunler = ((index && index.gunler) || []).filter(sayilariVar);
    var son = gunler.slice(-adet), once = gunler.length > adet ? gunler[gunler.length - adet - 1] : null;
    var kasabalar = (index && index.kasabalar && index.kasabalar.length) ? index.kasabalar.slice() : [];
    if (!kasabalar.length) {
      var set = {};
      son.forEach(function (g) { Object.keys(g.sayilar).forEach(function (k) { set[k] = 1; }); });
      kasabalar = Object.keys(set).sort();
    }
    var satirlar = kasabalar.map(function (kas) {
      var prev = once && typeof once.sayilar[kas] === "number" ? once.sayilar[kas] : null;
      return {
        kasaba: kas,
        hucreler: son.map(function (g) {
          var v = typeof g.sayilar[kas] === "number" ? g.sayilar[kas] : null;
          var fark = (v !== null && prev !== null) ? v - prev : null;
          if (v !== null) prev = v;
          var resmi = g.resmi && typeof g.resmi[kas] === "number" ? g.resmi[kas] : null;
          return { tarih: g.tarih, sayi: v, resmi: resmi, fark: fark };
        })
      };
    });
    var prevT = once ? once.toplam : null;
    var toplam = son.map(function (g) {
      var v = typeof g.toplam === "number" ? g.toplam : null;
      var fark = (v !== null && prevT !== null && prevT !== undefined) ? v - prevT : null;
      if (v !== null) prevT = v;
      return { tarih: g.tarih, sayi: v, fark: fark };
    });
    return { gunler: son.map(function (g) { return g.tarih; }), satirlar: satirlar, toplam: toplam };
  }

  // gelen/giden'in karşı kasabası (gün dosyası, sözleşme B2 + 23.09.2026):
  //   "Glasgow" → kasaba · null/"" → kasabalarımızın DIŞI (bosMetin) ·
  //   "?" → o gün (gelen için önceki gün) taranmayan kasaba vardı, kişi orada
  //         olabilir → BİLİNMİYOR ("kasabalarımız dışı" DENMEZ).
  var BILINMEYEN_KASABA = "?";
  function karsiKasabaMetni(deger, bosMetin) {
    var d = metin(deger);
    if (d === BILINMEYEN_KASABA) return "bilinmiyor (taranmayan kasaba)";
    return d || metin(bosMetin);
  }
  // Gün dosyasının "taranmayan" + "onceki_taranmayan" bilgi notları (düz metin).
  function gecmisNotlari(gun) {
    var out = [];
    if (!gun) return out;
    var t = Array.isArray(gun.taranmayan) ? gun.taranmayan.map(metin).filter(Boolean) : [];
    var ot = Array.isArray(gun.onceki_taranmayan) ? gun.onceki_taranmayan.map(metin).filter(Boolean) : [];
    if (t.length) out.push("⚪ Bu gün taranmayan kasaba: " + t.join(", ") +
      " — o kasabaya gidenlerin nereye gittiği \"bilinmiyor\" görünür.");
    if (ot.length) out.push("⚪ Önceki veri gününde" + (gun.onceki_tarih ? " (" + metin(gun.onceki_tarih) + ")" : "") +
      " taranmayan kasaba: " + ot.join(", ") + " — bu gün gelenlerin nereden geldiği \"bilinmiyor\" olabilir.");
    return out;
  }

  // Seçili günün dosyasında kişi ara → [{ad, kasaba, pr, not}]
  function gundeKisiAra(gun, arama) {
    var a = adKucult(arama), out = [], bulunan = {};
    if (a.length < 2 || !gun || !gun.kasabalar) return out;
    Object.keys(gun.kasabalar).sort().forEach(function (kas) {
      var v = gun.kasabalar[kas] || {};
      var gelen = {};
      (v.gelen || []).forEach(function (c) { gelen[adKucult(c[0])] = c[1]; });
      (v.sakinler || []).forEach(function (c) {
        var ad = metin(c[0]), k = adKucult(ad);
        if (k.indexOf(a) < 0) return;
        bulunan[k] = 1;
        var not = gelen.hasOwnProperty(k) ? "bu gün geldi ← " + karsiKasabaMetni(gelen[k], "kasabalarımız dışından") : "";
        out.push({ ad: ad, kasaba: kas, pr: c[1], not: not, tam: k === a });
      });
    });
    Object.keys(gun.kasabalar).sort().forEach(function (kas) {
      ((gun.kasabalar[kas] || {}).giden || []).forEach(function (c) {
        var ad = metin(c[0]), k = adKucult(ad);
        if (k.indexOf(a) < 0 || bulunan[k]) return;
        out.push({ ad: ad, kasaba: "", pr: null, tam: k === a,
                   not: kas + "'dan ayrıldı → " + karsiKasabaMetni(c[1], "kasabalarımız dışı") });
      });
    });
    out.sort(function (x, y) { return (y.tam - x.tam) || (x.ad < y.ad ? -1 : x.ad > y.ad ? 1 : 0); });
    return out.slice(0, 40);
  }

  // ---------------------------------------------------------------------
  // 🔗 PAYLAŞ BAĞLANTISI  (#izle/ekle/a,b · #izle/ordu/<ad>)
  // ---------------------------------------------------------------------
  function paylasHash(liste) {
    liste = (liste || []).filter(function (o) { return o && o.ad; });
    if (!liste.length) return "";
    if (liste.length === 1 && liste[0].tur === "ordu") return "#izle/ordu/" + encodeURIComponent(liste[0].ad);
    var parcalar = liste.map(function (o) {
      return (o.tur === "ordu" ? "ordu:" : o.tur === "hesap" ? "hesap:" : "") + o.ad;
    });
    return "#izle/ekle/" + encodeURIComponent(parcalar.join(","));
  }
  // panel.js'in çözdüğü (alt, değer) → eklenecek [{ad, tur}]
  function hashIzleCoz(alt, deger) {
    alt = metin(alt);
    deger = metin(deger).trim();
    if (!deger) return [];
    if (alt === "ordu") return [{ ad: deger, tur: "ordu" }];
    if (alt !== "ekle" && alt !== "hesap") return [];
    var out = [];
    deger.split(",").forEach(function (p) {
      p = p.trim();
      if (!p) return;
      var m = /^(hesap|ordu|otomatik)\s*:\s*(.+)$/i.exec(p);
      if (m) out.push({ ad: m[2].trim(), tur: turNormalize(m[1]) });
      else out.push({ ad: p, tur: alt === "hesap" ? "hesap" : "otomatik" });
    });
    return izlemeListesiCoz(out).slice(0, 50);
  }

  // ---------------------------------------------------------------------
  // ⚔️ ORDU — üyelerimiz + ORDU HADİSELERİ (ordu_hadise.json, 25.09.2026)
  // Kullanıcı: *"siteye de bu ordu sekmesini koysak ayrıca. orada geçmişi
  // de görelim. 30 güne kadar."* Tür adları `ordu_uyesi.TUR_EMOJI` /
  // `KAVGA_TURLERI` ile BİREBİR aynı.
  // ---------------------------------------------------------------------
  var ORDU_KAVGA_TURLERI = ["olum", "yara", "darbe", "kavga"];
  var ORDU_TURLER = {
    olum: ["💀", "ölüm"], yara: ["🩸", "yara"], darbe: ["⚔️", "darbe"], kavga: ["⚔️", "kavga"],
    gorus: ["👁️", "gördüklerin"], diger: ["▫️", "diğer"]
  };
  // Bilinmeyen tür "diger" sayılır (sınıf adı / emoji için beyaz liste).
  function orduTur(tur) { tur = metin(tur); return ORDU_TURLER.hasOwnProperty(tur) ? tur : "diger"; }
  function orduTurEmoji(tur) { return ORDU_TURLER[orduTur(tur)][0]; }
  function orduTurAdi(tur) { return ORDU_TURLER[orduTur(tur)][1]; }
  function orduKavgaMi(h) { return !!h && ORDU_KAVGA_TURLERI.indexOf(metin(h.tur)) >= 0; }

  // "2026-09-23" → "23.09.2026" · oyun "23-09-1474" → "23.09.1474"
  function tamGun(iso) {
    var r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(metin(iso));
    return r ? r[3] + "." + r[2] + "." + r[1] : metin(iso);
  }
  function oyunTarihYazi(t) {
    var r = /^(\d{1,2})-(\d{1,2})-(\d{3,4})$/.exec(metin(t).trim());
    return r ? iki(+r[1]) + "." + iki(+r[2]) + "." + r[3] : metin(t);
  }

  // gunler: [{tarih, oyun_tarihi, kavga, hadiseler:[…]}] → süzülmüş KOPYA.
  //   s.hesap       → yalnızca o hesabın kayıtları (TAM ad, büyük/küçük harfsiz)
  //   s.sadeceKavga → yalnızca ölüm / yara / darbe / kavga
  //   s.ara         → metin + hesap + kişiler içinde geçen (tr-TR, ı = i)
  // Boş kalan gün DÜŞER. Günün ⚔️ sayısı süzülmüş kayıtlardan yeniden
  // sayılır; `toplam` süzgeçten ÖNCEKİ kayıt sayısıdır. Sıra korunur
  // (üretici en yeni gün / en yeni saat önce yazar).
  function orduHadiseSuz(gunler, s) {
    s = s || {};
    var hesap = adKucult(s.hesap);
    var ara = metinKucult(s.ara);
    var out = [];
    (Array.isArray(gunler) ? gunler : []).forEach(function (g) {
      if (!g || typeof g !== "object") return;
      var tum = Array.isArray(g.hadiseler) ? g.hadiseler : [];
      var kalan = tum.filter(function (h) {
        if (!h || typeof h !== "object") return false;
        if (hesap && adKucult(h.hesap) !== hesap) return false;
        if (s.sadeceKavga && !orduKavgaMi(h)) return false;
        if (ara) {
          var kisiler = Array.isArray(h.kisiler) ? h.kisiler.map(metin).join(" ") : "";
          if (metinKucult([metin(h.metin), metin(h.hesap), kisiler].join(" ")).indexOf(ara) < 0) return false;
        }
        return true;
      });
      if (!kalan.length) return;
      out.push({ tarih: metin(g.tarih), oyun_tarihi: metin(g.oyun_tarihi), toplam: orduGecerliSay(tum),
                 kavga: kalan.filter(orduKavgaMi).length, hadiseler: kalan });
    });
    return out;
  }
  function orduSuzgecAcikMi(s) {
    s = s || {};
    return !!(metin(s.hesap).trim() || s.sadeceKavga || metin(s.ara).trim());
  }
  // Yalnızca geçerli (nesne) kayıtlar sayılır — bozuk satır "N hadisenin M'si" yanılgısı üretmesin.
  function orduGecerliSay(liste) {
    return (Array.isArray(liste) ? liste : []).filter(function (h) { return h && typeof h === "object"; }).length;
  }
  function orduHadiseSayisi(gunler) {
    return (Array.isArray(gunler) ? gunler : []).reduce(function (t, g) {
      return t + (g && typeof g === "object" ? orduGecerliSay(g.hadiseler) : 0);
    }, 0);
  }

  // Hesap süzgecinin seçenekleri: üyeler + hadisesi olan hesaplar, tekrarsız, alfabetik.
  function orduHesaplari(veri) {
    var gorulen = {}, out = [];
    function ekle(ad) {
      ad = metin(ad).trim();
      var k = adKucult(ad);
      if (!ad || gorulen[k]) return;
      gorulen[k] = 1;
      out.push(ad);
    }
    ((veri && Array.isArray(veri.uyeler)) ? veri.uyeler : []).forEach(function (u) { if (u) ekle(u.hesap); });
    ((veri && Array.isArray(veri.gunler)) ? veri.gunler : []).forEach(function (g) {
      ((g && Array.isArray(g.hadiseler)) ? g.hadiseler : []).forEach(function (h) { if (h) ekle(h.hesap); });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, "tr"); });
  }

  // Tablo sırası: orduda olanlar önce, sonra bilinmeyen, sonra orduda olmayan; içinde alfabetik.
  function orduUyeSirala(uyeler) {
    function derece(u) { return u.uye === true ? 0 : (u.uye === false ? 2 : 1); }
    return (Array.isArray(uyeler) ? uyeler : []).filter(function (u) { return u && typeof u === "object"; })
      .slice().sort(function (a, b) {
        return (derece(a) - derece(b)) || metin(a.hesap).localeCompare(metin(b.hesap), "tr");
      });
  }

  // Son takip sonucu (`ordu_uyesi.run_ordu_uyesi` → son_takip.sonuc) → rozet.
  var ORDU_TAKIP_ETIKET = {
    "verildi": ["✅", "takip verildi", "iyi"],
    "zaten": ["✅", "zaten planlı", "iyi"],
    "pasif": ["⏸️", "düğme pasif", "orta"],
    "reddedildi": ["⛔", "reddedildi", "kotu"],
    "belirsiz": ["❔", "belirsiz", "orta"],
    "hata": ["⚠️", "hata", "kotu"],
    "yok": ["⚠️", "takip düğmesi yok", "kotu"],
    "orduda değil": ["🚫", "orduda değil", "kotu"],
    "okunamadı": ["❔", "okunamadı", "orta"]
  };
  function orduTakipEtiketi(sonuc) {
    sonuc = metin(sonuc).trim();
    var e = ORDU_TAKIP_ETIKET.hasOwnProperty(sonuc) ? ORDU_TAKIP_ETIKET[sonuc] : null;
    if (!e) return { simge: "❔", metin: sonuc || "bilgi yok", sinif: "orta" };
    return { simge: e[0], metin: e[1], sinif: e[2] };
  }
  // Enerji hücresi: "50/50 · boya: en fazla 3 üretim"
  function orduEnerjiMetni(en) {
    if (!en || typeof en !== "object") return "—";
    var bos = function (x) { return x === null || x === undefined || x === ""; };
    var pa = bos(en.pa) ? "" : metin(en.pa) + "/" + (bos(en.max_pa) ? "?" : metin(en.max_pa));
    var parca = [pa, metin(en.sonuc).trim()].filter(function (x) { return x; });
    return parca.length ? parca.join(" · ") : "—";
  }

  // ---- HTML kurucuları (SAF — Node testinde kaçış denetlenir) ----------
  // ⚠️ Oyundan gelen HER metin (hadise, hesap, ordu, komutan, açıklama)
  //    kacis()'ten geçer; tür adı beyaz listeden (orduTur) gelir.
  function orduHadiseSatirHtml(h) {
    h = h || {};
    var tur = orduTur(h.tur);
    return '<li class="ordu-hadise ordu-hadise-' + tur + (orduKavgaMi(h) ? " ordu-hadise-kavga" : "") + '">' +
      '<span class="ordu-hadise-emoji" title="' + kacis(orduTurAdi(tur)) + '">' + orduTurEmoji(tur) + '</span>' +
      '<span class="ordu-hadise-saat">' + kacis(h.saat || "--:--") + '</span>' +
      '<a class="ordu-hadise-hesap bas-link" href="#hesap/' + encodeURIComponent(metin(h.hesap)) + '">' + kacis(h.hesap || "?") + '</a>' +
      '<span class="ordu-hadise-metin">' + kacis(h.metin) + '</span></li>';
  }
  // Gün grubu: başlık GG.AA.YYYY + oyun tarihi + ⚔️ sayısı; acik → <details open>.
  function orduGunHtml(g, acik) {
    g = g || {};
    var hadiseler = Array.isArray(g.hadiseler) ? g.hadiseler : [];
    var kavga = typeof g.kavga === "number" ? g.kavga : hadiseler.filter(orduKavgaMi).length;
    return '<details class="ordu-gun"' + (acik ? " open" : "") + '>' +
      '<summary class="ordu-gun-baslik"><b>' + kacis(tamGun(g.tarih)) + '</b>' +
      (g.oyun_tarihi ? ' <span class="emir-kucuk">oyun ' + kacis(oyunTarihYazi(g.oyun_tarihi)) + '</span>' : "") +
      ' <span class="ordu-gun-sayi">' + hadiseler.length + ' hadise' +
      (kavga ? ' · <span class="ordu-gun-kavga">⚔️ ' + kacis(kavga) + '</span>' : "") + '</span></summary>' +
      '<ul class="ordu-hadise-satirlar">' + hadiseler.map(orduHadiseSatirHtml).join("") + '</ul></details>';
  }
  // Üye tablosu satırı: hesap · ordu · komutan · ücret · son takip · enerji · son görülme · müfreze
  function orduUyeSatirHtml(u) {
    u = u || {};
    var tk = u.takip || {}, en = u.enerji || {};
    // "orduda değil" rozeti hesap hücresinde; takip hücresi son KAYITLI sonucu gösterir.
    var et = tk.sonuc ? orduTakipEtiketi(tk.sonuc) : null;
    var hesapHtml = '<a class="bas-link" href="#hesap/' + encodeURIComponent(metin(u.hesap)) + '"><b>' + kacis(u.hesap || "?") + '</b></a>' +
      ' <button type="button" class="emir-mini-btn ordu-hesap-suz" data-hesap="' + kacis(u.hesap) +
      '" title="Bu hesabın hadiselerini göster">📜</button>' +
      (u.uye === false ? ' <span class="ordu-rozet ordu-rozet-kotu">🚫 orduda değil</span>' : "") +
      (u.uye !== true && u.uye !== false ? ' <span class="ordu-rozet ordu-rozet-orta">❔ bilinmiyor</span>' : "");
    var takipHtml = (et ? '<span class="ordu-rozet ordu-rozet-' + et.sinif + '">' + et.simge + " " + kacis(et.metin) + '</span>' : "—") +
      (tk.gun ? ' <span class="emir-kucuk">' + kacis(tamGun(tk.gun)) + '</span>' : "") +
      (tk.lider ? '<div class="emir-kucuk">lider: ' + kacis(tk.lider) + '</div>' : "") +
      (tk.aciklama ? '<div class="emir-kucuk">' + kacis(tk.aciklama) + '</div>' : "");
    var enerjiHtml = kacis(orduEnerjiMetni(en)) +
      (en.gun ? ' <span class="emir-kucuk">(' + kacis(tamGun(en.gun)) + ')</span>' : "");
    var mufreze = u.mufreze_komutani
      ? "🎖️ komutan" + (u.mufreze_kisi !== null && u.mufreze_kisi !== undefined ? " (" + kacis(u.mufreze_kisi) + " kişi)" : "")
      : "—";
    return '<tr' + (u.uye === false ? ' class="ordu-uye-degil"' : "") + '>' +
      '<td>' + hesapHtml + '</td>' +
      '<td>' + (u.ordu ? kacis(u.ordu) : "—") +
      (u.katilma_gunu ? '<div class="emir-kucuk">katıldı ' + kacis(tamGun(u.katilma_gunu)) + '</div>' : "") + '</td>' +
      '<td>' + (u.komutan ? kacis(u.komutan) : "—") + '</td>' +
      '<td>' + (u.ucret ? kacis(u.ucret) + " akçe" : "—") + '</td>' +
      '<td>' + takipHtml + '</td>' +
      '<td>' + enerjiHtml + '</td>' +
      '<td>' + (u.son_gorulme ? kacis(u.son_gorulme) : "—") + '</td>' +
      '<td>' + mufreze + '</td></tr>';
  }

  return {
    kacis: kacis, adKucult: adKucult, metinKucult: metinKucult, kasabaDisiMi: kasabaDisiMi,
    turkceTarihCoz: turkceTarihCoz, kayitIso: kayitIso, kisaGun: kisaGun,
    gelisimSuzgecUygun: gelisimSuzgecUygun, gelisimSuz: gelisimSuz, suzgecAcikMi: suzgecAcikMi,
    gelisimCsv: gelisimCsv, csvHucre: csvHucre, nickListesi: nickListesi, CSV_SUTUNLAR: CSV_SUTUNLAR,
    turNormalize: turNormalize, izlemeListesiCoz: izlemeListesiCoz, izlemeBirlestir: izlemeBirlestir,
    nobetGorulmeler: nobetGorulmeler, nobetFarklari: nobetFarklari,
    hesapDurumu: hesapDurumu, orduDurumlari: orduDurumlari, izlemeDurumu: izlemeDurumu,
    uyariAnahtari: uyariAnahtari, uyarilar: uyarilar, uyariMetni: uyariMetni,
    durumEtiketi: durumEtiketi, durumSirasi: durumSirasi, nobetOzeti: nobetOzeti, kronolojik: kronolojik,
    nobetGunEtiketi: nobetGunEtiketi, nobetMetinleri: nobetMetinleri,
    enYakinGun: enYakinGun, komsuGun: komsuGun, nufusTablosu: nufusTablosu,
    gundeKisiAra: gundeKisiAra, karsiKasabaMetni: karsiKasabaMetni, gecmisNotlari: gecmisNotlari,
    paylasHash: paylasHash, hashIzleCoz: hashIzleCoz,
    tarananKume: tarananKume, pencereIlk: pencereIlk,
    orduTur: orduTur, orduTurEmoji: orduTurEmoji, orduTurAdi: orduTurAdi, orduKavgaMi: orduKavgaMi,
    tamGun: tamGun, oyunTarihYazi: oyunTarihYazi,
    orduHadiseSuz: orduHadiseSuz, orduSuzgecAcikMi: orduSuzgecAcikMi, orduHadiseSayisi: orduHadiseSayisi,
    orduHesaplari: orduHesaplari, orduUyeSirala: orduUyeSirala,
    orduTakipEtiketi: orduTakipEtiketi, orduEnerjiMetni: orduEnerjiMetni,
    orduHadiseSatirHtml: orduHadiseSatirHtml, orduGunHtml: orduGunHtml, orduUyeSatirHtml: orduUyeSatirHtml,
    UYARI_DURUMLARI: UYARI_DURUMLARI
  };
})();


// =========================================================================
// TARAYICI KISMI — DOM, veri yükleme, olaylar
// =========================================================================
(function () {
  "use strict";
  if (typeof document === "undefined" || typeof window === "undefined") return;

  var S = TakipSaf;
  var ANAHTAR_LISTE = "poseidon_izleme_v1";
  var ANAHTAR_GORULEN = "poseidon_izleme_gorulen_v1";
  var KENDI_OLAYLAR = { nobet: 1, izleme: 1, takip: 1, gecmis: 1, ordu_hadise: 1 };
  // Bantta en fazla kaç satır (telefonda 2 — yoksa bant bütün ekranı kaplar).
  function bantAzami() { return window.innerWidth < 700 ? 2 : 4; }
  var TARIH_RE = /^\d{4}-\d{2}-\d{2}$/;

  var D = {
    ortak: [],                 // izleme.json → liste
    nobet: undefined,          // undefined = henüz yüklenmedi · null = yok
    ordu: undefined,           // harita.js yüklemezse buradan
    izlenen: 0, uyarilar: [], sonuclar: [],
    depoCalisiyor: null, bellekListe: [], bellekGorulen: {},
    gelisimSuzgec: { ad: "", bas: "", bit: "", bilinmeyen: true }, gelisimGorunen: [],
    oneriImza: "", baslangic: Date.now(), bantKaydirildi: false,
    gecmis: { index: null, yukleniyor: false, hata: "", gunler: {}, secili: "", bekleyen: "", kasaba: "", kaydir: false, yuklemeNo: 0 },
    orduHadise: { veri: null, yukleniyor: false, hata: "" }   // ⚔️ ordu_hadise.json (sekme açılınca)
  };

  function $(id) { return document.getElementById(id); }
  function guvenli(fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { try { console.error("takip.js:", e); } catch (e2) { /* sessiz */ } }
    };
  }
  function olayAt(ad) {
    try { document.dispatchEvent(new CustomEvent("veri-hazir", { detail: ad })); } catch (e) { /* eski tarayıcı */ }
  }
  function durumYaz(el, metin, hataMi) {
    if (!el) return;
    el.textContent = metin || "";
    el.classList.toggle("takip-hata", !!hataMi);
  }

  // ---- localStorage (her erişim try/catch; çalışmazsa bellek) ----------
  function depoCalisiyor() {
    if (D.depoCalisiyor !== null) return D.depoCalisiyor;
    try {
      var t = "__poseidon_takip_deneme__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      D.depoCalisiyor = true;
    } catch (e) {
      D.depoCalisiyor = false;
      // Yazılamıyor (kota dolu / gizli pencere) ama OKUNABİLİYORSA eski liste
      // kaybolmasın: belleğe bir kez al.
      try { D.bellekListe = S.izlemeListesiCoz(window.localStorage.getItem(ANAHTAR_LISTE) || "[]"); } catch (e2) { D.bellekListe = []; }
      try {
        var gv = JSON.parse(window.localStorage.getItem(ANAHTAR_GORULEN) || "{}");
        D.bellekGorulen = (gv && typeof gv === "object" && !Array.isArray(gv)) ? gv : {};
      } catch (e3) { D.bellekGorulen = {}; }
    }
    return D.depoCalisiyor;
  }
  function depoOku(anahtar) {
    if (!depoCalisiyor()) return null;
    try { return window.localStorage.getItem(anahtar); } catch (e) { return null; }
  }
  function depoYaz(anahtar, deger) {
    if (!depoCalisiyor()) return false;
    try { window.localStorage.setItem(anahtar, deger); return true; } catch (e) { return false; }
  }
  function yerelListe() {
    if (!depoCalisiyor()) return D.bellekListe.slice();
    return S.izlemeListesiCoz(depoOku(ANAHTAR_LISTE) || "[]");
  }
  function yerelKaydet(liste) {
    liste = S.izlemeListesiCoz(liste);
    D.bellekListe = liste.slice();
    return depoYaz(ANAHTAR_LISTE, JSON.stringify(liste));
  }
  function gorulenOku() {
    if (!depoCalisiyor()) return D.bellekGorulen;
    var v;
    try { v = JSON.parse(depoOku(ANAHTAR_GORULEN) || "{}"); } catch (e) { v = {}; }
    return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
  }
  function gorulenKaydet(v) {
    var anahtarlar = Object.keys(v);
    if (anahtarlar.length > 400) {           // eskileri at (en yeni 400 kalsın)
      anahtarlar.sort(function (a, b) { return (v[b] || 0) - (v[a] || 0); });
      var yeni = {};
      anahtarlar.slice(0, 400).forEach(function (a) { yeni[a] = v[a]; });
      v = yeni;
    }
    D.bellekGorulen = v;
    depoYaz(ANAHTAR_GORULEN, JSON.stringify(v));
  }

  // ---- script.js'in global dizileri (let → window'da YOK; panel.js ile aynı yöntem)
  function g(ad, varsayilan) {
    try {
      var v = (0, eval)("typeof " + ad + " === 'undefined' ? undefined : " + ad);
      return (v === undefined || v === null) ? varsayilan : v;
    } catch (e) { return varsayilan; }
  }
  function sakinTarihi() {
    var ek = window.hareketEk;
    if (ek && TARIH_RE.test(ek.sakin_tarihi || "")) return ek.sakin_tarihi;
    if (ek && TARIH_RE.test(ek.son_gun || "")) return ek.son_gun;
    var el = $("sakinler-tarih");
    var m = el ? /(\d{4}-\d{2}-\d{2})/.exec(el.textContent || "") : null;
    return m ? m[1] : "";
  }
  function orduVerisi() {
    if (window.orduVerisi !== undefined) return window.orduVerisi || null;
    return D.ordu || null;
  }
  // hareket.json penceresi (ilk_gun → son_gun). script.js window.hareketEk'e
  // yalnızca son_gun'u koyuyor; ilk_gun'u zaten yazdığı "Takip aralığı"
  // notundan okunur. Okunamazsa null → takip.js son 6 günü kullanır.
  function pencereOku() {
    var el = $("hareket-tarih-notu");
    var m = el ? /(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/.exec(el.textContent || "") : null;
    return m ? { ilk: m[1], son: m[2] } : null;
  }
  function veriTopla() {
    var sakinler = g("sakinlerListesi", []);
    return {
      sakinTarihi: sakinTarihi(),
      // ⚠️ [23.09.2026 — inceleme] O sabah GERÇEKTEN taranan kasabalar =
      //    sakin listesinde kişisi olanlar. hareket.json'daki `nufus`
      //    anahtarları BİLEREK eklenmez: tek başına katkısı, #NUFUS satırı
      //    olup kişisi olmayan (yarım yazılmış) dosyadır ve üretici o dosyayı
      //    "taranmamış" sayar (town_module `_gun_dosyasi_oku` kuralı).
      taranan: S.tarananKume({ sakinler: sakinler }),
      pencere: pencereOku(),
      sakinler: sakinler,
      kayitlar: g("hareketKayitlari", []),
      kayiplar: g("hareketKayiplar", []),
      donusler: g("inzivaDonusler", []),
      gelisim: g("gelisimKarakterler", []),
      ordu: orduVerisi(),
      nobet: D.nobet || null
    };
  }

  // =====================================================================
  // 🚨 İZLEME & UYARI
  // =====================================================================
  var _zaman = null;
  function yenileGecikmeli() { clearTimeout(_zaman); _zaman = setTimeout(guvenli(yenile), 120); }

  function yenile() {
    var veri = veriTopla();
    var liste = S.izlemeBirlestir(yerelListe(), D.ortak);
    var gorulen = gorulenOku();
    D.izlenen = liste.length;
    D.sonuclar = liste.map(function (oge) { return { oge: oge, sonuclar: S.izlemeDurumu(oge, veri) }; });
    var tum = [];
    D.sonuclar.forEach(function (x) { x.sonuclar.forEach(function (s) { tum.push(s); }); });
    D.uyarilar = S.uyarilar(tum, gorulen);
    guvenli(bantCiz)();
    guvenli(izlemeCiz)(gorulen);
    guvenli(oneriGuncelle)(veri);
    guvenli(nobetCiz)();
  }

  function bantCiz() {
    var bant = $("uyari-bandi");
    if (!bant) return;
    var u = D.uyarilar || [];
    if (!u.length) { bant.hidden = true; bant.innerHTML = ""; return; }
    var azami = bantAzami();
    var html = u.slice(0, azami).map(function (s) {
      var m = S.uyariMetni(s);
      return '<div class="uyari-satir">' +
        '<div class="uyari-metin"><span class="uyari-buyuk">' + S.kacis(m.buyuk) + '</span>' +
        (m.kucuk ? '<span class="uyari-kucuk">' + S.kacis(m.kucuk) + '</span>' : "") + '</div>' +
        '<div class="uyari-dugmeler"><button type="button" class="uyari-gordum" data-anahtar="' + S.kacis(s.anahtar) +
        '">✔ gördüm</button><a class="uyari-ayrinti" href="#izleme">ayrıntı</a></div></div>';
    }).join("");
    if (u.length > azami) {
      html += '<div class="uyari-fazla">+' + (u.length - azami) + ' uyarı daha — <a class="uyari-ayrinti" href="#izleme">🚨 İzleme sekmesi</a></div>';
    }
    if (u.length > 1) html += '<div class="uyari-alt"><button type="button" class="uyari-hepsi">✔ hepsini gördüm (' + u.length + ')</button></div>';
    bant.innerHTML = html;
    bant.hidden = false;
    // Telefonda panel.js açılışta sayfayı <main>'e kaydırır; bant veriler
    // gelince (sonradan) main'in ÜSTÜNDE belirir ve görünmez kalırdı.
    // Sayfa açılışının ilk 15 saniyesinde BİR KEZ banda kaydır. Adresle
    // belirli bir yere gelinmişse (#rehber/gorev, #gecmis/<gün>) o konum
    // bozulmasın diye kaydırılmaz.
    if (!D.bantKaydirildi && Date.now() - D.baslangic < 15000 && (location.hash || "").indexOf("/") < 0) {
      D.bantKaydirildi = true;
      try {
        var r = bant.getBoundingClientRect();
        if (r.bottom <= 0 || r.top < 0) bant.scrollIntoView({ block: "start" });
      } catch (e) { /* eski tarayıcı */ }
    }
  }

  function gorduIsaretle(anahtarlar) {
    var v = gorulenOku();
    var simdi = Date.now();
    anahtarlar.forEach(function (a) { if (a) v[a] = simdi; });
    gorulenKaydet(v);
    yenile();
    olayAt("izleme");
  }

  function izlemeCiz(gorulen) {
    var kap = $("izleme-kartlar");
    if (!kap) return;
    gorulen = gorulen || {};
    var bos = $("izleme-bos");
    var liste = D.sonuclar.slice();
    // Sıra: GÖRÜLMEMİŞ uyarılar en üstte, sonra görülmüşler, yerindekiler,
    // en sonda bulunamayanlar.
    function sira(x) {
      return Math.min.apply(null, x.sonuclar.map(function (s) {
        var uyari = S.UYARI_DURUMLARI.indexOf(s.durum) >= 0 && !gorulen[s.anahtar];
        return S.durumSirasi(s.durum) - (uyari ? 10 : 0);
      }));
    }
    liste.sort(function (a, b) { return sira(a) - sira(b); });
    if (bos) bos.hidden = liste.length > 0;
    kap.innerHTML = liste.map(function (x) { return kartHtml(x.oge, x.sonuclar, gorulen); }).join("");

    var oz = $("izleme-ozet");
    if (oz) {
      var sayac = { uyari: D.uyarilar.length, ayni: 0, bilinmiyor: 0 };
      D.sonuclar.forEach(function (x) { x.sonuclar.forEach(function (s) {
        if (s.durum === "ayni") sayac.ayni++; else if (s.durum === "bilinmiyor") sayac.bilinmiyor++;
      }); });
      oz.innerHTML = '<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">🚨 İzlenen</span><span class="ozet-deger">' + D.izlenen + '</span></div>' +
        '<div class="ozet-kart' + (sayac.uyari ? " ozet-kart-supheli" : "") + '"><span class="ozet-etiket">⚠️ Yeni uyarı</span><span class="ozet-deger">' + sayac.uyari + '</span></div>' +
        '<div class="ozet-kart"><span class="ozet-etiket">✅ Yerinde</span><span class="ozet-deger">' + sayac.ayni + '</span></div>' +
        '<div class="ozet-kart"><span class="ozet-etiket">❔ Bulunamadı</span><span class="ozet-deger">' + sayac.bilinmiyor + '</span></div>';
    }
    var not = $("izleme-depo-notu");
    if (not) not.hidden = depoCalisiyor();
  }

  function kartHtml(oge, sonuclar, gorulen) {
    var kaynak = (oge.ortak ? '<span class="izleme-kaynak" title="Ortak liste (izleme.json) — herkes görür, buradan silinmez">🌐 ortak</span>' : "") +
      (oge.yerel ? '<span class="izleme-kaynak izleme-kaynak-yerel" title="Bu tarayıcının listesi">📌 benim</span>' : "");
    var sil = oge.yerel ? '<button type="button" class="izleme-sil" data-ad="' + S.kacis(oge.ad) + '" data-tur="' + S.kacis(oge.tur) +
      '" title="Listemden çıkar" aria-label="Listemden çıkar">✖</button>' : "";
    var uyariVar = sonuclar.some(function (s) { return S.UYARI_DURUMLARI.indexOf(s.durum) >= 0 && !gorulen[s.anahtar]; });
    var govde = sonuclar.map(function (s) {
      var gorulmus = S.UYARI_DURUMLARI.indexOf(s.durum) >= 0 && !!gorulen[s.anahtar];
      var baslik = S.durumEtiketi(s);
      var detay = "";
      if (s.durum === "degisti" || s.durum === "kayboldu" || s.durum === "durum_degisti") {
        detay = (s.alt === "geldi" ? s.yeni : s.eski + " → " + s.yeni) + (s.neZaman ? " · " + s.neZaman : "");
      } else if (s.konum) {
        detay = s.konum;
      }
      var ad = (s.ad && S.adKucult(s.ad) !== S.adKucult(oge.ad)) ? '<div class="izleme-alt-ad">' + (s.tur === "ordu" ? "🪖 " : "👤 ") + S.kacis(s.ad) + '</div>' : "";
      var satirlar = s.satirlar.map(function (r) {
        return '<dt>' + S.kacis(r[0]) + '</dt><dd>' + S.kacis(r[1]) + '</dd>';
      }).join("");
      var bag = s.baglantilar.map(function (b) {
        return '<a class="emir-mini-btn izleme-bag" href="' + S.kacis(b[1]) + '">' + S.kacis(b[0]) + '</a>';
      }).join("");
      var gordum = (S.UYARI_DURUMLARI.indexOf(s.durum) >= 0 && !gorulmus)
        ? '<button type="button" class="emir-mini-btn uyari-gordum" data-anahtar="' + S.kacis(s.anahtar) + '">✔ gördüm</button>' : "";
      return '<div class="izleme-sonuc">' + ad +
        '<div class="izleme-durum izleme-durum-' + S.kacis(s.durum) + (gorulmus ? " izleme-gorulmus" : "") + '">' +
        '<b>' + S.kacis(baslik) + '</b>' + (detay ? ' <span>' + S.kacis(detay) + '</span>' : "") +
        (gorulmus ? ' <span class="izleme-gorulmus-not">✔ görüldü</span>' : "") + '</div>' +
        (satirlar ? '<dl class="izleme-bilgi">' + satirlar + '</dl>' : "") +
        '<div class="izleme-baglantilar">' + gordum + bag + '</div></div>';
    }).join("");
    var turAd = { hesap: "👤 hesap", ordu: "🪖 ordu", otomatik: "🔎 otomatik" }[oge.tur] || oge.tur;
    return '<div class="izleme-kart' + (uyariVar ? " izleme-kart-uyari" : "") + '">' +
      '<div class="izleme-kart-ust"><span class="izleme-ad">' + S.kacis(oge.ad) + '</span>' +
      '<span class="izleme-tur">' + S.kacis(turAd) + '</span>' + kaynak + sil + '</div>' +
      (oge.not ? '<div class="izleme-not">📝 ' + S.kacis(oge.not) + '</div>' : "") + govde + '</div>';
  }

  // Öneri listesi (datalist): bugünkü sakinler + ordu adları + komutanlar.
  function oneriGuncelle(veri) {
    var dl = $("izleme-oneriler");
    if (!dl) return;
    var ordu = veri.ordu || {};
    var ordular = (ordu.ordular || []).concat(ordu.ayrilanlar || []);
    var imza = (veri.sakinler || []).length + "|" + ordular.length + "|" + veri.sakinTarihi;
    if (imza === D.oneriImza) return;
    D.oneriImza = imza;
    var parca = document.createDocumentFragment(), gorulen = {};
    function ekle(deger, etiket) {
      deger = String(deger || "").trim();
      if (!deger || gorulen[deger]) return;
      gorulen[deger] = 1;
      var o = document.createElement("option");
      o.value = deger;
      if (etiket) o.label = etiket;
      parca.appendChild(o);
    }
    ordular.forEach(function (o) {
      if (!o) return;
      ekle(o.ad, "🪖 ordu · " + (o.kasaba || ""));
      if (o.komutan) {
        ekle(o.komutan, "🪖 komutan · " + o.ad);
        var i = String(o.komutan).indexOf(":");
        if (i >= 0) ekle(String(o.komutan).slice(i + 1).trim(), "🪖 komutan · " + o.ad);
      }
    });
    (veri.sakinler || []).forEach(function (s) {
      if (s) ekle(s.karakter, "📍 " + (s.kasaba || "") + (s.pr !== undefined ? " · PR " + s.pr : ""));
    });
    dl.textContent = "";
    dl.appendChild(parca);
  }

  function listeyeEkle(yeniler) {
    var liste = yerelListe();
    var mevcut = {};
    liste.forEach(function (o) { mevcut[o.tur + "|" + (o.tur === "ordu" ? S.metinKucult(o.ad) : S.adKucult(o.ad))] = 1; });
    var eklenen = 0;
    (yeniler || []).forEach(function (o) {
      var a = o.tur + "|" + (o.tur === "ordu" ? S.metinKucult(o.ad) : S.adKucult(o.ad));
      if (mevcut[a]) return;
      mevcut[a] = 1;
      liste.push({ ad: o.ad, tur: o.tur, not: o.not || "" });
      eklenen++;
    });
    if (eklenen) yerelKaydet(liste);
    return eklenen;
  }
  function listedenCikar(ad, tur) {
    var a = tur === "ordu" ? S.metinKucult(ad) : S.adKucult(ad);
    var liste = yerelListe().filter(function (o) {
      return !(o.tur === tur && (o.tur === "ordu" ? S.metinKucult(o.ad) : S.adKucult(o.ad)) === a);
    });
    yerelKaydet(liste);
  }

  function panoyaKopyala(metin, durumEl, basariMetni) {
    function yedek() {
      try {
        var ta = document.createElement("textarea");
        ta.value = metin;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand("copy");
        document.body.removeChild(ta);
        durumYaz(durumEl, ok ? basariMetni : "Kopyalanamadı — elle seç: " + metin, !ok);
      } catch (e) { durumYaz(durumEl, "Kopyalanamadı — elle seç: " + metin, true); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(metin).then(function () { durumYaz(durumEl, basariMetni); }, yedek);
        return;
      }
    } catch (e) { /* yedek yola düş */ }
    yedek();
  }

  function izlemeFormuKur() {
    var btn = $("izleme-ekle"), kutu = $("izleme-ad"), tur = $("izleme-tur"), durum = $("izleme-durum");
    if (btn && kutu) {
      var ekle = guvenli(function () {
        var ad = String(kutu.value || "").trim();
        if (!ad) { durumYaz(durum, "Önce bir ad yaz.", true); kutu.focus(); return; }
        if (ad.length > 80) { durumYaz(durum, "Ad çok uzun (en fazla 80 harf).", true); return; }
        var t = S.turNormalize(tur ? tur.value : "otomatik");
        var n = listeyeEkle([{ ad: ad, tur: t }]);
        durumYaz(durum, n ? "✔ " + ad + " izleme listene eklendi." : ad + " zaten listende.");
        if (n) kutu.value = "";
        yenile();
        olayAt("izleme");
      });
      btn.addEventListener("click", ekle);
      kutu.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); ekle(); } });
    }
    var paylas = $("izleme-paylas");
    if (paylas) {
      paylas.addEventListener("click", guvenli(function () {
        var h = S.paylasHash(yerelListe());
        if (!h) { durumYaz(durum, "Önce listene ad ekle — paylaşılacak bir şey yok.", true); return; }
        var url = location.href.split("#")[0] + h;
        panoyaKopyala(url, durum, "🔗 Bağlantı panoya kopyalandı — arkadaşın açınca bu adlar onun listesine de eklenir.");
      }));
    }
    var kap = $("izleme-kartlar");
    if (kap) {
      kap.addEventListener("click", guvenli(function (e) {
        var sil = e.target.closest ? e.target.closest(".izleme-sil") : null;
        if (sil) {
          listedenCikar(sil.getAttribute("data-ad"), sil.getAttribute("data-tur"));
          durumYaz(durum, "✖ " + sil.getAttribute("data-ad") + " listenden çıkarıldı.");
          yenile();
          olayAt("izleme");
          return;
        }
        var gd = e.target.closest ? e.target.closest(".uyari-gordum") : null;
        if (gd) gorduIsaretle([gd.getAttribute("data-anahtar")]);
      }));
    }
    var bant = $("uyari-bandi");
    if (bant) {
      bant.addEventListener("click", guvenli(function (e) {
        var gd = e.target.closest ? e.target.closest(".uyari-gordum") : null;
        if (gd) { gorduIsaretle([gd.getAttribute("data-anahtar")]); return; }
        var hp = e.target.closest ? e.target.closest(".uyari-hepsi") : null;
        if (hp) gorduIsaretle((D.uyarilar || []).map(function (s) { return s.anahtar; }));
      }));
    }
  }

  // 🛡️ Bugünkü nöbet kontrolleri (İzleme sekmesi)
  function kontrolHtml(k) {
    var ordular = Array.isArray(k.ordular) ? k.ordular : [];
    var parca = [
      '<b>' + S.kacis(k.saat || "?") + '</b>', S.kacis(k.kasaba || "?"),
      k.ordu_okundu === false ? "🪖 ordular okunamadı" : "🪖 " + ordular.length + " ordu",
      Array.isArray(k.gruplar) ? "👥 " + k.gruplar.length + " grup" : "👥 gruplar okunamadı"
    ];
    var farklar = Array.isArray(k.farklar) ? k.farklar : [];
    return '<div class="nobet-kontrol' + (farklar.length ? " nobet-kontrol-fark" : "") + '">' +
      '<div class="nobet-ust">🛡️ ' + parca.join(" · ") + '</div>' +
      (farklar.length
        ? '<ul class="nobet-farklar">' + farklar.map(function (f) { return '<li>' + S.kacis((f && (f.metin || f.tip)) || "") + '</li>'; }).join("") + '</ul>'
        : '<div class="nobet-degisiklik-yok">değişiklik yok</div>') +
      (ordular.length ? '<div class="nobet-ordular">' + ordular.map(function (o) {
        return S.kacis(o.ad) + ' <span class="emir-kucuk">(' + S.kacis(o.durum || "") + ')</span>';
      }).join(" · ") + '</div>' : "") + '</div>';
  }

  function nobetCiz() {
    var tarihEl = $("izleme-nobet-tarih"), ozEl = $("izleme-nobet-ozet"), listeEl = $("izleme-nobet-liste");
    if (!tarihEl && !ozEl && !listeEl) return;
    if (D.nobet === undefined) { if (tarihEl) tarihEl.textContent = "yükleniyor…"; return; }
    // ⚠️ [23.09.2026 — inceleme] nobet.json başka günün verisiyse (sabah
    //    yayınında dünkü kalabilir) "bugün" DENMEZ, günü yazılır.
    var nm = S.nobetMetinleri(D.nobet, sakinTarihi());
    if (!nm) {
      if (tarihEl) tarihEl.textContent = "veri yok";
      if (ozEl) ozEl.textContent = "Nöbet verisi henüz yok (nobet.json) — bot ordulu kasabalarda gün içinde kontrol yaptıkça oluşur.";
      if (listeEl) listeEl.innerHTML = "";
      return;
    }
    var oz = nm.oz;
    if (tarihEl) tarihEl.textContent = (oz.tarih || "?") + (oz.son ? " " + oz.son.saat : "") +
      (nm.bugunMu || !nm.etiket ? "" : " (bugünün verisi değil)");
    if (ozEl) ozEl.textContent = nm.baslik;
    if (listeEl) {
      var k = S.kronolojik(D.nobet.kontroller).reverse();
      listeEl.innerHTML = k.length ? k.map(kontrolHtml).join("") : "";
    }
  }

  // Başlangıç kartları için (panel.js basYenile çağırır).
  window.takipOzet = function () {
    // Başka günün nöbeti "bugün N kontrol" diye gösterilmez (nobetMetinleri).
    var nm = D.nobet ? S.nobetMetinleri(D.nobet, sakinTarihi()) : null;
    return { izlenen: D.izlenen || 0, uyari: (D.uyarilar || []).length, nobet: nm ? nm.kart : null };
  };

  // panel.js: #izle/ekle/a,b · #izle/ordu/<ad>
  window.takipHash = guvenli(function (alt, deger) {
    var yeniler = S.hashIzleCoz(alt, deger);
    var n = listeyeEkle(yeniler);
    var durum = $("izleme-durum");
    if (yeniler.length) {
      durumYaz(durum, n ? "🔗 Paylaşılan bağlantıdan " + n + " ad izleme listene eklendi: " +
        yeniler.map(function (o) { return o.ad; }).join(", ") : "Bağlantıdaki adlar zaten listende.");
    }
    try { history.replaceState(null, "", "#izleme"); } catch (e) { /* eski tarayıcı */ }
    yenile();
    olayAt("izleme");
  });

  function nobetYukle() {
    fetch("nobet.json?_=" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { D.nobet = (v && typeof v === "object") ? v : null; })
      .catch(function () { D.nobet = null; })
      .then(function () { guvenli(yenile)(); olayAt("nobet"); });
  }
  function ortakListeYukle() {
    fetch("izleme.json?_=" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { D.ortak = S.izlemeListesiCoz(v && v.liste); })
      .catch(function () { D.ortak = []; })
      .then(function () { guvenli(yenile)(); olayAt("izleme"); });
  }
  // harita.js ordu.json'u yüklemediyse (dosya yüklenemedi vb.) burası çeker.
  function orduYedekYukle() {
    if (window.orduVerisi !== undefined) return;
    fetch("ordu.json?_=" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { D.ordu = v || null; })
      .catch(function () { D.ordu = null; })
      .then(function () { guvenli(yenile)(); });
  }

  // =====================================================================
  // 📅 GEÇMİŞ / TAKVİM
  // =====================================================================
  function gecmisGunleri() {
    var ix = D.gecmis.index;
    return ((ix && ix.gunler) || []).map(function (x) { return x && x.tarih; }).filter(function (t) { return TARIH_RE.test(t || ""); });
  }

  function gecmisSekmesiAcikMi() {
    var p = $("tab-gecmis");
    return !!(p && p.classList.contains("active"));
  }

  function gecmisIndexYukle() {
    var G = D.gecmis;
    if (G.index || G.yukleniyor) return;
    G.yukleniyor = true;
    durumYaz($("gecmis-bilgi"), "Takvim yükleniyor…");
    fetch("gecmis/index.json?_=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(guvenli(function (v) {
        G.index = (v && typeof v === "object") ? v : { gunler: [] };
        var gunler = gecmisGunleri();
        var inp = $("gecmis-tarih");
        if (inp && gunler.length) { inp.min = gunler[0]; inp.max = gunler[gunler.length - 1]; }
        var st = $("gecmis-son-tarih");
        if (st) st.textContent = gunler.length ? gunler[0] + " → " + gunler[gunler.length - 1] + " (" + gunler.length + " gün)" : "veri yok";
        var yok = $("gecmis-yok");
        if (yok) yok.hidden = gunler.length > 0;
        nufusTablosuCiz();
        if (gunler.length) gecmisGunSec(G.bekleyen || gunler[gunler.length - 1], !!G.bekleyen);
        else durumYaz($("gecmis-bilgi"), "");
        olayAt("gecmis");
      }))
      .catch(function (e) {
        G.hata = String(e && e.message || e);
        durumYaz($("gecmis-bilgi"), "");
        var yok = $("gecmis-yok");
        if (yok) yok.hidden = false;
        var st = $("gecmis-son-tarih");
        if (st) st.textContent = "veri yok";
      })
      .then(function () { G.yukleniyor = false; });
  }

  // tarih: istenen gün; kullaniciSecti: sonuç mesajında "istediğin gün yok" denilsin mi
  function gecmisGunSec(tarih, kullaniciSecti) {
    var G = D.gecmis;
    var gunler = gecmisGunleri();
    if (!gunler.length) return;
    var istenen = TARIH_RE.test(tarih || "") ? tarih : gunler[gunler.length - 1];
    var gun = S.enYakinGun(gunler, istenen);
    G.bekleyen = "";
    G.secili = gun;
    var inp = $("gecmis-tarih");
    if (inp) inp.value = gun;
    var onc = $("gecmis-onceki"), snr = $("gecmis-sonraki");
    if (onc) onc.disabled = !S.komsuGun(gunler, gun, -1);
    if (snr) snr.disabled = !S.komsuGun(gunler, gun, 1);
    var bilgi = $("gecmis-bilgi");
    var uyari = (kullaniciSecti && gun !== istenen)
      ? "⚠️ " + istenen + " için veri yok — en yakın gün " + gun + " gösteriliyor." : "";
    durumYaz(bilgi, uyari || gun + " yükleniyor…", !!uyari);
    if (gecmisSekmesiAcikMi() && /^#gecmis/.test(location.hash || "#gecmis")) {
      try { history.replaceState(null, "", "#gecmis/" + gun); } catch (e) { /* eski tarayıcı */ }
    }
    nufusTablosuSeciliIsaretle();
    var no = ++G.yuklemeNo;
    gunDosyasiAl(gun).then(guvenli(function (v) {
      if (no !== G.yuklemeNo) return;          // bu arada başka gün seçildi
      durumYaz(bilgi, uyari || (v ? "" : "⚠️ " + gun + " dosyası okunamadı."), !!uyari || !v);
      gunCiz(v, gun);
    }));
  }

  function gunDosyasiAl(gun) {
    var G = D.gecmis;
    if (G.gunler[gun]) return Promise.resolve(G.gunler[gun]);
    if (!TARIH_RE.test(gun)) return Promise.resolve(null);
    var surum = encodeURIComponent((G.index && G.index.son_guncelleme) || "");
    return fetch("gecmis/" + gun + ".json?v=" + surum)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { if (v && typeof v === "object") G.gunler[gun] = v; return G.gunler[gun] || null; })
      .catch(function () { return null; });
  }

  function farkEtiketi(n) {
    if (n === null || n === undefined || n === 0) return "";
    return n > 0 ? "+" + n : "−" + Math.abs(n);
  }

  function gunCiz(gun, tarih) {
    var ozet = $("gecmis-ozet"), detay = $("gecmis-kasaba-detay"), og = $("gecmis-ordu-grup"),
        nb = $("gecmis-nobet"), rp = $("gecmis-raporlar");
    if (!gun) {
      [ozet, detay, og, nb, rp].forEach(function (el) { if (el) el.innerHTML = ""; });
      return;
    }
    var kas = gun.kasabalar || {};
    var adlar = Object.keys(kas).sort(function (a, b) { return a.localeCompare(b, "tr"); });
    if (D.gecmis.kasaba && !kas[D.gecmis.kasaba]) D.gecmis.kasaba = "";
    if (ozet) {
      var html = '<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">📅 ' + S.kacis(tarih) + ' · toplam</span>' +
        '<span class="ozet-deger">' + (typeof gun.toplam === "number" ? gun.toplam : "—") + '</span>' +
        '<span class="ozet-alt">' + (gun.onceki_tarih ? "önceki veri günü " + S.kacis(gun.onceki_tarih) : "önceki gün yok") + '</span></div>';
      html += adlar.map(function (k) {
        var v = kas[k] || {};
        var gel = (v.gelen || []).length, git = (v.giden || []).length;
        return '<button type="button" class="ozet-kart gecmis-kasaba-kart' + (D.gecmis.kasaba === k ? " secili" : "") +
          '" data-kasaba="' + S.kacis(k) + '"><span class="ozet-etiket">🏘️ ' + S.kacis(k) + '</span>' +
          '<span class="ozet-deger">' + (typeof v.sayi === "number" ? v.sayi : "—") + '</span>' +
          '<span class="ozet-alt">' + (v.resmi_nufus !== null && v.resmi_nufus !== undefined ? "kayıtlı " + S.kacis(v.resmi_nufus) : "kayıtlı ?") +
          ((gel || git) ? ' · <span class="fark-artis">+' + gel + '</span> <span class="fark-dusus">−' + git + '</span>' : "") + '</span></button>';
      }).join("");
      if (!adlar.length) html += '<p class="bos-durum gecmis-uyari">Bu gün için kasaba listesi yok (yalnızca ordu/grup/rapor verisi var).</p>';
      // ⚪ Bu günün + önceki veri gününün taranmayan kasabaları (onceki_taranmayan).
      html += S.gecmisNotlari(gun).map(function (n) {
        return '<p class="envanter-tarih-notu gecmis-taranmayan">' + S.kacis(n) + '</p>';
      }).join("");
      ozet.innerHTML = html;
    }
    kasabaDetayCiz(gun);
    nufusTablosuSeciliIsaretle();
    if (og) og.innerHTML = orduGrupHtml(gun);
    if (nb) {
      var k = S.kronolojik(gun.nobet);
      nb.innerHTML = k.length ? '<h3 class="hareket-alt-baslik">🛡️ O günün nöbet kontrolleri (' + k.length + ')</h3>' + k.map(kontrolHtml).join("") : "";
    }
    if (rp) {
      var R = gun.raporlar || {};
      var tanim = [["hareket_edenler", "🔄 Hareket Edenler"], ["inziva_cikislari", "🔒 İnziva Çıkışları"], ["hareket_gecmisi", "🗺️ Hareket Geçmişi"]];
      var dolu = tanim.filter(function (t) { return R[t[0]]; });
      rp.innerHTML = dolu.length
        ? '<h3 class="hareket-alt-baslik">📄 O günün raporları</h3>' + dolu.map(function (t) {
            return '<details class="gecmis-rapor"><summary>' + t[1] + '</summary><pre>' + S.kacis(R[t[0]]) + '</pre></details>';
          }).join("")
        : "";
    }
    kisiAraCiz();
  }

  function kasabaDetayCiz(gun) {
    var detay = $("gecmis-kasaba-detay");
    if (!detay) return;
    gun = gun || D.gecmis.gunler[D.gecmis.secili];
    var k = D.gecmis.kasaba;
    if (!gun || !k || !gun.kasabalar || !gun.kasabalar[k]) {
      detay.innerHTML = gun && gun.kasabalar && Object.keys(gun.kasabalar).length
        ? '<p class="bolum-aciklama">👆 Bir kasaba kartına tıkla → o günün <b>sakin listesi</b> (PR ile) açılır.</p>' : "";
      return;
    }
    var v = gun.kasabalar[k];
    detay.innerHTML = '<h3 class="hareket-alt-baslik">🏘️ ' + S.kacis(k) + ' — ' + S.kacis(D.gecmis.secili) + ' · ' +
      (v.sayi || 0) + ' kişi' + (v.resmi_nufus !== null && v.resmi_nufus !== undefined ? " (kayıtlı " + S.kacis(v.resmi_nufus) + ")" : "") + '</h3>' +
      '<div class="pazar-arac-cubugu"><input type="search" id="gecmis-sakin-ara" autocomplete="off" placeholder="Bu kasabada ara…">' +
      '<button type="button" class="emir-mini-btn" id="gecmis-kasaba-kapat">✖ kapat</button></div>' +
      '<div class="tablo-sarici tablo-sarici-yapiskan"><table class="gecmis-sakin-tablo"><thead><tr><th>Karakter</th><th>PR</th><th>Not</th></tr></thead>' +
      '<tbody id="gecmis-sakin-govde"></tbody></table></div>' +
      ((v.giden || []).length ? '<p class="bolum-aciklama gecmis-giden">🚪 Bu gün ayrılanlar: ' + v.giden.map(function (c) {
        return '<b>' + S.kacis(c[0]) + '</b> → ' + S.kacis(S.karsiKasabaMetni(c[1], "kasabalarımız dışı"));
      }).join(" · ") + '</p>' : "");
    sakinTablosuCiz();
    // 🏘️ [24.09.2026] Tablodan seçildiyse liste açılınca oraya kaydır.
    if (D.gecmis.kaydir) {
      D.gecmis.kaydir = false;
      if (detay.scrollIntoView) { try { detay.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) { detay.scrollIntoView(); } }
    }
  }

  function sakinTablosuCiz() {
    var govde = $("gecmis-sakin-govde");
    if (!govde) return;
    var gun = D.gecmis.gunler[D.gecmis.secili];
    var v = gun && gun.kasabalar ? gun.kasabalar[D.gecmis.kasaba] : null;
    if (!v) { govde.innerHTML = ""; return; }
    var ara = $("gecmis-sakin-ara");
    var a = S.adKucult(ara ? ara.value : "");
    var gelen = {};
    (v.gelen || []).forEach(function (c) { gelen[S.adKucult(c[0])] = c[1]; });
    var satirlar = (v.sakinler || []).filter(function (c) { return !a || S.adKucult(c[0]).indexOf(a) >= 0; });
    govde.innerHTML = satirlar.length ? satirlar.map(function (c) {
      var kk = S.adKucult(c[0]);
      var not = gelen.hasOwnProperty(kk) ? '<span class="gecmis-gelen">🆕 geldi ← ' + S.kacis(S.karsiKasabaMetni(gelen[kk], "dışarıdan")) + '</span>' : "";
      return '<tr' + (not ? ' class="gecmis-gelen-satir"' : "") + '><td>' + S.kacis(c[0]) + '</td><td>' +
        (c[1] === -1 || c[1] === "-1" ? "?" : S.kacis(c[1])) + '</td><td>' + not + '</td></tr>';
    }).join("") : '<tr><td colspan="3" class="bos-durum">Eşleşen kimse yok.</td></tr>';
  }

  function orduGrupHtml(gun) {
    var k = D.gecmis.kasaba;
    var ordular = (gun.ordular || []).filter(function (o) { return o && (!k || o.kasaba === k); });
    var gruplar = (gun.gruplar || []).filter(function (x) { return x && (!k || x.kasaba === k); });
    var html = '<h3 class="hareket-alt-baslik">🪖 O günün orduları' + (k ? " — " + S.kacis(k) : "") + ' (' + ordular.length + ')</h3>';
    html += ordular.length
      ? '<div class="tablo-sarici"><table class="gecmis-ordu-tablo"><thead><tr><th>Ordu</th><th>Kasaba</th><th>Durum</th><th>Komutan</th></tr></thead><tbody>' +
        ordular.map(function (o) {
          var d = o.durum === "Şehir Dışında";
          return '<tr><td><b>' + S.kacis(o.ad) + '</b></td><td>' + S.kacis(o.kasaba) + '</td><td><span class="konum-rozet' + (d ? " konum-disari" : "") + '">' +
            (d ? "🟠 " : "🟢 ") + S.kacis(o.durum) + '</span></td><td>' + S.kacis(o.komutan) + '</td></tr>';
        }).join("") + '</tbody></table></div>'
      : '<p class="bos-durum">Kayıtlı ordu yok.</p>';
    var taranan = gun.grup_taranan || [];
    html += '<h3 class="hareket-alt-baslik">👥 O günün grupları' + (k ? " — " + S.kacis(k) : "") + ' (' + gruplar.length + ')</h3>';
    if (k && taranan.length && taranan.indexOf(k) < 0) {
      html += '<p class="bolum-aciklama">⚪ Bu gün ' + S.kacis(k) + ' için grup tablosu taranmadı — "grup yok" demek DEĞİLDİR.</p>';
    } else if (!taranan.length && !gruplar.length) {
      html += '<p class="bolum-aciklama">⚪ Bu gün grup taraması yok.</p>';
    }
    if (gruplar.length) {
      html += '<div class="tablo-sarici"><table class="gecmis-grup-tablo"><thead><tr><th>Kasaba</th><th>Lider</th><th>Üyeler</th><th>Tür</th><th>Katılım</th></tr></thead><tbody>' +
        gruplar.map(function (x) {
          return '<tr><td>' + S.kacis(x.kasaba) + '</td><td><b>' + S.kacis(x.lider) + '</b></td><td>' +
            (x.uyeler || []).map(S.kacis).join(", ") + '</td><td>' + S.kacis(x.tur) + '</td><td>' + S.kacis(x.katilim) + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    return html;
  }

  function kisiAraCiz() {
    var kutu = $("gecmis-kisi-ara"), sonuc = $("gecmis-kisi-sonuc");
    if (!kutu || !sonuc) return;
    var gun = D.gecmis.gunler[D.gecmis.secili];
    var metin = String(kutu.value || "").trim();
    if (!metin) { sonuc.innerHTML = ""; return; }
    if (!gun) { sonuc.textContent = "Önce bir gün seç."; return; }
    var bul = S.gundeKisiAra(gun, metin);
    sonuc.innerHTML = bul.length
      ? '<ul class="gecmis-kisi-liste">' + bul.map(function (b) {
          return '<li><b>' + S.kacis(b.ad) + '</b> → ' + (b.kasaba ? '<a href="#" class="gecmis-kasaba-git bas-link" data-kasaba="' + S.kacis(b.kasaba) + '">' +
            S.kacis(b.kasaba) + '</a>' + (b.pr !== null && b.pr !== undefined ? ' <span class="emir-kucuk">PR ' + S.kacis(b.pr === -1 ? "?" : b.pr) + '</span>' : "") : "") +
            (b.not ? ' <span class="emir-kucuk">' + S.kacis(b.not) + '</span>' : "") + '</li>';
        }).join("") + '</ul>'
      : '<p class="bolum-aciklama">' + S.kacis(D.gecmis.secili) + ' günü "' + S.kacis(metin) + '" 7 kasabanın hiçbirinde yok.</p>';
  }

  function nufusTablosuCiz() {
    var tablo = $("gecmis-nufus-tablo");
    if (!tablo || !D.gecmis.index) return;
    var t = S.nufusTablosu(D.gecmis.index, 14);
    var thead = tablo.querySelector("thead"), tbody = tablo.querySelector("tbody");
    if (!thead || !tbody) return;
    if (!t.gunler.length) { thead.innerHTML = ""; tbody.innerHTML = '<tr><td class="bos-durum">Kasaba listesi olan gün yok.</td></tr>'; return; }
    thead.innerHTML = '<tr><th>Kasaba</th>' + t.gunler.map(function (g) {
      return '<th class="gecmis-gun-baslik" data-tarih="' + S.kacis(g) + '" title="' + S.kacis(g) + ' gününe git">' + S.kacis(S.kisaGun(g)) + '</th>';
    }).join("") + '</tr>';
    // 🏘️ [24.09.2026] Hücre artık KASABASINI da taşır (data-kasaba). Kullanıcı:
    //    *"tablodan tıkladığım ili göstersin, aşağıdan seçtirmeyi de yapsın."*
    //    Eskiden hücre yalnızca tarihi taşıyordu → gün değişiyor, kasaba
    //    seçimi eski kalıyordu (hangi satıra tıklansa Ardencaple görünüyordu).
    //    Toplam satırında data-kasaba="" → kasaba seçimi temizlenir.
    function hucre(h, ekSinif, kas) {
      var sinif = "gecmis-hucre" + (ekSinif || "") + (h.fark > 0 ? " gecmis-artti" : h.fark < 0 ? " gecmis-azaldi" : "");
      var baslik = (kas ? kas + " · " : "") + h.tarih + (h.resmi !== null && h.resmi !== undefined ? " · kayıtlı " + h.resmi : "") + (h.fark ? " · önceki güne göre " + farkEtiketi(h.fark) : "");
      return '<td class="' + sinif + '" data-tarih="' + S.kacis(h.tarih) + '" data-kasaba="' + S.kacis(kas || "") + '" title="' + S.kacis(baslik) + '">' +
        (h.sayi === null ? "—" : S.kacis(h.sayi)) + (h.fark ? '<span class="gecmis-fark">' + S.kacis(farkEtiketi(h.fark)) + '</span>' : "") + '</td>';
    }
    tbody.innerHTML = t.satirlar.map(function (s) {
      return '<tr><th scope="row" class="gecmis-satir-kasaba" data-kasaba="' + S.kacis(s.kasaba) + '" title="' +
        S.kacis(s.kasaba) + ' — seçili günün sakin listesini aç">' + S.kacis(s.kasaba) + '</th>' +
        s.hucreler.map(function (h) { return hucre(h, "", s.kasaba); }).join("") + '</tr>';
    }).join("") + '<tr class="gecmis-toplam-satir"><th scope="row">Toplam</th>' + t.toplam.map(function (h) { return hucre(h, " gecmis-toplam", ""); }).join("") + '</tr>';
    nufusTablosuSeciliIsaretle();
  }
  function nufusTablosuSeciliIsaretle() {
    var tablo = $("gecmis-nufus-tablo");
    if (!tablo) return;
    Array.prototype.forEach.call(tablo.querySelectorAll("[data-tarih]"), function (el) {
      el.classList.toggle("gecmis-secili-gun", el.getAttribute("data-tarih") === D.gecmis.secili);
      // Seçili gün + seçili kasaba kesişimi: hangi hücrenin açık olduğu görünsün.
      el.classList.toggle("gecmis-secili-hucre", !!D.gecmis.kasaba &&
        el.getAttribute("data-tarih") === D.gecmis.secili &&
        el.getAttribute("data-kasaba") === D.gecmis.kasaba);
    });
    Array.prototype.forEach.call(tablo.querySelectorAll(".gecmis-satir-kasaba"), function (el) {
      el.classList.toggle("gecmis-secili-kasaba", el.getAttribute("data-kasaba") === D.gecmis.kasaba);
    });
  }

  function gecmisKur() {
    var panel = $("tab-gecmis");
    if (!panel) return;
    // Telefonda 14 günlük tablo katlı başlasın (gün ayrıntısı yukarıda kalsın).
    var ondort = panel.querySelector(".gecmis-14");
    if (ondort && window.innerWidth < 700) ondort.open = false;
    var inp = $("gecmis-tarih");
    if (inp) inp.addEventListener("change", guvenli(function () { if (inp.value) gecmisGunSec(inp.value, true); }));
    var onc = $("gecmis-onceki"), snr = $("gecmis-sonraki");
    function adim(yon) {
      return guvenli(function () {
        var h = S.komsuGun(gecmisGunleri(), D.gecmis.secili, yon);
        if (h) gecmisGunSec(h, false);
      });
    }
    if (onc) onc.addEventListener("click", adim(-1));
    if (snr) snr.addEventListener("click", adim(1));
    var ara = $("gecmis-kisi-ara");
    if (ara) ara.addEventListener("input", guvenli(kisiAraCiz));
    panel.addEventListener("click", guvenli(function (e) {
      var kart = e.target.closest ? e.target.closest(".gecmis-kasaba-kart, .gecmis-kasaba-git") : null;
      if (kart) {
        e.preventDefault();
        var k = kart.getAttribute("data-kasaba");
        D.gecmis.kasaba = (D.gecmis.kasaba === k && kart.classList.contains("gecmis-kasaba-kart")) ? "" : k;
        var gun = D.gecmis.gunler[D.gecmis.secili];
        if (gun) {
          Array.prototype.forEach.call(panel.querySelectorAll(".gecmis-kasaba-kart"), function (b) {
            b.classList.toggle("secili", b.getAttribute("data-kasaba") === D.gecmis.kasaba);
          });
          kasabaDetayCiz(gun);
          nufusTablosuSeciliIsaretle();
          var og = $("gecmis-ordu-grup");
          if (og) og.innerHTML = orduGrupHtml(gun);
          var d = $("gecmis-kasaba-detay");
          if (D.gecmis.kasaba && d && d.scrollIntoView) { try { d.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) { d.scrollIntoView(); } }
        }
        return;
      }
      if (e.target.closest && e.target.closest("#gecmis-kasaba-kapat")) {
        D.gecmis.kasaba = "";
        var gun2 = D.gecmis.gunler[D.gecmis.secili];
        if (gun2) gunCiz(gun2, D.gecmis.secili);
        return;
      }
      // 🏘️ [24.09.2026] Tablodaki kasaba ADINA tıklanınca: seçili günde o kasaba.
      var satirEl = e.target.closest ? e.target.closest("#gecmis-nufus-tablo .gecmis-satir-kasaba") : null;
      if (satirEl) {
        D.gecmis.kasaba = satirEl.getAttribute("data-kasaba") || "";
        D.gecmis.kaydir = true;
        var gun3 = D.gecmis.gunler[D.gecmis.secili];
        if (gun3) gunCiz(gun3, D.gecmis.secili);
        else gecmisGunSec(D.gecmis.secili, false);
        return;
      }
      var gunEl = e.target.closest ? e.target.closest("#gecmis-nufus-tablo [data-tarih]") : null;
      if (gunEl) {
        // Hücre = gün + kasaba (Toplam satırında kasaba boş → seçim temizlenir).
        if (gunEl.hasAttribute("data-kasaba")) {
          D.gecmis.kasaba = gunEl.getAttribute("data-kasaba") || "";
          D.gecmis.kaydir = !!D.gecmis.kasaba;
        }
        gecmisGunSec(gunEl.getAttribute("data-tarih"), false);
      }
    }));
    panel.addEventListener("input", guvenli(function (e) {
      if (e.target && e.target.id === "gecmis-sakin-ara") sakinTablosuCiz();
    }));
    // Sekme İLK açıldığında yükle (düğme · adres · grup düğmesi — hangi yoldan
    // açılırsa açılsın panelin "active" sınıfı değişir).
    var bak = guvenli(function () { if (gecmisSekmesiAcikMi()) gecmisIndexYukle(); });
    if (window.MutationObserver) {
      try { new MutationObserver(bak).observe(panel, { attributes: true, attributeFilter: ["class"] }); } catch (e) { /* yedek aşağıda */ }
    }
    document.addEventListener("click", function (e) {
      var tb = e.target.closest ? e.target.closest('.tab-btn[data-tab="gecmis"]') : null;
      if (tb) setTimeout(bak, 0);
    });
    bak();
  }

  // panel.js: #gecmis/<YYYY-MM-DD>
  window.takipGecmisGun = guvenli(function (tarih) {
    if (!TARIH_RE.test(tarih || "")) return;
    if (D.gecmis.index) gecmisGunSec(tarih, true);
    else { D.gecmis.bekleyen = tarih; gecmisIndexYukle(); }
  });

  // =====================================================================
  // ⚔️ ORDU — üyelerimiz + hadiseler (ordu_hadise.json, 25.09.2026)
  // Dosya YALNIZCA sekme ilk açılınca yüklenir (Geçmiş ile aynı desen).
  // Oyundan gelen her metin (hadise, ordu/komutan adı) S.kacis'ten geçer.
  // =====================================================================
  function orduSekmesiAcikMi() {
    var p = $("tab-ordu");
    return !!(p && p.classList.contains("active"));
  }

  function orduHadiseYukle() {
    var O = D.orduHadise;
    if (O.veri || O.yukleniyor) return;
    O.yukleniyor = true;
    durumYaz($("ordu-hadise-sayi"), "Ordu verisi yükleniyor…");
    fetch("ordu_hadise.json?_=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(guvenli(function (v) {
        O.yukleniyor = false;
        O.veri = (v && typeof v === "object") ? v : { uyeler: [], gunler: [] };
        O.hata = "";
        window.orduHadiseVerisi = O.veri;          // panel.js genel araması
        var t = $("ordu-hadise-tarih");
        if (t) t.textContent = O.veri.son_guncelleme || "tarih yok";
        orduHesapSecenekleri();
        orduCiz();
        olayAt("ordu_hadise");
      }))
      .catch(function (e) {
        // 404 = dosya henüz üretilmedi (bot hiçbir ordu hesabına girmedi).
        // Veri tutulmaz → sekme bir daha açılınca yeniden denenir.
        O.yukleniyor = false;
        O.hata = String(e && e.message || e);
        var t = $("ordu-hadise-tarih");
        if (t) t.textContent = "veri yok (ordu_hadise.json henüz oluşmadı)";
        guvenli(orduCiz)();
      })
      .then(function () { O.yukleniyor = false; });
  }

  function orduSuzgecOku() {
    var sel = $("ordu-hadise-hesap"), chk = $("ordu-hadise-kavga"), ara = $("ordu-hadise-ara");
    return { hesap: sel ? sel.value : "", sadeceKavga: !!(chk && chk.checked), ara: ara ? ara.value : "" };
  }

  function orduHesapSecenekleri() {
    var sel = $("ordu-hadise-hesap");
    if (!sel) return;
    var onceki = sel.value;
    var adlar = S.orduHesaplari(D.orduHadise.veri);
    sel.innerHTML = '<option value="">👤 Tüm hesaplar (' + adlar.length + ')</option>' + adlar.map(function (a) {
      return '<option value="' + S.kacis(a) + '">' + S.kacis(a) + '</option>';
    }).join("");
    if (onceki && adlar.some(function (a) { return a === onceki; })) sel.value = onceki;
  }

  function orduCiz() {
    orduOzetCiz();
    orduUyeCiz();
    orduHadiseCiz();
  }

  function orduOzetCiz() {
    var el = $("ordu-ozet");
    if (!el) return;
    var v = D.orduHadise.veri;
    if (!v) { el.innerHTML = ""; return; }
    var oz = v.ozet || {};
    var sayi = function (n) { return typeof n === "number" ? n : 0; };
    var kartlar = [
      ["🪖 ordudaki hesabımız", sayi(oz.uye), (Array.isArray(v.uyeler) ? v.uyeler.length : 0) + " kayıtlı hesap"],
      ["📜 hadise", sayi(oz.toplam), "son " + (v.gun_sayisi || 30) + " gün · " + sayi(oz.hesap) + " hesaptan"],
      ["⚔️ çatışma", sayi(oz.kavga), "💀 " + sayi(oz.olum) + " ölüm · 🩸 " + sayi(oz.yara) + " yara"],
      ["👁️ gördüklerin", sayi(oz.gorus), "“Gördüklerin” kayıtları"]
    ];
    el.innerHTML = kartlar.map(function (k, i) {
      return '<div class="ozet-kart' + (i === 2 && sayi(oz.kavga) ? " ordu-ozet-kavga" : "") + '"><span class="ozet-etiket">' + S.kacis(k[0]) +
        '</span><span class="ozet-deger">' + S.kacis(k[1]) + '</span><span class="ozet-alt">' + S.kacis(k[2]) + '</span></div>';
    }).join("");
  }

  function orduUyeCiz() {
    var govde = $("ordu-uye-govde"), yok = $("ordu-uye-yok");
    var v = D.orduHadise.veri;
    var uyeler = S.orduUyeSirala(v && v.uyeler);
    if (govde) govde.innerHTML = uyeler.map(S.orduUyeSatirHtml).join("");
    if (yok) yok.hidden = uyeler.length > 0 || D.orduHadise.yukleniyor;
  }

  function orduHadiseCiz() {
    var liste = $("ordu-hadise-liste"), bos = $("ordu-hadise-bos"), sayi = $("ordu-hadise-sayi");
    var O = D.orduHadise;
    var tum = (O.veri && Array.isArray(O.veri.gunler)) ? O.veri.gunler : [];
    var s = orduSuzgecOku();
    var gunler = S.orduHadiseSuz(tum, s);
    var toplam = S.orduHadiseSayisi(tum), gorunen = S.orduHadiseSayisi(gunler);
    if (bos) bos.hidden = O.yukleniyor || !(O.veri || O.hata) || toplam > 0;
    if (sayi) {
      durumYaz(sayi, !toplam ? "" : (gorunen === toplam
        ? toplam + " hadise · " + gunler.length + " gün"
        : toplam + " hadisenin " + gorunen + " tanesi gösteriliyor · " + gunler.length + " gün"));
    }
    if (!liste) return;
    if (toplam && !gorunen) {
      liste.innerHTML = '<p class="bos-durum">Süzgece uyan hadise yok — hesap / arama kutusunu temizle.</p>';
      return;
    }
    var acik = S.orduSuzgecAcikMi(s);
    // İlk 5 gün açık gelir; süzgeç açıksa hepsi (aranan kayıt katlı günde kalmasın).
    liste.innerHTML = gunler.map(function (g, i) { return S.orduGunHtml(g, acik || i < 5); }).join("");
  }

  function orduKur() {
    var panel = $("tab-ordu");
    if (!panel) return;
    var ciz = guvenli(orduHadiseCiz);
    var sel = $("ordu-hadise-hesap"), chk = $("ordu-hadise-kavga"), ara = $("ordu-hadise-ara");
    if (sel) sel.addEventListener("change", ciz);
    if (chk) chk.addEventListener("change", ciz);
    if (ara) ara.addEventListener("input", ciz);
    // Üye tablosundaki 📜 → o hesabın hadiseleri.
    panel.addEventListener("click", guvenli(function (e) {
      var b = e.target.closest ? e.target.closest(".ordu-hesap-suz") : null;
      if (!b) return;
      var ad = b.getAttribute("data-hesap") || "";
      var s2 = $("ordu-hadise-hesap");
      if (s2) s2.value = ad;
      orduHadiseCiz();
      var l = $("ordu-hadise-liste");
      if (l && l.scrollIntoView) { try { l.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) { l.scrollIntoView(); } }
    }));
    // Sekme İLK açıldığında yükle (düğme · adres · grup düğmesi — hangi yoldan
    // açılırsa açılsın panelin "active" sınıfı değişir).
    var bak = guvenli(function () { if (orduSekmesiAcikMi()) orduHadiseYukle(); });
    if (window.MutationObserver) {
      try { new MutationObserver(bak).observe(panel, { attributes: true, attributeFilter: ["class"] }); } catch (e) { /* yedek aşağıda */ }
    }
    document.addEventListener("click", function (e) {
      var tb = e.target.closest ? e.target.closest('.tab-btn[data-tab="ordu"]') : null;
      if (tb) setTimeout(bak, 0);
    });
    bak();
  }

  // =====================================================================
  // 📊 GELİŞİM SÜZGECİ (script.js gelisimTabloCiz → window.gelisimEkSuzgec)
  // =====================================================================
  function suzgecOku() {
    var ad = $("gelisim-arama"), bas = $("gelisim-kayit-bas"), bit = $("gelisim-kayit-bit"), bil = $("gelisim-kayit-bilinmeyen");
    return {
      ad: ad ? ad.value : "",
      bas: bas && TARIH_RE.test(bas.value || "") ? bas.value : "",
      bit: bit && TARIH_RE.test(bit.value || "") ? bit.value : "",
      bilinmeyen: bil ? !!bil.checked : true
    };
  }
  function tabloyuCiz() {
    if (typeof window.gelisimTabloCiz === "function") {
      try { window.gelisimTabloCiz(); } catch (e) { try { console.error("gelisimTabloCiz:", e); } catch (e2) {} }
    }
  }
  function sayacYaz() {
    var el = $("gelisim-sonuc-sayisi");
    var tum = g("gelisimKarakterler", []);
    var n = (D.gelisimGorunen || []).length;
    if (el) {
      el.textContent = !tum.length ? "" : (n === tum.length ? n + " hesap"
        : tum.length + " hesabın " + n + " tanesi gösteriliyor") + (S.suzgecAcikMi(D.gelisimSuzgec) ? " · 🔎 süzgeç açık" : "");
    }
    var yok = $("gelisim-sonuc-yok");
    if (yok && tum.length && !n) yok.textContent = "Süzgece uyan hesap yok — arama / tarih kutularını temizle.";
  }
  function gelisimSuzgecKur() {
    if (!$("gelisim-arama") && !$("gelisim-kayit-bas")) return;
    D.gelisimSuzgec = suzgecOku();
    window.gelisimEkSuzgec = function (k) { return S.gelisimSuzgecUygun(k, D.gelisimSuzgec); };
    window.gelisimCizildi = function (gorunen) { D.gelisimGorunen = Array.isArray(gorunen) ? gorunen.slice() : []; sayacYaz(); };
    var tazele = guvenli(function () { D.gelisimSuzgec = suzgecOku(); tabloyuCiz(); });
    [["gelisim-arama", "input"], ["gelisim-kayit-bas", "change"], ["gelisim-kayit-bit", "change"],
     ["gelisim-kayit-bilinmeyen", "change"]].forEach(function (x) {
      var el = $(x[0]);
      if (el) el.addEventListener(x[1], tazele);
    });
    var durum = $("gelisim-disa-durum");
    var kop = $("gelisim-disa-kopyala");
    if (kop) kop.addEventListener("click", guvenli(function () {
      var liste = D.gelisimGorunen || [];
      if (!liste.length) { durumYaz(durum || $("gelisim-sonuc-sayisi"), "Kopyalanacak satır yok.", true); return; }
      panoyaKopyala(S.nickListesi(liste), durum || $("gelisim-sonuc-sayisi"), "📋 " + liste.length + " nick panoya kopyalandı.");
    }));
    var csv = $("gelisim-disa-csv");
    if (csv) csv.addEventListener("click", guvenli(function () {
      var liste = D.gelisimGorunen || [];
      if (!liste.length) { durumYaz(durum || $("gelisim-sonuc-sayisi"), "İndirilecek satır yok.", true); return; }
      var blob = new Blob([S.gelisimCsv(liste)], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date();
      a.href = url;
      a.download = "hesaplarimiz_" + d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
      durumYaz(durum || $("gelisim-sonuc-sayisi"), "⬇️ " + liste.length + " satır CSV olarak indirildi.");
    }));
    // Gelişim verisi takip.js'ten ÖNCE yüklendiyse tabloyu süzgeçle yeniden çiz.
    if (g("gelisimKarakterler", []).length) tabloyuCiz();
  }

  // =====================================================================
  // KURULUM
  // =====================================================================
  function kur() {
    guvenli(izlemeFormuKur)();
    guvenli(gecmisKur)();
    guvenli(orduKur)();
    guvenli(gelisimSuzgecKur)();
    // Paylaşılan bağlantıyla gelindiyse (panel.js'ten önce de çalışabiliriz).
    var h = location.hash || "";
    if (/^#izle\//.test(h)) {
      var p = h.slice(1).split("/");
      var deger = p.slice(2).join("/");
      try { deger = decodeURIComponent(deger); } catch (e) { /* ham kalsın */ }
      window.takipHash(p[1] || "", deger);
    } else if (/^#gecmis\/\d{4}-\d{2}-\d{2}/.test(h)) {
      D.gecmis.bekleyen = h.slice(8, 18);
    }
    document.addEventListener("veri-hazir", function (e) {
      var ad = e && e.detail;
      if (KENDI_OLAYLAR[ad]) return;
      yenileGecikmeli();
    });
    nobetYukle();
    ortakListeYukle();
    setTimeout(guvenli(orduYedekYukle), 4000);
    yenile();
  }
  try { kur(); } catch (e) { try { console.error("takip.js kurulamadı:", e); } catch (e2) { /* sessiz */ } }
})();

if (typeof module !== "undefined") module.exports = TakipSaf;

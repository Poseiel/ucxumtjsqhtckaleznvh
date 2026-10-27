// =========================================================
// 📨 EMİR SEKMESİ — Telegram şablonlarını formla üretir
// ---------------------------------------------------------
// NEDEN VAR: emirler elle yazılıyordu; tek harf hatası (ya da oyundaki adın
// birebir yazılmaması) emrin sessizce yok sayılmasına yol açıyordu. Artık
// eşya adları CANLI veriden seçiliyor:
//   satış  -> envanter.json (o karakterde gerçekten ne varsa)
//   alım   -> pazar.json    (pazarda gerçekten ne satılıyorsa)
//   ödenek -> sancak.json   (eyalet deposunda ne varsa)
//
// ⚠️ ETİKETLER BOTUN OKUDUĞU İSİMLERDİR, DEĞİŞTİRME:
//     satış/alım -> pazar_emirleri._ETIKETLER
//     ödenek     -> divan_ticaret._ETIKETLER
// ⚠️ SAYI BİÇİMİ: binlik ayracı YOK, ondalık VİRGÜL ("4,5"). Bot tarafında
//     sayi_coz/akce_coz noktayı BİNLİK ayracı sayar; "4.5" yazarsak 45 okur.
// =========================================================

// Tek tık gönderim adresi. Sayfa buraya yazar, bot tur başında buradan okur.
// Jeton/şifre GEREKTİRMEZ — yani siteye gizli bir bilgi konmuş olmuyor.
var EMIR_NTFY_KONU = "poseidon-emir-7b3f9c21a5d4";
var EMIR_NTFY_AKTIF = false; // bot tarafı yayına girince true yapılır

var EMIR_NL = String.fromCharCode(10);
// 🏛️ Oyunun eyalet pazarındaki fiyat tavanı — `pazar_ekstra.py` ve
//    `pazar_emirleri.py` ile AYNI sayı olmalı (üç yerde de 999,95).
var EYALET_AZAMI_FIYAT = 999.95;
// Rezerve boşsa satın alacak hesabın en az akçesi (pazar_emirleri.py).
var EYALET_ALICI_ASGARI_AKCE = 10000;
// 🧾 [21.10.2026 — İŞ 24] KATEGORİ malzeme — bot `kategori_satis.KATEGORI_ADLARI` ile
//    BİREBİR (test_kategori_satis E). Her eşleşen eşya AYRI ilanla satılır; meslek
//    hammaddesi / ödenek malı / Midas sandığı / bugünkü yemek payı KORUNUR.
var SAT_KATEGORILERI = [
  ["tüm otlar", "🌿 Kategori — hesabın elindeki bütün şifalı otlar"],
  ["tüm yemekler", "🍽️ Kategori — bütün yiyecekler (bugünkü yemek payı kalır)"],
  ["tüm kuvvet verenler", "💪 Kategori — Kuvvet veren yiyecekler"],
  ["tüm zeka verenler", "🧠 Kategori — Zeka veren yiyecekler"],
  ["tüm karizma verenler", "🎭 Kategori — Karizma veren yiyecekler"]
];

// 🧾 Malzeme kutusundaki yazı bir kategori mi? (öneri listesindeki biçimler)
function emirSatisKategori(mal) {
  var k = emirKucult(mal);
  for (var i = 0; i < SAT_KATEGORILERI.length; i++) {
    if (emirKucult(SAT_KATEGORILERI[i][0]) === k) return SAT_KATEGORILERI[i];
  }
  return null;
}

var emirEnvanter = [];   // [{karakter, kasaba, akce, esyalar:[{isim,adet}]}]
var emirPazar = [];      // [{isim, adet, fiyat, kasaba}]
var emirSancaklar = [];  // [{sancak, kasaba, esyalar:[...]}]
var emirGelisim = [];    // [{karakter, kasaba, gorevler:[...]}] — nazır listesi için
var emirNazirlar = [];   // [{ad, yer, sancakNo}] — ödeneği VEREBİLECEK hesaplar
var emirTur = "sat";

function emirKacis(metin) {
  return String(metin)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split(String.fromCharCode(34)).join("&quot;");
}

function emirSayiYaz(n) {
  // 500 -> "500" ; 4.5 -> "4,5" (nokta ASLA kullanılmaz, bot onu binlik sanar)
  var yuvarlak = Math.round(n * 100) / 100;
  if (Math.abs(yuvarlak - Math.round(yuvarlak)) < 0.0001) return String(Math.round(yuvarlak));
  return String(yuvarlak).split(".").join(",");
}

function emirDeger(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function emirSayi(id) {
  var ham = emirDeger(id).split(",").join(".");
  var s = parseFloat(ham);
  return isNaN(s) ? 0 : s;
}

function emirKucult(metin) {
  return String(metin || "").toLocaleLowerCase("tr");
}

// ---------------------------------------------------------
// VERİ YÜKLEME
// ---------------------------------------------------------
async function emirYukle() {
  try {
    var sonuclar = await Promise.all([
      fetch("envanter.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("pazar.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("sancak.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("gelisim.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]);
    emirEnvanter = (sonuclar[0] && sonuclar[0].karakterler) || [];
    emirPazar = (sonuclar[1] && sonuclar[1].urunler) || [];
    emirSancaklar = (sonuclar[2] && sonuclar[2].sancaklar) || [];
    emirGelisim = (sonuclar[3] && sonuclar[3].karakterler) || [];
  } catch (hata) {
    console.error("Emir verisi yüklenemedi", hata);
  }
  emirHesaplariDoldur();
  dersListesiniDoldur();
  emirPazarListesiDoldur();
  emirSancakDoldur();
  emirNazirlariDoldur();
  emirOdenekSatirEkle();
  emirDipnotYaz();
  emirGuncelle();
}

// 🎓 [03.09.2026] OYUNUN TAM DERS LİSTESİ (43 ders).
// Kaynak: canlı `select#connaissance` (ders verme ekranı).
// ⚠️ Tek kaynak `ders_dinleme.TUM_DERSLER` — burası onun kopyasıdır;
//    biri değişirse diğeri de güncellenmeli.
var DERS_LISTESI = [
  "Dil1 - Latince",
  "Dil3 - Osmanlıca",
  "Dil2 - Antik Yunanca",
  "Dil4 - Arapça",
  "İlim1 - Biyolojinin Temelleri",
  "Devlet1 - Tarihe Giriş",
  "Devlet2 - Devlet Kurumlarının İncelenmesi",
  "Devlet3 - Hukuk İlkeleri",
  "Devlet4 - İletişim Teknikleri",
  "Devlet5 - Vergi Toplama Yöntemleri",
  "Devlet6 - Ticaret",
  "Din5 - İslam Dini: Düzeni ve Tarihi",
  "Din1 - İbn-i Rüşt'ün Ahlak Kuralları",
  "İlim2 - Anatominin Temelleri",
  "İlim3 - Tıbbın Temelleri",
  "İlim4 - Temel Kimya",
  "İlim5 - İlkyardım",
  "İlim6 - Yıldızbilimi",
  "İlim8 - Bitkisel Tedavi",
  "İlim9 - Bitki Bilimi",
  "İlim7 - Gelişmiş Tıp",
  "Din2 - Mantık",
  "Din3 - Varoluş Yetisi",
  "Din4 - Kainatın Başlangıcı",
  "Ordu1 - Askeriyenin Temelleri",
  "Ordu2 - Temel Taktik",
  "Ordu3 - Temel Strateji",
  "Ordu4 - Gelişmiş Strateji",
  "Bilim1 - Taş Ustalığı",
  "Denizcilik1 - Temel Denizcilik",
  "Denizcilik2 - Astronomi",
  "Denizcilik3 - Gelişmiş Denizcilik",
  "Denizcilik4 - Temel Gemi Mühendisliği",
  "Denizcilik5 - Gelişmiş Gemi Mühendisliği",
  "Denizcilik6 - Uzman Denizcilik",
  "Denizcilik7 - Temel Deniz Muharebesi",
  "Denizcilik8 - Gelişmiş Deniz Muharebesi",
  "İlim10 - Damıtımcılık",
  "İlim11 - Temel Eczacılık",
  "İlim12 - Temel Doğa Bilimi",
  "İlim13 - Gelişmiş Eczacılık",
  "İlim14 - Gelişmiş Doğa Bilimi",
  "Dil5 - Lingua Prohibita (Yasak Dil)"
];

function dersListesiniDoldur() {
  var dl = document.getElementById("ders-listesi");
  if (!dl) return;
  dl.innerHTML = DERS_LISTESI.map(function (a) {
    return "<option value=" + String.fromCharCode(34) + emirKacis(a) +
           String.fromCharCode(34) + "></option>";
  }).join("");
}

function emirHesaplariDoldur() {
  var dl = document.getElementById("emir-hesap-listesi");
  if (!dl) return;
  var adlar = emirEnvanter.map(function (k) { return k.karakter; }).filter(Boolean);
  adlar.sort(function (a, b) { return a.localeCompare(b, "tr"); });
  dl.innerHTML = adlar.map(function (a) {
    return "<option value=" + String.fromCharCode(34) + emirKacis(a) + String.fromCharCode(34) + "></option>";
  }).join("");
}

// =========================================================
// 🏛️ KASABA KISITI — mal NEREDE satılabiliyorsa alıcı da ORADA olmalı
// =========================================================
// Kullanıcı (03.09.2026, birebir): *"sancak envanteri satılırken sadece
// başkentteki pazarda satılıyor. o yüzden sitede eyalet adına satta
// karakter seçtirirken sadece o eyaletin başkentindeki şehirdeki hesaplar
// çıksın."* + *"emir verirken de girdiğim hesap hangi kasabadaysa o
// kasabadakilere satabilir, seçenekleri o kasabadakilere azaltsan."*
//
// ⚠️ Sebep: oyunda pazar KASABA bazlıdır. Başka kasabadaki bir hesabı
//    alıcı yazmak, malın orada beklemesi ve kimsenin alamaması demektir.
var SANCAK_BASKENTI = {
  "glasgow": "Glasgow",     // KUZEY  — Glasgow · Stirling · Ardencaple
  "galloway": "Wigtown"     // GÜNEY  — Whithorn · Wigtown · Kirkcudbright · Girvan
};

function emirBaskentBul(sancakAdi) {
  var a = emirKucult(sancakAdi || "").trim();
  for (var k in SANCAK_BASKENTI) {
    if (a.indexOf(k) >= 0) return SANCAK_BASKENTI[k];
  }
  return "";   // tanınmayan sancak → kısıt UYGULANMAZ (eski davranış)
}

function emirKasabadakiler(kasaba) {
  var a = emirKucult(kasaba || "").trim();
  if (!a) return null;                 // kasaba bilinmiyor → kısıtlama yok
  var liste = [];
  for (var i = 0; i < emirEnvanter.length; i++) {
    if (emirKucult(emirEnvanter[i].kasaba || "") === a) {
      if (emirEnvanter[i].karakter) liste.push(emirEnvanter[i].karakter);
    }
  }
  return liste;
}

function emirListeYaz(dlId, adlar) {
  var dl = document.getElementById(dlId);
  if (!dl) return;
  // ⚠️ Liste BOŞ ya da null ise TÜM hesaplar gösterilir — kullanıcıyı
  //    kilitlemeyiz (veri eksikse eski davranışa düşülür).
  var l = (adlar && adlar.length) ? adlar.slice()
        : emirEnvanter.map(function (k) { return k.karakter; }).filter(Boolean);
  l.sort(function (a, b) { return a.localeCompare(b, "tr"); });
  dl.innerHTML = l.map(function (a) {
    return "<option value=" + String.fromCharCode(34) + emirKacis(a) +
           String.fromCharCode(34) + "></option>";
  }).join("");
}

// Satıcının kasabasındaki hesapları alıcı listesine yazar.
function emirAliciListesiTazele() {
  var k = emirKarakterBul(emirDeger("sat-hesap"));
  var kasaba = k ? (k.kasaba || "") : "";
  emirListeYaz("emir-hesap-kasaba", emirKasabadakiler(kasaba));
  var ipucu = document.getElementById("sat-alici-ipucu");
  if (ipucu) {
    ipucu.textContent = kasaba
      ? ("🏙️ Yalnızca " + kasaba + " kasabasındaki hesaplar listeleniyor "
         + "(pazar kasaba bazlıdır).")
      : "";
  }
}

function emirKarakterBul(ad) {
  var anahtar = emirKucult(ad).trim();
  for (var i = 0; i < emirEnvanter.length; i++) {
    if (emirKucult(emirEnvanter[i].karakter) === anahtar) return emirEnvanter[i];
  }
  return null;
}

function emirSecenek(deger, aciklama) {
  var t = String.fromCharCode(34);
  return "<option value=" + t + emirKacis(deger) + t + ">" + emirKacis(aciklama) + "</option>";
}

// ---------------------------------------------------------
// SATIŞ: seçilen hesabın GERÇEK eşyaları
// ---------------------------------------------------------
function emirSatisMalDoldur() {
  var dl = document.getElementById("sat-mal-listesi");
  var bilgi = document.getElementById("sat-bilgi");
  var k = emirKarakterBul(emirDeger("sat-hesap"));
  // 🧾 [21.10.2026 — İŞ 24] kategoriler listenin BAŞINDA (hesap seçilmese de).
  var katSecenek = SAT_KATEGORILERI.map(function (x) {
    return emirSecenek(x[0], x[1]);
  }).join("");
  if (!k) {
    dl.innerHTML = katSecenek;
    bilgi.textContent = "Hesabı seçince o karakterin eşyaları burada listelenir.";
    return;
  }
  var esyalar = (k.esyalar || []).filter(function (x) {
    return x.isim && x.isim.indexOf("Akçe") === -1;
  });
  esyalar.sort(function (a, b) { return (b.adet || 0) - (a.adet || 0); });
  dl.innerHTML = katSecenek + esyalar.map(function (x) {
    return emirSecenek(x.isim, x.adet + " adet");
  }).join("");
  bilgi.textContent = k.karakter + " — " + k.kasaba + " · " + esyalar.length +
    " çeşit eşya · cebinde " + emirSayiYaz(k.akce || 0) + " akçe";
}

function emirSatisMalBilgi() {
  var k = emirKarakterBul(emirDeger("sat-hesap"));
  var mal = emirDeger("sat-mal");
  var bilgi = document.getElementById("sat-bilgi");
  // 🧾 [21.10.2026 — İŞ 24] kategori seçildiyse ne olacağını söyle.
  var kat = emirSatisKategori(mal);
  if (kat) {
    bilgi.textContent = kat[1] + ". Her eşya ayrı ilanla satılır; meslek hammaddesi, " +
      "ödenek malı, Midas sandığı ve bugünkü yemek payı satılmaz. " +
      "Sonuçta hangi eşyadan kaç satıldığı yazılır.";
    return;
  }
  if (!k || !mal) return;
  var bulunan = null;
  (k.esyalar || []).forEach(function (x) {
    if (emirKucult(x.isim) === emirKucult(mal)) bulunan = x;
  });
  var adetKutu = document.getElementById("sat-adet");
  if (bulunan) {
    bilgi.textContent = k.karakter + " elinde " + bulunan.adet + " adet " + bulunan.isim +
      " var (çanta + ev sandığı toplamı).";
    if (!adetKutu.value) adetKutu.value = bulunan.adet;
  } else {
    bilgi.textContent = "⚠️ " + k.karakter + " envanterinde bu eşya görünmüyor (dünkü rapora bakıyoruz). " +
      "Yine de gönderebilirsin; bot eldeki kadarını satar.";
  }
}

// ---------------------------------------------------------
// ALIM: pazarda GERÇEKTEN satılan ürünler
// ---------------------------------------------------------
function emirPazarOzet() {
  var harita = new Map();
  emirPazar.forEach(function (u) {
    if (!u.isim) return;
    var v = harita.get(u.isim) || { isim: u.isim, adet: 0, enUcuz: null, kasaba: "" };
    v.adet += u.adet || 0;
    if (v.enUcuz === null || (u.fiyat || 0) < v.enUcuz) {
      v.enUcuz = u.fiyat || 0;
      v.kasaba = u.kasaba || "";
    }
    harita.set(u.isim, v);
  });
  return harita;
}

// ⚡ "Hemen yap" tiki (varsa ve işaretliyse).
function emirHemen(id) {
  var el = document.getElementById(id);
  return !!(el && el.checked);
}

// 🪖 [25.09.2026] "Orduya katıl" öneri listesi — takip edilen ordular
//    (ordu.json → harita.js'in `window.orduVerisi`si). Kutuya her
//    odaklanışta tazelenir; veri yoksa liste boş kalır, elle yazılır.
//    Komutan önerisi oyun adıdır (komutan_login), yoksa unvansız ad.
function emirOrduOnerileriDoldur() {
  var dl = document.getElementById("ok-ordu-listesi");
  if (!dl) return;
  var ordu = (typeof window !== "undefined" && window.orduVerisi) || null;
  var liste = (ordu && Array.isArray(ordu.ordular)) ? ordu.ordular : [];
  var gorulen = {};
  var secenekler = [];
  function ekle(deger, etiket) {
    deger = String(deger || "").trim();
    if (!deger || gorulen[deger.toLowerCase()]) return;
    gorulen[deger.toLowerCase()] = 1;
    secenekler.push(emirSecenek(deger, etiket));
  }
  liste.forEach(function (o) {
    if (!o || !o.ad) return;
    ekle(o.ad, "🪖 ordu · " + (o.kasaba || "?"));
  });
  liste.forEach(function (o) {
    if (!o || !o.ad) return;
    var k = String(o.komutan_login || o.komutan || "");
    if (k.indexOf(":") >= 0) k = k.slice(k.lastIndexOf(":") + 1);
    ekle(k, "👤 komutan · " + o.ad);
  });
  dl.innerHTML = secenekler.join("");
}

// 🏙️ [11.09.2026] ALIM KASABA SÜZGECİ — kullanıcı: *"emir alım hangi
//    kasabadaysa o kasabanın pazar listesini seçtirsin."* Alacak hesabın
//    kasabası (envanter.json) biliniyorsa yalnızca o kasabanın pazar
//    ürünleri listelenir; bilinmiyorsa ESKİ davranış (hepsi).
function emirAlimKasabasi() {
  var k = emirKarakterBul(emirDeger("al-hesap"));
  return k ? (k.kasaba || "") : "";
}

function emirPazarOzetKasaba(kasaba) {
  var a = emirKucult(kasaba || "").trim();
  if (!a) return emirPazarOzet();
  var harita = new Map();
  emirPazar.forEach(function (u) {
    if (!u.isim || emirKucult(u.kasaba || "") !== a) return;
    var v = harita.get(u.isim) || { isim: u.isim, adet: 0, enUcuz: null, kasaba: "" };
    v.adet += u.adet || 0;
    if (v.enUcuz === null || (u.fiyat || 0) < v.enUcuz) {
      v.enUcuz = u.fiyat || 0;
      v.kasaba = u.kasaba || "";
    }
    harita.set(u.isim, v);
  });
  // ⚠️ O kasabanın pazarı raporda hiç yoksa (ajan uğramamış) kullanıcıyı
  //    kilitleme: tüm liste gösterilir.
  return harita.size ? harita : emirPazarOzet();
}

function emirPazarListesiDoldur() {
  var dl = document.getElementById("al-mal-listesi");
  if (!dl) return;
  var kasaba = emirAlimKasabasi();
  var ipucu = document.getElementById("al-kasaba-ipucu");
  if (ipucu) {
    ipucu.textContent = kasaba
      ? ("🏙️ Yalnızca " + kasaba + " pazarındaki ürünler listeleniyor (pazar kasaba bazlıdır).")
      : "";
  }
  var liste = Array.from(emirPazarOzetKasaba(kasaba).values());
  liste.sort(function (a, b) { return a.isim.localeCompare(b.isim, "tr"); });
  dl.innerHTML = liste.map(function (x) {
    return emirSecenek(x.isim, x.adet + " adet · en ucuz " + emirSayiYaz(x.enUcuz) + " akçe (" + x.kasaba + ")");
  }).join("");
}

function emirAlimBilgi() {
  var bilgi = document.getElementById("al-bilgi");
  var mal = emirDeger("al-mal");
  if (!mal) {
    bilgi.textContent = "Pazarda bugün ne varsa listede o çıkar.";
    return null;
  }
  var kayit = emirPazarOzet().get(mal) || null;
  if (!kayit) {
    bilgi.textContent = "⚠️ Bu ürün bugünkü pazar raporunda yok. Yine de emir bırakabilirsin; çıkarsa alır.";
    return null;
  }
  bilgi.textContent = "Pazarda " + kayit.adet + " adet var · en ucuz " +
    emirSayiYaz(kayit.enUcuz) + " akçe (" + kayit.kasaba + ").";
  return kayit;
}

function emirAzamiOner() {
  var kayit = emirPazarOzet().get(emirDeger("al-mal"));
  var adet = emirSayi("al-adet");
  if (!kayit || !adet) return;
  // %10 pay bırakıyoruz: fiyat biraz oynarsa alım tamamen durmasın.
  var oneri = Math.ceil(adet * kayit.enUcuz * 1.1);
  document.getElementById("al-azami").value = oneri;
  document.getElementById("al-bilgi").textContent =
    adet + " adet × " + emirSayiYaz(kayit.enUcuz) + " akçe ≈ " +
    emirSayiYaz(adet * kayit.enUcuz) + " akçe. %10 pay ile azami " + oneri + " akçe yazıldı.";
  emirGuncelle();
}

/* 💡 [19.10.2026 — FABLE_GOREV_2026-10-15 İŞ 7a] Birim tavan = azami ÷ adet
   (pazar_emirleri.birim_tavan ile AYNI hesap). */
var AL_AZAMI_IPUCU = "";
function emirAzamiIpucu() {
  var el = document.getElementById("al-azami-ipucu");
  if (!el) return;
  if (!AL_AZAMI_IPUCU) AL_AZAMI_IPUCU = el.innerHTML;
  var adet = emirSayi("al-adet");
  var azami = emirSayi("al-azami");
  if (!adet || !azami) { el.innerHTML = AL_AZAMI_IPUCU; return; }
  el.textContent = "💡 Toplam " + emirSayiYaz(azami) + " akçe ÷ " + Math.round(adet) +
    " adet → tanesi en fazla " + emirSayiYaz(Math.round(azami / adet * 100) / 100) +
    " akçe. (Tanesinin fiyatını yazdıysan toplamı " + emirSayiYaz(Math.round(adet * azami * 100) / 100) +
    " olmalıydı.)";
}

// ---------------------------------------------------------
// ÖDENEK: sancak deposundaki eşyalar, çok satırlı
// ---------------------------------------------------------
function emirSancakDoldur() {
  var sec = document.getElementById("od-sancak");
  if (!sec) return;
  sec.innerHTML = emirSancaklar.map(function (s, i) {
    return emirSecenek(String(i), s.sancak + " (" + s.kasaba + ")");
  }).join("");
}

// 👑 [26.09.2026] ÖDENEĞİ VEREN NAZIR — açılır liste "Renegrade (Glasgow sancağı)".
// Kullanıcı: *"ayarlarda atıyorum 3 tane ticaret nazırı var nicki seçtir açılır
// pencere ile ve yanında hangi sancaktaysa onu yazdır parantez içinde ...
// ya da şehri yazdır, seçecek adam unutabilir hangi sancaktaydı."*
// Kaynak: gelisim.json görevleri ("👑 Ticaret Nazırı" — ayarlar + site emirleri)
// + sancak.json (nazırın taradığı sancak). Sancağı bilinmiyorsa bulunduğu şehir.
// ⚠️ Birden çok nazır varsa seçim ZORUNLU (yoksa ilk giren nazır verirdi).
function emirSancakKisaAd(ad) {
  return String(ad || "")
    .replace(/^(County|Duchy|Earldom|Kingdom|Barony|Lordship|Principality|Viscounty|March|Margraviate) of /i, "")
    .trim();
}

function emirNazirListesi(gelisim, sancaklar) {
  var liste = [];
  var gorulen = {};
  function sancakNo(ad) {
    var a = emirKucult(ad);
    for (var i = 0; i < (sancaklar || []).length; i++) {
      if (emirKucult(sancaklar[i].nazir || "") === a) return i;
    }
    return -1;
  }
  function ekle(ad, sehir) {
    var a = emirKucult(ad).trim();
    if (!a || gorulen[a]) return;
    gorulen[a] = true;
    var no = sancakNo(ad);
    var yer = no >= 0
      ? emirSancakKisaAd(sancaklar[no].sancak) + " sancağı"
      : (sehir || "");
    liste.push({ ad: ad, yer: yer, sancakNo: no });
  }
  (gelisim || []).forEach(function (k) {
    var nazir = (k.gorevler || []).some(function (g) {
      return emirKucult(g).indexOf("ticaret naz") >= 0;
    });
    if (nazir) ekle(k.karakter, k.kasaba);
  });
  // Rol verisi eksikse bile sancağı TARAMIŞ nazır listede olsun.
  (sancaklar || []).forEach(function (s) { if (s.nazir) ekle(s.nazir, s.kasaba); });
  liste.sort(function (a, b) { return a.ad.localeCompare(b.ad, "tr"); });
  return liste;
}

function emirNazirlariDoldur() {
  emirNazirlar = emirNazirListesi(emirGelisim, emirSancaklar);
  var sec = document.getElementById("od-veren");
  if (!sec) return;
  var ops = [];
  if (!emirNazirlar.length) {
    ops.push(emirSecenek("", "— nazır bilgisi yok (oyuna ilk giren nazır verir) —"));
  } else if (emirNazirlar.length > 1) {
    ops.push(emirSecenek("", "— nazır seç (" + emirNazirlar.length + " nazır var) —"));
  }
  emirNazirlar.forEach(function (n) {
    ops.push(emirSecenek(n.ad, n.ad + (n.yer ? " (" + n.yer + ")" : "")));
  });
  sec.innerHTML = ops.join("");
}

// Nazır seçilince sancağı biliniyorsa "Hangi sancaktan?" da ona geçer
// (eşya listesi o nazırın deposundan gelsin).
function emirNazirSancaginaGec() {
  var ad = emirKucult(emirDeger("od-veren"));
  var n = emirNazirlar.filter(function (x) { return emirKucult(x.ad) === ad; })[0];
  var sec = document.getElementById("od-sancak");
  if (!n || n.sancakNo < 0 || !sec || sec.value === String(n.sancakNo)) return false;
  sec.value = String(n.sancakNo);
  return true;
}

function emirSancakEsyalari() {
  var sec = document.getElementById("od-sancak");
  var i = parseInt((sec && sec.value) || "0", 10);
  var s = emirSancaklar[i];
  if (!s) return [];
  return (s.esyalar || []).filter(function (x) {
    return x.isim && x.isim.indexOf("Akçe") === -1;
  });
}

function emirOdenekSecenekleri() {
  return emirSancakEsyalari().map(function (x) {
    return emirSecenek(x.isim, x.adet + " adet");
  }).join("");
}

function emirOdenekSatirEkle() {
  var kap = document.getElementById("od-mallar");
  if (!kap) return;
  var no = kap.children.length + 1;
  var dlId = "od-mal-listesi-" + no + "-" + Date.now();
  var t = String.fromCharCode(34);
  var kutu = document.createElement("div");
  kutu.className = "emir-satir od-mal-satir";
  kutu.innerHTML =
    "<label>Verilecek mal" +
    "<input list=" + t + dlId + t + " class=" + t + "od-mal" + t + " placeholder=" + t + "örn. Çubuk Kil" + t + " autocomplete=" + t + "off" + t + ">" +
    "<datalist id=" + t + dlId + t + ">" + emirOdenekSecenekleri() + "</datalist></label>" +
    "<label>Birim fiyat (akçe)<input type=" + t + "number" + t + " class=" + t + "od-fiyat" + t + " min=" + t + "0" + t + " step=" + t + "0.01" + t + " placeholder=" + t + "örn. 4" + t + "></label>" +
    "<label>Adet<input type=" + t + "number" + t + " class=" + t + "od-adet" + t + " min=" + t + "1" + t + " step=" + t + "1" + t + " placeholder=" + t + "örn. 100" + t + "></label>" +
    "<button type=" + t + "button" + t + " class=" + t + "emir-mini-btn od-sil" + t + ">✕</button>";
  kap.appendChild(kutu);
  kutu.querySelector(".od-sil").addEventListener("click", function () {
    if (kap.children.length > 1) { kutu.remove(); emirGuncelle(); }
  });
  kutu.querySelectorAll("input").forEach(function (el) {
    el.addEventListener("input", emirGuncelle);
  });
}

function emirOdenekListeleriTazele() {
  var secenekler = emirOdenekSecenekleri();
  document.querySelectorAll("#od-mallar datalist").forEach(function (dl) {
    dl.innerHTML = secenekler;
  });
}

function emirOdenekSatirlari() {
  var cikti = [];
  document.querySelectorAll("#od-mallar .od-mal-satir").forEach(function (satir) {
    var mal = satir.querySelector(".od-mal").value.trim();
    var fiyat = parseFloat((satir.querySelector(".od-fiyat").value || "").split(",").join("."));
    var adet = parseInt(satir.querySelector(".od-adet").value || "0", 10);
    if (mal && !isNaN(fiyat) && fiyat > 0 && adet > 0) {
      cikti.push({ mal: mal, fiyat: fiyat, adet: adet });
    }
  });
  return cikti;
}

// ---------------------------------------------------------
// MESAJI KUR + DOĞRULA
// ---------------------------------------------------------
function emirMesajiKur() {
  if (emirTur === "sat") {
    var hesap = emirDeger("sat-hesap");
    var mal = emirDeger("sat-mal");
    var adet = emirSayi("sat-adet");
    var mod = emirDeger("sat-fiyat-mod");
    var alici = emirDeger("sat-alici");
    // 🏛️ Eyalet adına satış: mal sancak deposundan çıkar, para hazineye.
    var eyaletKutu = document.getElementById("sat-eyalet");
    var eyalet = !!(eyaletKutu && eyaletKutu.checked);
    // 🔢 [21.10.2026 — İŞ 25] "Tümü" = çanta + evdeki hepsi (bot: "adet: tümü").
    var tumu = emirHemen("sat-tumu");
    var eksik = [];
    if (!hesap) eksik.push("satacak hesap");
    if (!mal) eksik.push("malzeme");
    if (!adet && !tumu) eksik.push("adet (ya da 🔢 Tümü)");
    // ⚠️ Eyalet satışı sancak deposundan yapılır: kategori / "tümü" orada YOK
    //    (bot da reddeder — pazar_emirleri.emri_coz).
    if (eyalet && (tumu || emirSatisKategori(mal)))
      return { hata: "🏛️ Eyalet adına satışta 🔢 Tümü / 🧾 kategori yok — eşya adı ve adet yaz." };
    var fiyatMetni = mod;
    if (mod === "sayi") {
      var f = emirSayi("sat-fiyat-sayi");
      if (!f) eksik.push("fiyat (akçe)");
      // ⚠️ Oyun eyalet pazarında 999,95 üstünü KABUL ETMİYOR.
      if (f && eyalet && f > EYALET_AZAMI_FIYAT) f = EYALET_AZAMI_FIYAT;
      fiyatMetni = emirSayiYaz(f);
    } else if (eyalet) {
      // ⚠️ Sancak envanterinde pazarın fiyat listesi GÖRÜNMÜYOR; bot
      //    "en düşük/en yüksek"i hesaplayamaz, uydurmak yerine engelliyoruz.
      eksik.push("fiyat (eyalette 'en düşük/en yüksek' yok, elle gir)");
    }
    if (eksik.length) return { hata: "Eksik: " + eksik.join(", ") };
    var satirlar = [
      "satacak: " + hesap,
      "malzeme: " + mal,
      "adet: " + (tumu ? "tümü" : Math.round(adet)),
      "fiyat: " + fiyatMetni
    ];
    if (eyalet) satirlar.push("eyalet: evet");
    if (alici) satirlar.push("alacak: " + alici);
    if (emirHemen("sat-hemen")) satirlar.push("hemen: evet");
    return { metin: satirlar.join(EMIR_NL) };
  }

  if (emirTur === "al") {
    var ahesap = emirDeger("al-hesap");
    var amal = emirDeger("al-mal");
    var aadet = emirSayi("al-adet");
    var azami = emirSayi("al-azami");
    var aeksik = [];
    if (!ahesap) aeksik.push("alacak hesap");
    if (!amal) aeksik.push("malzeme");
    if (!aadet) aeksik.push("adet");
    if (!azami) aeksik.push("azami akçe");
    if (aeksik.length) return { hata: "Eksik: " + aeksik.join(", ") };
    var asatirlar = [
      "alacak: " + ahesap,
      "malzeme: " + amal,
      "adet: " + Math.round(aadet),
      "azami: " + emirSayiYaz(azami)
    ];
    if (emirHemen("al-hemen")) asatirlar.push("hemen: evet");
    return { metin: asatirlar.join(EMIR_NL) };
  }

  // ---------------- 📣 FORUM / ⚓ YANAŞMA (11.09.2026) ----------------
  // Şablonlar bot tarafında pazar_emirleri.forum_emri_coz /
  // yanasma_emri_coz ile BİREBİR aynı olmalı — birini değiştirirsen
  // diğerini de değiştir. ⚠️ Forumda `hemen:` satırı `mesaj:`ten ÖNCE.
  if (emirTur === "forum") {
    var fHesap = emirDeger("fr-hesap");
    var fKonu = emirDeger("fr-konu");
    var fMesaj = emirDeger("fr-mesaj");
    var fEksik = [];
    if (!fHesap) fEksik.push("yazacak karakter");
    if (!fKonu) fEksik.push("forum konusu adresi");
    else if (fKonu.indexOf("forum.renaissancekingdoms.com") < 0 ||
             fKonu.indexOf("viewtopic.php") < 0)
      fEksik.push("adres oyunun forumu olmalı (viewtopic.php)");
    if (!fMesaj) fEksik.push("cevap metni");
    if (fEksik.length) return { hata: "Eksik: " + fEksik.join(", ") };
    var fsatir = ["FORUM", "hesap: " + fHesap, "konu: " + fKonu];
    if (emirHemen("fr-hemen")) fsatir.push("hemen: evet");
    fsatir.push("mesaj: " + fMesaj);
    return { metin: fsatir.join(EMIR_NL) };
  }

  // ---------------- 👑 DİVAN LİSTESİ ONAY (24.09.2026) ----------------
  // ⚠️ Şablon `divan_onay.emri_coz` ile BİREBİR aynı olmalı (başlık +
  //    her hesap ayrı "hesap:" satırı). `hemen` bot tarafında VARSAYILAN HAYIR.
  if (emirTur === "divan") {
    var dvHam = emirDeger("dv-hesaplar");
    var dvAdlar = [];
    String(dvHam || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && dvAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) dvAdlar.push(x);
    });
    if (!dvAdlar.length) return { hata: "Eksik: onaylayacak en az bir hesap" };
    var dvSatir = ["DİVAN ONAY"];
    dvAdlar.forEach(function (x) { dvSatir.push("hesap: " + x); });
    if (emirHemen("dv-hemen")) dvSatir.push("hemen: evet");
    return { metin: dvSatir.join(EMIR_NL) };
  }

  // ---------------- 👪 AİLE KABUL (05.10.2026) ----------------
  // ⚠️ Şablon `aile_modul.emri_coz` ile BİREBİR aynı olmalı: başlık +
  //    "hesap:" (aile reisi) + "kabul:" (virgüllü adlar) + isteğe bağlı "hemen: evet".
  if (emirTur === "aile") {
    var akReis = emirDeger("ak-hesap");
    var akAdlar = [];
    String(emirDeger("ak-adlar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && x.toLowerCase() !== String(akReis || "").toLowerCase() &&
          akAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) akAdlar.push(x);
    });
    var akEksik = [];
    if (!akReis) akEksik.push("aile reisi hesap");
    if (!akAdlar.length) akEksik.push("kabul edilecek en az bir kişi");
    if (akEksik.length) return { hata: "Eksik: " + akEksik.join(", ") };
    var akSatir = ["AİLE KABUL", "hesap: " + akReis, "kabul: " + akAdlar.join(", ")];
    if (emirHemen("ak-hemen")) akSatir.push("hemen: evet");
    return { metin: akSatir.join(EMIR_NL) };
  }

  // ---------------- 👪 AİLEYE BAŞVUR (19.10.2026 — İŞ 22) ----------------
  // ⚠️ Şablon `aile_modul.basvur_emri_coz` ile BİREBİR aynı olmalı: başlık +
  //    her hesap ayrı "hesap:" + "aile:" (TAM ad, ZORUNLU) + "akçe:" (tam sayı,
  //    0 = kutu boş) + isteğe bağlı "hemen: evet".
  if (emirTur === "ailebasvur") {
    var abAdlar = [];
    String(emirDeger("ab-hesaplar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && abAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) abAdlar.push(x);
    });
    if (!abAdlar.length) return { hata: "Eksik: başvuracak en az bir hesap" };
    var abAile = String(emirDeger("ab-aile") || "").replace(/\s+/g, " ").trim();
    if (!abAile) return { hata: "Eksik: aile adı (oyundaki TAM adı)" };
    // ⚠️ [19.10.2026 inceleme] Akçe botla AYNI kuralla okunur (`aile_modul.akce_coz0`):
    //    nokta BİNLİK ayracıdır ("1.000" → 1000). Eskiden Number("1.000") = 1 → sessizce
    //    "akçe: 1" üretiliyordu. Ondalık ("4,5" / "4.5") → hata.
    var abAkceHam = String(emirDeger("ab-akce") || "").replace(/akçe|akce/gi, "").replace(/\s+/g, "");
    var abAkce = abAkceHam === "" ? 0
      : (/^\d{1,3}(\.\d{3})+$/.test(abAkceHam) ? Number(abAkceHam.split(".").join(""))
         : (/^\d+$/.test(abAkceHam) ? Number(abAkceHam) : NaN));
    if (!(abAkce >= 0) || Math.floor(abAkce) !== abAkce) return { hata: "Akçe tam sayı olmalı (0 = kutu boş)" };
    var abSatir = ["AİLEYE BAŞVUR"];
    abAdlar.forEach(function (x) { abSatir.push("hesap: " + x); });
    abSatir.push("aile: " + abAile);
    abSatir.push("akçe: " + abAkce);
    if (emirHemen("ab-hemen")) abSatir.push("hemen: evet");
    return { metin: abSatir.join(EMIR_NL) };
  }

  // ---------------- 🌾🔁 TARLA ÇEVİR (21.10.2026 — İŞ 28) ----------------
  // ⚠️ Şablon `tarla_cevir.emri_coz` ile BİREBİR: başlık + her hesap ayrı "hesap:" +
  //    "tarla:" (1 / 2 / 1, 2 / hepsi) + "yeni tür:" (TARLA_TIPLERI adı) + "hasat:"
  //    (bitince / hemen) + isteğe bağlı "hemen: evet" (⚡ — "hasat: hemen" İLE KARIŞMAZ).
  if (emirTur === "tarlacevir") {
    var tcAdlar = [];
    String(emirDeger("tc-hesaplar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && tcAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) tcAdlar.push(x);
    });
    if (!tcAdlar.length) return { hata: "Eksik: en az bir hesap" };
    var tcTarla = emirDeger("tc-tarla");
    if (!tcTarla) return { hata: "Eksik: hangi tarla (1 / 2 / hepsi)" };
    var tcTur = emirDeger("tc-tur");
    if (!tcTur) return { hata: "Eksik: yeni tür" };
    var tcSatir = ["TARLA ÇEVİR"];
    tcAdlar.forEach(function (x) { tcSatir.push("hesap: " + x); });
    tcSatir.push("tarla: " + tcTarla);
    tcSatir.push("yeni tür: " + tcTur);
    tcSatir.push("hasat: " + (emirDeger("tc-hasat") === "hemen" ? "hemen" : "bitince"));
    if (emirHemen("tc-hemen")) tcSatir.push("hemen: evet");
    return { metin: tcSatir.join(EMIR_NL) };
  }

  // ---------------- 🩺 MUAYENEHANE / ECZANE (19.10.2026 — İŞ 18) ----------------
  // ⚠️ Şablon `muayene_modul.emri_coz` ile BİREBİR: başlık (MUAYENEHANE AL · İKSİR YAP ·
  //    MUAYENE GÜNÜ) + her hesap ayrı "hesap:" + türe göre "ot:/adet:/ad:" ya da
  //    "basit:/kapsamlı:/azami:" + isteğe bağlı "hemen: evet". Fiyat kuralı botla AYNI
  //    (kuruş virgülle, 10'un katı; basit 0-10 · kapsamlı 5-25 · azami 0-12).
  if (emirTur === "muayene") {
    var muFiyat = function (deger, enAz, enCok) {
      var m = /^(\d{1,2})(?:,(\d{1,2}))?$/.exec(
        String(deger == null ? "" : deger).replace(/akçe|akce/gi, "").replace(/\s+/g, ""));
      if (!m) return null;
      var a = Number(m[1]), kes = m[2] || "0";
      var k = kes.length === 1 ? Number(kes) * 10 : Number(kes);
      if (a < enAz || a > enCok || k % 10 || k > 90) return null;
      return k ? a + "," + k : String(a);
    };
    var muAdlar = [];
    String(emirDeger("mu-hesaplar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && muAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) muAdlar.push(x);
    });
    if (!muAdlar.length) return { hata: "Eksik: en az bir hesap" };
    // ⚠️ [19.10.2026 inceleme] Tür VARSAYILANSIZ: eskiden boşsa "al" sayılıyordu → asistan
    //    "iksir yapsın" cümlesinde formu açınca geri alınamaz MUAYENEHANE AL hazır çıkıyordu.
    var muTur = emirDeger("mu-tur");
    if (["al", "iksir", "muayene"].indexOf(muTur) < 0) {
      return { hata: "Eksik: ne yapılsın? (muayenehane al / iksir yap / muayene günü)" };
    }
    var muSatir = [muTur === "iksir" ? "İKSİR YAP" : (muTur === "muayene" ? "MUAYENE GÜNÜ" : "MUAYENEHANE AL")];
    muAdlar.forEach(function (x) { muSatir.push("hesap: " + x); });
    if (muTur === "iksir") {
      var muOt = String(emirDeger("mu-ot") || "").replace(/\s+/g, " ").trim();
      if (!muOt) return { hata: "Eksik: ot adı (oyundaki TAM adı, örn. Lavanta filizi)" };
      var muAdetHam = String(emirDeger("mu-adet") || "").trim();
      var muAdet = muAdetHam === "" ? 1 : Number(muAdetHam);
      if (!(muAdet >= 1 && muAdet <= 999) || Math.floor(muAdet) !== muAdet) return { hata: "Adet 1-999 arası tam sayı olmalı" };
      muSatir.push("ot: " + muOt);
      muSatir.push("adet: " + muAdet);
      var muAd = String(emirDeger("mu-ad") || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (muAd) muSatir.push("ad: " + muAd);
    } else if (muTur === "muayene") {
      var muB = muFiyat(emirDeger("mu-basit"), 0, 10);
      var muK = muFiyat(emirDeger("mu-kapsamli"), 5, 25);
      var muAzHam = String(emirDeger("mu-azami") || "").trim();
      var muAz = muAzHam === "" ? NaN : Number(muAzHam);
      if (muB === null) return { hata: "Basit muayene fiyatı 0-10 akçe olmalı (kuruş virgülle, 10'un katı: 2,50)" };
      if (muK === null) return { hata: "Kapsamlı muayene fiyatı 5-25 akçe olmalı (kuruş virgülle: 10,50)" };
      if (!(muAz >= 0 && muAz <= 12) || Math.floor(muAz) !== muAz) return { hata: "Azami kapsamlı muayene 0-12 arası olmalı" };
      muSatir.push("basit: " + muB);
      muSatir.push("kapsamlı: " + muK);
      muSatir.push("azami: " + muAz);
    }
    if (emirHemen("mu-hemen")) muSatir.push("hemen: evet");
    return { metin: muSatir.join(EMIR_NL) };
  }

  // ---------------- 🗳️ OY VER (26.09.2026) ----------------
  // ⚠️ Şablon `oy_modul.emri_coz` ile BİREBİR aynı olmalı: başlık +
  //    "seçim:" + (belediye → "kasaba:" · divan → "sancak:") + "aday:"/"liste:"
  //    + "gün:" + isteğe bağlı her hesap ayrı "hesap:" satırı.
  //    🏰 [01.10.2026] "Sancak Beyi'ni tanı": "seçim: sancak beyi" +
  //    İSTEĞE BAĞLI "sancak:" + "aday:" (tanınacak kişi). Hesap kutusu
  //    boşsa toplu (sancaktaki tüm hesaplarımız), doluysa yalnızca onlar.
  if (emirTur === "oy") {
    var oySecimHam = emirDeger("oy-secim");
    var oySecim = oySecimHam === "divan" ? "divan"
                : (oySecimHam === "sancakbeyi" ? "sancakbeyi" : "belediye");
    var oyBey = oySecim === "sancakbeyi";
    var oyYer = emirDeger("oy-yer");
    var oyAday = emirDeger("oy-aday");
    var oyEksik = [];
    if (!oyYer && !oyBey) oyEksik.push(oySecim === "divan" ? "sancak" : "kasaba");
    if (!oyAday) oyEksik.push(oySecim === "divan" ? "liste adı"
                              : (oyBey ? "tanınacak kişi" : "aday"));
    if (oyEksik.length) return { hata: "Eksik: " + oyEksik.join(", ") };
    var oyGun = parseInt(emirDeger("oy-gun"), 10);
    if (!(oyGun >= 1 && oyGun <= 3)) oyGun = 3;
    var oySatir = ["OY VER", "seçim: " + (oyBey ? "sancak beyi" : oySecim)];
    if (oyYer) oySatir.push((oySecim === "belediye" ? "kasaba: " : "sancak: ") + oyYer);
    oySatir.push((oySecim === "divan" ? "liste: " : "aday: ") + oyAday);
    oySatir.push("gün: " + oyGun);
    var oyAdlar = [];
    String(emirDeger("oy-hesaplar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && oyAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) oyAdlar.push(x);
    });
    oyAdlar.forEach(function (x) { oySatir.push("hesap: " + x); });
    return { metin: oySatir.join(EMIR_NL) };
  }

  // ---------------- 🪖 ORDUYA KATIL (25.09.2026) ----------------
  // ⚠️ Şablon `ordu_uyesi.emri_coz` ile BİREBİR aynı olmalı: başlık + her
  //    hesap ayrı "hesap:" satırı + ZORUNLU "ordu:" (ordu adı ya da komutan).
  //    "enerji:" yalnızca seçildiyse; "hemen: evet" yalnızca tikliyse (bot
  //    tarafında `hemen` VARSAYILAN HAYIR).
  // ⚠️ `ordu` boşsa mesaj ÜRETİLMEZ: aynı kasabada düşman ordu da asker
  //    alabiliyor; adsız emir yanlış orduya sokabilir ve bu geri alınamaz.
  if (emirTur === "ordukatil") {
    var okAdlar = [];
    String(emirDeger("ok-hesaplar") || "").split(/[\r\n,;]+/).forEach(function (x) {
      x = x.trim();
      if (x && okAdlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) okAdlar.push(x);
    });
    if (!okAdlar.length) return { hata: "Eksik: orduya girecek en az bir hesap" };
    var okOrdu = emirDeger("ok-ordu");
    if (!okOrdu) return { hata: "Eksik: ordu adı ya da komutanı (ZORUNLU — yanlış orduya girmek geri alınamaz)" };
    var okSatir = ["ORDUYA KATIL"];
    okAdlar.forEach(function (x) { okSatir.push("hesap: " + x); });
    okSatir.push("ordu: " + okOrdu);
    var okEnerji = emirDeger("ok-enerji");
    if (okEnerji) okSatir.push("enerji: " + okEnerji);
    if (emirHemen("ok-hemen")) okSatir.push("hemen: evet");
    return { metin: okSatir.join(EMIR_NL) };
  }

  // ---------------- 📬 POSTA KONTROL (18.09.2026) ----------------
  // Kullanicinin ortagi: *"Hesap sadece girip gelen giden mesaj var mi
  //   baksin telegrama atsin ... hizli yanit gelecegini bildigimiz bir
  //   hesaba gun icinde bir daha baktirabilelim."*
  // ⚠️ Sablon `pazar_emirleri.posta_emri_coz` ile BIREBIR ayni olmali —
  //    birini degistirirsen digerini de degistir.
  // ⚠️ `hemen` bot tarafinda VARSAYILAN EVET; tik kaldirilirsa "hayir"
  //    ACIKCA yazilir, yoksa bot yine hemen bakar.
  if (emirTur === "posta") {
    var pHesap = emirDeger("po-hesap");
    if (!pHesap) return { hata: "Eksik: postasına bakılacak hesap" };
    var psatir = ["POSTA", "hesap: " + pHesap];
    if (!emirHemen("po-hemen")) psatir.push("hemen: hayır");
    return { metin: psatir.join(EMIR_NL) };
  }

  // ---------------- 🎭 PROFİL YAZ (21.09.2026) ----------------
  // Kullanıcının notu: *"peki bugün ruh halin nasıl kısmına bişeler
  //   yazabiliriz, bu profil durumu, burası 1. doldurulacak yer"* +
  //   *"buradan doğum tarihi dd(gün) mm(ay), yaşta normal istediğimiz yaşı
  //   yazıyoruz"* + *"burası da OOC bölümü ... 2 yer sor"*.
  // ⚠️⚠️ İKİ UZUN METİN VAR (RP ve OOC) → etiketli satır YETMEZ, bloklar
  //    `--- RP ---` / `--- OOC ---` ayraçlarıyla ayrılır. Şablon
  //    `profil_modul.emri_coz` ile BİREBİR aynı olmalı — birini
  //    değiştirirsen diğerini de değiştir.
  // ⚠️ Boş bırakılan kutu satır olarak YAZILMAZ; bot o alana dokunmaz.
  if (emirTur === "profil") {
    var prHesap = emirDeger("pr-hesap");
    var prDurum = emirDeger("pr-durum");
    var prRp = emirDeger("pr-rp");
    var prOoc = emirDeger("pr-ooc");
    var prDogum = emirDeger("pr-dogum");
    var prYas = emirDeger("pr-yas");
    var prCins = emirDeger("pr-cinsiyet");
    var prEksik = [];
    if (!prHesap) prEksik.push("profili yazılacak hesap");
    if (!prDurum && !prRp && !prOoc && !prDogum && !prYas && !prCins)
      prEksik.push("en az bir alan (durum / RP / OOC / doğum / yaş / cinsiyet)");
    // ⚠️ Doğum tarihi GÜN/AY'dır (yıl yok) — bot `tarih_coz` ile aynı
    //    sınırları uyguluyor; burada da erken uyaralım.
    if (prDogum) {
      var prP = prDogum.match(/\d{1,2}/g) || [];
      var prG = parseInt(prP[0], 10), prA = parseInt(prP[1], 10);
      if (prP.length < 2 || !(prG >= 1 && prG <= 31) || !(prA >= 1 && prA <= 12))
        prEksik.push("doğum tarihi GG/AA olmalı (örn. 20/03)");
    }
    if (prEksik.length) return { hata: "Eksik: " + prEksik.join(", ") };
    var prSatir = ["PROFİL", "hesap: " + prHesap];
    if (prDurum) prSatir.push("durum: " + prDurum);
    // 🎂 [26.09.2026] Yalnızca yaş girildiyse OTOMATİK gün/ay atanır.
    //    Kullanıcı: *"siteden ay ve gün girilmezse sadece yaş girilirse
    //    otomatik bi ay gün atasın"*. Oyun yaşla birlikte doğum tarihini de
    //    ister, boşsa herkesi 01/01 yapar. 28'e kadar: her ayda geçerli.
    //    (Bot da Telegram'dan elle yazılan emirde aynısını yapar.)
    if (!prDogum && prYas) {
      var prIki = function (n) { return (n < 10 ? "0" : "") + n; };
      prDogum = prIki(1 + Math.floor(Math.random() * 28)) + "/" +
                prIki(1 + Math.floor(Math.random() * 12));
    }
    if (prDogum) prSatir.push("dogum: " + prDogum);
    if (prYas) prSatir.push("yas: " + prYas);
    if (prCins) prSatir.push("cinsiyet: " + prCins);
    if (emirHemen("pr-hemen")) prSatir.push("hemen: evet");
    // ⚠️ Bloklar EN SONA gelir: ayraçtan sonraki her satır metne aittir.
    if (prRp) prSatir.push("--- RP ---", prRp);
    if (prOoc) prSatir.push("--- OOC ---", prOoc);
    return { metin: prSatir.join(EMIR_NL) };
  }

  // ---------------- 🤝 GÜVEN PUANI & 🎨 RENK (21.09.2026) ----------------
  // ⚠️ Şablon `profil_modul.guven_emri_coz` ile BİREBİR aynı olmalı.
  //    Başlık "GÜVEN" ise güven varsayılan AÇIK, renk ancak "renk: evet"
  //    yazılırsa yapılır. Site her iki satırı da AÇIKÇA yazar, yani
  //    başlığın hangisi olduğu davranışı değiştirmez.
  if (emirTur === "guven") {
    var gvHesap = emirDeger("gv-hesap");
    var gvHedef = emirDeger("gv-hedef");
    var gvGuven = emirHemen("gv-guven");
    var gvRenk = emirHemen("gv-renk");
    var gvEksik = [];
    if (!gvHesap) gvEksik.push("işlemi yapacak hesap");
    if (!gvHedef) gvEksik.push("hedef oyuncu");
    if (!gvGuven && !gvRenk) gvEksik.push("en az biri: güven puanı ya da renk");
    if (gvEksik.length) return { hata: "Eksik: " + gvEksik.join(", ") };
    var gvSatir = ["GÜVEN", "hesap: " + gvHesap, "hedef: " + gvHedef,
                   "guven: " + (gvGuven ? "evet" : "hayır"),
                   "renk: " + (gvRenk ? "evet" : "hayır")];
    if (emirHemen("gv-hemen")) gvSatir.push("hemen: evet");
    return { metin: gvSatir.join(EMIR_NL) };
  }

  if (emirTur === "yanasma") {
    var yHesap = emirDeger("ya-hesap");
    var yArm = emirDeger("ya-armator");
    var yEksik = [];
    if (!yHesap) yEksik.push("liman şefi hesabı");
    if (!yArm) yEksik.push("armatör");
    if (yEksik.length) return { hata: "Eksik: " + yEksik.join(", ") };
    var ysatir = ["YANAŞMA", "hesap: " + yHesap, "armatör: " + yArm];
    if (emirHemen("ya-hemen")) ysatir.push("hemen: evet");
    return { metin: ysatir.join(EMIR_NL) };
  }

  // ---------------- ⛵ GEMİ AL (Deniz Pazarı) ----------------
  // Kullanıcı (11.09.2026): *"Şu kaptandan al diye emir yazacağız.
  // sitede ve hemen olacak bu tikli olmasına gerek yok."*
  // ⚠️ Şablon `pazar_emirleri.gemi_emri_coz` ile BİREBİR aynı olmalı —
  //    birini değiştirirsen diğerini de değiştir.
  // ⚠️ `azami` ZORUNLU: gemi alımı botun yaptığı en büyük ve GERİ
  //    ALINAMAZ harcamadır, tavansız emir kabul edilmiyor.
  if (emirTur === "gemi") {
    var gHesap = emirDeger("gm-hesap");
    var gKaptan = emirDeger("gm-kaptan");
    var gAzami = emirSayi("gm-azami");
    var gGemi = emirDeger("gm-gemi");
    var gEksik = [];
    if (!gHesap) gEksik.push("gemiyi alacak hesap");
    if (!gKaptan) gEksik.push("satan kaptan");
    if (!gAzami) gEksik.push("azami akçe");
    if (gEksik.length) return { hata: "Eksik: " + gEksik.join(", ") };
    var gsatir = ["GEMİ AL", "hesap: " + gHesap, "kaptan: " + gKaptan,
                  "azami: " + emirSayiYaz(gAzami)];
    if (gGemi) gsatir.push("gemi: " + gGemi);
    return { metin: gsatir.join(EMIR_NL) };
  }

  // ---------------- ✉️ MESAJ ----------------
  // Kullanıcı isteği (29.08.2026): sitedeki Filo listesinden bir geminin
  // sahibine oyun içi mesaj yollamak. Filo sekmesindeki "Mesaj at" düğmesi
  // bu formu doldurup buraya getiriyor.
  // ⚠️ Şablon `divan_modul.yeni_mesaj_coz` ile BİREBİR aynı olmalı —
  //    birini değiştirirsen diğerini de değiştir.
  // 🖥️ AYAR EMRİ — launcher'ın site karşılığı.
  if (emirTur === "ayar") return ayMesajiKur();
  if (emirTur === "sistem") return sistemMesajiKur();   /* ⚙️ 05.10.2026 */
  // ➕ HESAP EKLE (13.09.2026) — şablon site_emirleri.hesap_ekle_coz ile aynı.
  if (emirTur === "hesapekle") return hesapEkleMesajiKur();

  if (emirTur === "mesaj") {
    var mKimden = emirDeger("ms-kimden");
    var mKime = emirDeger("ms-kime");
    var mKonu = emirDeger("ms-konu");
    var mMetin = emirDeger("ms-metin");
    var mEksik = [];
    if (!mKimden) mEksik.push("gönderecek karakter");
    if (!mKime) mEksik.push("alıcı");
    if (!mMetin) mEksik.push("mesaj metni");
    if (mEksik.length) return { hata: "Eksik: " + mEksik.join(", ") };
    var msatir = ["MESAJ", "kimden: " + mKimden, "kime: " + mKime];
    // ⚠️ Konu BOŞ BIRAKILABİLİR — oyun boş konuyu kabul ediyor.
    if (mKonu) msatir.push("konu: " + mKonu);
    // ⚡ `hemen:` gövdeden ÖNCE (divan_modul.yeni_mesaj_coz her alanı bir kez okur).
    if (emirHemen("ms-hemen")) msatir.push("hemen: evet");
    msatir.push(mMetin);
    return { metin: msatir.join(EMIR_NL) };
  }

  var kisi = emirDeger("od-kisi");
  var mallar = emirOdenekSatirlari();
  if (!kisi) return { hata: "Eksik: ödenek atılacak kişi" };
  if (!mallar.length) return { hata: "Eksik: en az bir mal satırı (mal + fiyat + adet)" };
  // 👑 [26.09.2026] Birden çok Ticaret Nazırı varken veren seçilmezse ödeneği
  //    oyuna İLK giren nazır verirdi (yanlış sancağın deposundan) → zorunlu.
  var veren = emirDeger("od-veren");
  if (!veren && emirNazirlar.length > 1) {
    return { hata: "Eksik: ödeneği verecek nazırı seç (" + emirNazirlar.length + " Ticaret Nazırı var)" };
  }
  var osatirlar = ["Ödenek atılacak kişi: " + kisi];
  if (veren) osatirlar.push("Ödeneği veren: " + veren);
  var toplam = 0;
  mallar.forEach(function (m) {
    osatirlar.push("Verilecek mal: " + m.mal);
    osatirlar.push("Fiyat: " + emirSayiYaz(m.fiyat));
    osatirlar.push("Adet: " + m.adet);
    toplam += m.fiyat * m.adet;
  });
  // ⚡ [26.09.2026] divan_ticaret.odenek_emri_coz "hemen" satırını okur.
  if (emirHemen("od-hemen")) osatirlar.push("hemen: evet");
  var obilgi = document.getElementById("od-bilgi");
  if (obilgi) {
    obilgi.textContent = mallar.length + " kalem · sözleşme tutarı " +
      emirSayiYaz(toplam) + " akçe (bot geri ödemeyi 5 gün sonrasına yazar).";
  }
  return { metin: osatirlar.join(EMIR_NL) };
}

// ⚠️⚠️ GÖNDERECEK KARAKTER ADI SİTEYE YAZILMAZ. Kullanıcı kararı
//    (29.08.2026): *"tamam o zaman elle yazarız karakter adını."*
//    Daha önce yazdıkların YALNIZCA kendi tarayıcının belleğinde tutulur
//    (localStorage) — hiçbir yere gönderilmez, dosyaya yazılmaz.
var MS_BELLEK = "poseidon_mesaj_gonderenler";

function msGonderenleriHatirla(ad) {
  if (!ad) return;
  try {
    var liste = JSON.parse(localStorage.getItem(MS_BELLEK) || "[]");
    if (liste.indexOf(ad) === -1) {
      liste.push(ad);
      liste = liste.slice(-20);            // en son 20 ad yeter
      localStorage.setItem(MS_BELLEK, JSON.stringify(liste));
    }
  } catch (e) { /* özel sekmede yazma engelli olabilir — sorun değil */ }
}

function msGonderenleriDoldur() {
  var dl = document.getElementById("ms-kimden-listesi");
  if (!dl) return;
  var liste = [];
  try { liste = JSON.parse(localStorage.getItem(MS_BELLEK) || "[]"); }
  catch (e) { liste = []; }
  dl.innerHTML = liste.sort().map(function (a) {
    return "<option value=" + String.fromCharCode(34) + emirKacis(a) +
           String.fromCharCode(34) + "></option>";
  }).join("");
}

/* Filo sekmesindeki "Mesaj at" düğmesi buraya atlar. */
function emirMesajAc(alici, gemi) {
  var btn = document.querySelector(".emir-tur-btn[data-tur=" +
                                   String.fromCharCode(34) + "mesaj" +
                                   String.fromCharCode(34) + "]");
  if (btn) btn.click();
  var kime = document.getElementById("ms-kime");
  if (kime) kime.value = alici || "";
  var konu = document.getElementById("ms-konu");
  if (konu && !konu.value && gemi) konu.value = gemi;
  msGonderenleriDoldur();
  var kimden = document.getElementById("ms-kimden");
  if (kimden) kimden.focus();
  emirGuncelle();
}

// ---------------------------------------------------------
// 🏛️ EYALET SATIŞI — Sancak Envanteri sekmesinden gelir
// ---------------------------------------------------------
// `script.js`'teki satış kutusu Tamam'a basınca burayı çağırır. Emir
// METNİ tek yerde (emirMesajiKur) üretilir; burası yalnızca formu doldurur.
function eyaletSatisiAc(bilgi) {
  bilgi = bilgi || {};
  var btn = document.querySelector(".emir-tur-btn[data-tur=" +
                                   String.fromCharCode(34) + "sat" +
                                   String.fromCharCode(34) + "]");
  if (btn) btn.click();

  function yaz(id, deger) {
    var el = document.getElementById(id);
    if (el && deger !== undefined && deger !== null) el.value = deger;
  }
  yaz("sat-hesap", bilgi.nazir || "");
  yaz("sat-mal", bilgi.urun || "");
  yaz("sat-adet", bilgi.adet || 1);
  yaz("sat-fiyat-mod", "sayi");          // eyalette elle fiyat ŞART
  yaz("sat-fiyat-sayi", bilgi.fiyat || EYALET_AZAMI_FIYAT);
  yaz("sat-alici", bilgi.alici || "");

  var eyaletKutu = document.getElementById("sat-eyalet");
  if (eyaletKutu) eyaletKutu.checked = true;
  // 🔢 [21.10.2026] Eyalette "Tümü" yok — tik kalkar, adet kutusu açılır.
  var tumuKutu = document.getElementById("sat-tumu");
  if (tumuKutu && tumuKutu.checked) {
    tumuKutu.checked = false;
    tumuKutu.dispatchEvent(new Event("change"));
  }
  // Fiyat kutusu "sayi" seçilince açılır — olayı elle tetikle.
  var mod = document.getElementById("sat-fiyat-mod");
  if (mod) mod.dispatchEvent(new Event("change"));
  var ey = document.getElementById("sat-eyalet");
  if (ey) ey.dispatchEvent(new Event("change"));

  emirGuncelle();
  var kutu = document.getElementById("emir-onizleme");
  if (kutu && kutu.scrollIntoView) kutu.scrollIntoView({ block: "center" });
}
window.eyaletSatisiAc = eyaletSatisiAc;

// 📄 [21.09.2026] TELEGRAM TEK MESAJ SINIRI = 4.096 KARAKTER.
//   Kullanıcı ölçüp yazdı: *"Normal Mesajlar: Tek bir mesaj en fazla 4.096
//   karakter (boşluklar ve noktalama işaretleri dahil) olabilir."* — doğru.
//   (Dosya AÇIKLAMASI/caption ayrıca 1.024 karakterdir, o yüzden uzun metni
//    açıklamaya da yazamayız; dosyanın İÇİNE yazılır.)
// ⚠️⚠️ METNİ BÖLMEK YASAK: kullanıcı, birebir *"iki kere kopyalamayı bize
//    yaptırma şu işi, hata olur, 2. mesaj emri uygulanır 1. mesaj yerine
//    geçer, yarım yamalak hikâye çıkar."* Bu yüzden site uzun emri ASLA
//    parçalamaz — TEK .txt dosyası üretir, bot onu indirip okur.
var EMIR_TELEGRAM_SINIRI = 4096;

function emirDosyaAdi() {
  // Emir türü + hesap adı + tarih → "profil_Tar_aldarion_2026-09-21.txt"
  var kim = emirDeger("pr-hesap") || emirDeger("gv-hesap") ||
            emirDeger("sat-hesap") || emirDeger("al-hesap") || "emir";
  var g = new Date();
  var iki = function (n) { return (n < 10 ? "0" : "") + n; };
  var tarih = g.getFullYear() + "-" + iki(g.getMonth() + 1) + "-" + iki(g.getDate());
  var sade = String(kim).replace(/[^A-Za-z0-9_.-]/g, "_");
  return emirTur + "_" + sade + "_" + tarih + ".txt";
}

/* Emrin TAMAMINI tek bir .txt olarak indirir.
   ⚠️ Dosyanın içi, panoya kopyalanan metnin AYNISIDIR: başlık, hesap,
      durum, doğum günü, yaş, cinsiyet, "hemen" satırı ve `--- RP ---` /
      `--- OOC ---` blokları hepsi TEK dosyada. Bot dosyayı okurken normal
      bir mesaj gibi çözümler, yani hiçbir alan dışarıda kalmaz.
   ⚠️ UTF-8 BOM ile yazılır: Not Defteri ile açılınca Türkçe harfler
      bozulmasın (bot tarafı `utf-8-sig` ile okuyor). */
function emirDosyaIndir(metin) {
  try {
    var bom = String.fromCharCode(0xFEFF);
    var kutu = new Blob([bom + metin], { type: "text/plain;charset=utf-8" });
    var adres = URL.createObjectURL(kutu);
    var a = document.createElement("a");
    a.href = adres;
    a.download = emirDosyaAdi();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(adres); }, 1000);
    return true;
  } catch (e) {
    return false;
  }
}

function emirGuncelle() {
  var sonuc = emirMesajiKur();
  var onizleme = document.getElementById("emir-onizleme");
  var uyari = document.getElementById("emir-uyari");
  var btn = document.getElementById("emir-gonder");
  if (!onizleme || !uyari || !btn) return;
  if (sonuc.hata) {
    onizleme.textContent = "Kutuları doldur…";
    uyari.textContent = sonuc.hata;
    uyari.hidden = false;
    btn.disabled = true;
  } else {
    onizleme.textContent = sonuc.metin;
    uyari.hidden = true;
    btn.disabled = false;
  }
  emirUzunlukYaz(sonuc.hata ? "" : sonuc.metin);
}

/* Uzunluk sayacı + uzun emirde dosya düğmesini ÖNE ALMA. */
function emirUzunlukYaz(metin) {
  var bilgi = document.getElementById("emir-uzunluk");
  var dosyaBtn = document.getElementById("emir-dosya");
  var anaBtn = document.getElementById("emir-gonder");
  if (!bilgi || !dosyaBtn || !anaBtn) return;
  var n = (metin || "").length;
  if (!n) {
    bilgi.hidden = true;
    dosyaBtn.classList.remove("emir-ana-btn");
    anaBtn.textContent = "📋 Kopyala (Telegram'a yapıştır)";
    return;
  }
  bilgi.hidden = false;
  if (n > EMIR_TELEGRAM_SINIRI) {
    bilgi.innerHTML = "⚠️ <b>" + n.toLocaleString("tr-TR") + " karakter</b> — " +
      "Telegram'ın tek mesaj sınırı <b>" + EMIR_TELEGRAM_SINIRI.toLocaleString("tr-TR") +
      "</b>. Bu metin <b>tek mesaja sığmaz</b>. Metni bölme! " +
      "<b>📄 .txt indir</b> düğmesine bas, inen dosyayı Telegram grubuna " +
      "<b>dosya olarak</b> at — bot dosyanın içindeki her şeyi (doğum günü, " +
      "yaş, cinsiyet, RP ve OOC metinleri) okur.";
    bilgi.className = "emir-uyari";
    // Uzun metinde ASIL yol dosyadır: düğmeleri yer değiştirir.
    dosyaBtn.classList.add("emir-ana-btn");
    anaBtn.textContent = "📋 Kopyala (kısa emirler için)";
  } else {
    bilgi.textContent = n.toLocaleString("tr-TR") + " / " +
      EMIR_TELEGRAM_SINIRI.toLocaleString("tr-TR") + " karakter — tek mesaja sığıyor.";
    bilgi.className = "emir-kucuk";
    dosyaBtn.classList.remove("emir-ana-btn");
    anaBtn.textContent = "📋 Kopyala (Telegram'a yapıştır)";
  }
}

// ---------------------------------------------------------
// GÖNDERİM
// ---------------------------------------------------------
// 🗂️ [26.09.2026] EMİR TÜRÜ → TELEGRAM KONUSU. Kullanıcı: *"sitedeki emirler
//    kısmına yeni konuları koydun değil mi? emirleri atarken düzgün yerlere
//    atsınlar"*. Konu, botun o emrin ONAYINI/SONUCUNU yazdığı konuyla AYNI
//    (pazar_emirleri.emir_konusu · site_emirleri → ayar · divan_ticaret →
//    odenek · serbest mesaj → mesajlar) — emir ve cevabı aynı yerde kalsın.
//    ⚠️ Bot HER konuyu okur (chat.id'ye bakar); yanlış konuya yapıştırılan
//    emir de işlenir — bu yalnızca düzen içindir.
var EMIR_KONULARI = {
  sat: "🛒 Pazar", al: "🛒 Pazar",
  gemi: "⚓ Deniz", yanasma: "⚓ Deniz",
  ordukatil: "⚔️ Ordular",
  ayar: "⚙️ Ayar Emirleri", hesapekle: "⚙️ Ayar Emirleri", sistem: "⚙️ Ayar Emirleri",
  odenek: "💰 Ödenekler",
  mesaj: "✉️ Mesajlar"
  // geri kalan her şey (profil, güven, oy, forum, divan onay, aile kabul, aileye başvur,
  // muayenehane/eczane, posta) → 📜 Emirler
};

function emirKonusu(tur) {
  return EMIR_KONULARI[tur] || "📜 Emirler";
}

function emirDipnotYaz() {
  // 📌 [26.09.2026] Formun üstündeki konu rozeti + tek "Kopyala" düğmesi.
  var rozet = document.getElementById("emir-konu-rozet");
  if (rozet) {
    rozet.textContent = EMIR_NTFY_AKTIF ? "" :
      "📌 Telegram'da yapıştırılacak konu: " + emirKonusu(emirTur);
    rozet.hidden = EMIR_NTFY_AKTIF;
  }
  // Doğrudan gönderim kapalıyken ana düğme zaten "Kopyala" — ikinci
  // "📋 Kopyala" aynı işi yapıyordu (telefonda iki kopyala düğmesi).
  var ikinci = document.getElementById("emir-kopyala");
  if (ikinci) ikinci.hidden = !EMIR_NTFY_AKTIF;
  var el = document.getElementById("emir-dipnot");
  if (!el) return;
  el.textContent = EMIR_NTFY_AKTIF
    ? "Gönder'e basınca emir doğrudan bota gider; bot sıradaki turda uygular ve Telegram'a bilgi mesajı yazar."
    : "Gönder'e basınca metin PANOYA kopyalanır — Telegram'da " +
      emirKonusu(emirTur) + " konusuna yapıştırıp gönder (botun onayı da " +
      "oraya gelir). Mesajın SENİN hesabından çıkması şart: Telegram, botun " +
      "kendi yazdığı mesajı bota geri vermiyor (gruba geçmek bunu değiştirmedi).";
}

async function emirPanoyaYaz(metin) {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch (e) {
    var kutu = document.createElement("textarea");
    kutu.value = metin;
    document.body.appendChild(kutu);
    kutu.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    document.body.removeChild(kutu);
    return ok;
  }
}

function emirTelegramdaAc(metin) {
  var adres = "https://t.me/share/url?url=&text=" + encodeURIComponent(metin);
  window.open(adres, "_blank");
}

function emirOlaylariBagla() {
  document.querySelectorAll(".emir-tur-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".emir-tur-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".emir-form").forEach(function (f) { f.classList.remove("active"); });
      btn.classList.add("active");
      emirTur = btn.dataset.tur;
      var form = document.getElementById("emir-form-" + emirTur);
      if (form) form.classList.add("active");
      emirDipnotYaz();                 // 🗂️ doğru Telegram konusu görünsün
      emirGuncelle();
    });
  });

  // ✉️ Mesaj formu dinleyicileri
  ["ms-kimden", "ms-kime", "ms-konu", "ms-metin"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  var _msK = document.getElementById("ms-kimden");
  if (_msK) {
    _msK.addEventListener("change", function () {
      msGonderenleriHatirla(_msK.value.trim());
    });
  }
  msGonderenleriDoldur();

  // ⛵ Gemi alma formu dinleyicileri
  ["gm-hesap", "gm-kaptan", "gm-azami", "gm-gemi"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });

  document.getElementById("sat-hesap").addEventListener("input", function () {
    emirSatisMalDoldur();
    emirAliciListesiTazele();   // 🏙️ alıcılar satıcının kasabasıyla sınırlı
    emirGuncelle();
  });
  document.getElementById("sat-mal").addEventListener("input", function () {
    emirSatisMalBilgi();
    emirGuncelle();
  });
  document.getElementById("sat-fiyat-mod").addEventListener("change", function () {
    document.getElementById("sat-fiyat-sayi-kutu").hidden =
      document.getElementById("sat-fiyat-mod").value !== "sayi";
    emirGuncelle();
  });
  ["sat-adet", "sat-fiyat-sayi", "sat-alici"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", emirGuncelle);
  });
  // 🔢 [21.10.2026 — İŞ 25] "Tümü" tikliyken adet kutusu kapanır (bot hepsini satar).
  var satTumu = document.getElementById("sat-tumu");
  if (satTumu) {
    satTumu.addEventListener("change", function () {
      var a = document.getElementById("sat-adet");
      if (a) a.disabled = satTumu.checked;
      emirGuncelle();
    });
  }
  // 🏛️ Eyalet tiki: açıklama satırını göster/gizle + önizlemeyi tazele
  var satEyalet = document.getElementById("sat-eyalet");
  if (satEyalet) {
    satEyalet.addEventListener("change", function () {
      var bilgi = document.getElementById("sat-eyalet-bilgi");
      if (bilgi) bilgi.hidden = !satEyalet.checked;
      // Eyalette "en düşük/en yüksek" yok — tik açılınca elle fiyata geç.
      if (satEyalet.checked) {
        var m = document.getElementById("sat-fiyat-mod");
        if (m && m.value !== "sayi") {
          m.value = "sayi";
          m.dispatchEvent(new Event("change"));
        }
        var fk = document.getElementById("sat-fiyat-sayi");
        if (fk && !fk.value) fk.value = EYALET_AZAMI_FIYAT;
      }
      emirGuncelle();
    });
  }

  document.getElementById("al-mal").addEventListener("input", function () {
    emirAlimBilgi();
    emirGuncelle();
  });
  ["al-hesap", "al-adet", "al-azami"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", emirGuncelle);
  });
  // 💡 [19.10.2026 — İŞ 7a] adet + azami yazılınca "tanesi en fazla X akçe" (bot: azami ÷ adet).
  ["al-adet", "al-azami"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", emirAzamiIpucu);
  });
  // 🏙️ Alacak hesap değişince pazar listesi o kasabaya süzülür.
  document.getElementById("al-hesap").addEventListener("input", emirPazarListesiDoldur);
  // ⚡ hemen tikleri + 📣 forum + ⚓ yanaşma alanları
  ["sat-hemen", "al-hemen", "ms-hemen", "fr-hemen", "ya-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  ["fr-hesap", "fr-konu", "fr-mesaj", "ya-hesap", "ya-armator"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  // 🎭 [21.09.2026] Profil + 🤝 güven/renk formu dinleyicileri
  ["pr-hesap", "pr-durum", "pr-rp", "pr-ooc", "pr-dogum", "pr-yas",
   "gv-hesap", "gv-hedef"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["pr-cinsiyet", "pr-hemen", "gv-guven", "gv-renk", "gv-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  // 🪖 [25.09.2026] Orduya katıl formu + 👑 divan onay + 📬 posta formları.
  //    ⚠️ Divan ve posta kutularına hiç dinleyici bağlanmamıştı: forma
  //       geçince "Eksik" uyarısı çıkıyor, yazmaya başlayınca önizleme
  //       tazelenmiyor ve Kopyala düğmesi KAPALI kalıyordu.
  ["ok-hesaplar", "ok-ordu", "dv-hesaplar", "po-hesap"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["ok-enerji", "ok-hemen", "dv-hemen", "po-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  // 👪 [05.10.2026] Aile kabul formu (yazdıkça önizleme + Kopyala açılsın).
  ["ak-hesap", "ak-adlar"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["ak-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  // 👪 [19.10.2026 — İŞ 22] Aileye başvur formu.
  ["ab-hesaplar", "ab-aile", "ab-akce"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["ab-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  // 🩺 [19.10.2026 — İŞ 18] Muayenehane / eczane formu.
  ["mu-hesaplar", "mu-ot", "mu-adet", "mu-ad", "mu-basit", "mu-kapsamli", "mu-azami"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["mu-tur", "mu-hemen"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  // 🗳️ [26.09.2026] Oy ver formu
  ["oy-yer", "oy-aday", "oy-hesaplar"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", emirGuncelle);
  });
  ["oy-secim", "oy-gun"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", emirGuncelle);
  });
  var okOrduKutu = document.getElementById("ok-ordu");
  if (okOrduKutu) okOrduKutu.addEventListener("focus", emirOrduOnerileriDoldur);
  document.getElementById("al-azami-oner").addEventListener("click", emirAzamiOner);

  document.getElementById("od-kisi").addEventListener("input", emirGuncelle);
  var odHemen = document.getElementById("od-hemen");
  if (odHemen) odHemen.addEventListener("change", emirGuncelle);
  document.getElementById("od-sancak").addEventListener("change", function () {
    emirOdenekListeleriTazele();
    emirGuncelle();
  });
  var odVeren = document.getElementById("od-veren");
  if (odVeren) odVeren.addEventListener("change", function () {
    if (emirNazirSancaginaGec()) emirOdenekListeleriTazele();
    emirGuncelle();
  });
  document.getElementById("od-satir-ekle").addEventListener("click", function () {
    emirOdenekSatirEkle();
    emirGuncelle();
  });

  document.getElementById("emir-gonder").addEventListener("click", async function () {
    var durum = document.getElementById("emir-durum");
    var sonuc = emirMesajiKur();
    if (sonuc.hata) return;
    var metin = sonuc.metin;

    // Ne olursa olsun panoya da yaz: gönderim yarıda kalırsa elle yapıştırılır.
    emirPanoyaYaz(metin);

    if (EMIR_NTFY_AKTIF) {
      durum.textContent = "gönderiliyor…";
      try {
        var yanit = await fetch("https://ntfy.sh/" + EMIR_NTFY_KONU, { method: "POST", body: metin });
        if (!yanit.ok) throw new Error("durum " + yanit.status);
        durum.textContent = "✅ emir bota iletildi";
        setTimeout(function () { durum.textContent = ""; }, 5000);
        return;
      } catch (e) {
        durum.textContent = "⚠️ doğrudan gönderilemedi, Telegram açılıyor";
        emirTelegramdaAc(metin);
        setTimeout(function () { durum.textContent = ""; }, 5000);
        return;
      }
    }

    // ⚠️⚠️ 29.08.2026 — ÖLÇÜLDÜ: `t.me/share/url` bağlantısı çoğu
    //    tarayıcıda düzgün açılmıyor (Pontiac: *"Gönder'e basınca
    //    Telegram'a yönlendiriyor ama o da tam açılmıyor, kopyalayıp
    //    kendim yapıştırayım"*).
    //    Bu yüzden ASIL yol artık PANO: metin kopyalanır, kullanıcı
    //    Telegram'da ilgili konuya yapıştırır. Telegram'ı açma denemesi
    //    yine yapılır ama artık "işe yaramazsa" değil "bonus" konumunda.
    //
    // ⚠️⚠️ NEDEN BOT KENDİ GÖNDERMİYOR: Telegram Bot API, botun KENDİ
    //    mesajını `getUpdates` ile ona GERİ VERMEZ. Bu kanal/grup farkı
    //    DEĞİL, platformun kuralıdır — gruba geçmek bunu değiştirmedi.
    //    Gruba geçmenin kazandırdığı şey ayrı: gizlilik modu kapatılınca
    //    bot artık BAŞKALARININ yazdığı şablonları görebiliyor.
    var kopyalandi = await emirPanoyaYaz(metin);
    if (kopyalandi) {
      // ⚠️ ÖLÇÜLDÜ: bot mesajları YALNIZCA sohbet numarasına göre süzüyor
      //    (`divan_modul.cevaplari_topla` → chat.id), konu başlığına
      //    BAKMIYOR. Yani HANGİ başlığa yapıştırılırsa yapıştırılsın emir
      //    işlenir; başlık sadece bizim düzenimiz için.
      durum.textContent = "📋 Kopyalandı — Telegram'da " + emirKonusu(emirTur) +
                          " konusuna yapıştır (bot her konuyu okur; onayı da oraya yazar).";
    } else {
      durum.textContent = "⚠️ Kopyalanamadı — aşağıdaki metni elle seçip kopyala.";
    }
    setTimeout(function () { durum.textContent = ""; }, 9000);
  });

  // 📄 [21.09.2026] TEK .txt OLARAK İNDİR — uzun emirler için asıl yol.
  var _dosyaBtn = document.getElementById("emir-dosya");
  if (_dosyaBtn) {
    _dosyaBtn.addEventListener("click", function () {
      var durum = document.getElementById("emir-durum");
      var sonuc = emirMesajiKur();
      if (sonuc.hata) {
        if (durum) durum.textContent = "⚠️ " + sonuc.hata;
        return;
      }
      var ok = emirDosyaIndir(sonuc.metin);
      if (durum) {
        durum.textContent = ok
          ? "📄 Dosya indirildi — Telegram grubuna DOSYA olarak at (ataç " +
            "düğmesi). Bot içindekinin tamamını okur."
          : "⚠️ Dosya indirilemedi — metni elle kopyalayıp .txt yap.";
        setTimeout(function () { durum.textContent = ""; }, 12000);
      }
    });
  }

  document.getElementById("emir-kopyala").addEventListener("click", async function () {
    var durum = document.getElementById("emir-durum");
    var sonuc = emirMesajiKur();
    if (sonuc.hata) return;
    var ok = await emirPanoyaYaz(sonuc.metin);
    durum.textContent = ok ? "✅ kopyalandı" : "⚠️ kopyalanamadı";
    setTimeout(function () { durum.textContent = ""; }, 2500);
  });
}


/* =========================================================
   🖥️ AYAR EMRİ — launcher'ın site karşılığı (30.08.2026)
   ---------------------------------------------------------
   Kullanıcı: *"launcher'ı siteye taşıyacaksın ya, bildiğin işlem o :)"* +
   *"seçilebilen değiştirilebilen tüm görevleri siteden de verebilelim."* +
   *"pc'den de aynı şekilde devam edecek; siteden emir gelince sonraki
   tur o ayarlara geçecek."*

   ⚠️⚠️ YALNIZCA DOKUNULAN AYAR GÖNDERİLİR. Her kutunun varsayılanı
      "— değiştirme —"; boş bırakılan alan mesaja hiç yazılmaz, yani
      launcher'daki hâli korunur. Aksi hâlde site her gönderimde tüm
      ayarları ezerdi.

   ⚠️ Görev adımları `gorev_zinciri`nin anladığı biçimde üretilir
      (`seyahat:Ardencaple, gemiye_bin:mr.butcher`) — kullanıcı hiçbir şey
      ezberlemez, kutulardan seçer.
   ========================================================= */

var AY_ADIM_TIPLERI = [
  ["seyahat", "🚶 Kasabaya git"],
  ["varinca", "📍 Oraya VARILMASINI bekle"],
  ["erzak", "🍞 Yola çıkmadan erzak al (20 gün)"],
  ["gemiye_bin", "⛵ Gemiye bin"],
  ["karaya_cik", "🏝️ Karaya çık (gemiden in)"],
  ["satin_al", "🛒 Pazardan al"],
  ["odun_yukle", "🌲 Odunu evden çantaya yükle (ağırlığa göre)"],
  ["odun_sat", "🌲💸 Odunu alıcıya sat (rezerveli, alıcı alana kadar bekle)"],
  ["hersey_sat", "💸 Her şeyi sat"],
  ["ev_al", "🏠 Ev + tarla al"],
  ["tarla_al", "🌾 Tarla al (tip seç)"],
  ["ev_tasi", "🚚 Evi buraya taşı (sandık BOŞSA)"],
  ["ev_tasi_zorla", "🚚💥 Evi buraya taşı (SATMADAN · eşyalar silinir)"],
  ["atolye", "🏭 Atölye (meslek) al"],
  ["grup_kur", "👥 Grup kur (lider)"],
  ["gruba_katil", "🤝 Gruba katıl"],
  ["grup_dagit", "👥 Grubu dağıt"],
  ["takip", "🖥️ Takip modunu değiştir"],
  ["bekle", "⏳ Bekle"]
];

/* ⚠️ DEĞER İSTEMEYEN adımlar — `gorev_zinciri` ile BİREBİR aynı liste.
   Bunlarda hedef kutusu kapatılır ve boş olsa bile adım gönderilir. */
/* ⚠️⚠️ [14.09.2026] `ev_al` ARTIK DEĞER ALABİLİR → listeden ÇIKARILDI.
   Ölçülen hata: `ev_al` tarlayı alıyor ama TİPİNİ seçmiyordu (ekilemez
   tarla). Artık hedefe TARLA TİPİ yazılabiliyor (`ev_al:Sebze`); boş
   bırakılırsa eski davranış sürer, meslek adı yazılırsa atölye olarak
   çalışır — yani eski `ev_al:<meslek>` yazımı da bozulmadı. */
/* ⚓ [17.09.2026] `karaya_cik` de değer istemez: gemi güvertesindeki
   "Karaya Çıkış" düğmesine basar, hedef kutusu gereksizdir.
   ⚠️ Bu HAMLE harcar — aynı turda kaptan ayrıca hamle yapmaz. */
/* 🚚 [19.09.2026] `ev_tasi` ve `ev_tasi_zorla` DEĞER İSTEMEZ:
   taşınma HER ZAMAN "karakterin O AN bulunduğu kasabaya" yapılır —
   ölçüldü, `ev_atolye_modul.ev_tasi`in `hedef_kasaba` parametresi
   yalnızca LOG satırında kullanılıyor, hiçbir karara girmiyor.
   Ortağın isteği: *"favore konumuna varmıştır, onu da taşındırabileceğimiz
   bir tuş olsa — BULUNDUĞUN KASABAYA TAŞIN gibi."* */
/* 🍞 [10.10.2026 gece] `erzak` değer istemez — yola çıkmadan 20 günlük erzak
   (İSTEĞE BAĞLI; kullanıcı: *"soru olarak sorsun ve bize bıraksın"*). */
/* 🌲🚚 [19.10.2026] `odun_yukle` de değer istemez: kaç odun olduğu ADET kutusuna yazılır
   (boş = çantaya sığdığı kadar) — `gorev_zinciri.DEGERSIZ_ADIMLAR` ile aynı. */
var AY_DEGERSIZ = ["grup_kur", "grup_dagit", "karaya_cik",
                   "ev_tasi", "ev_tasi_zorla", "erzak", "odun_yukle"];

/* Takip modu seçenekleri (launcher'daki listeyle aynı). */
var AY_TAKIP_MODLARI = ["Yok", "Grup Takip", "Ordu Takip", "Alışverişçi",
                        "Hızlı Maden", "Hızlı Cami", "Hızlı Ot"];

var ayGorevSayac = 0;

function ayTirnak(m) {
  return String.fromCharCode(34) + m + String.fromCharCode(34);
}

/* 📍 [10.10.2026] ARA NOKTA ETİKETİ — isimsiz yol noktası da seyahat hedefi
   olabilir ("Kirkcudbright - Wigtown arası #759"). Botun yöntemi: en yakın iki
   ADLI nokta, komşular küçükten büyüğe (ara_nokta.etiket ile aynı).
   ⚠️ NUMARA (#759) esastır; bot etiketi kendisi yeniden yazar. */
function ayAraNoktaEtiketi(no, komsu, adlar) {
  if (adlar[no]) return adlar[no];
  var bulunan = [], gorulen = {}, sira = [no], i = 0;
  gorulen[no] = 1;
  while (i < sira.length && bulunan.length < 2 && i < 400) {
    var d = sira[i++];
    var k = (komsu[d] || []).slice().sort(function (a, b) { return a - b; });
    for (var j = 0; j < k.length; j++) {
      var n = k[j];
      if (gorulen[n]) continue;
      gorulen[n] = 1;
      var ad = adlar[n];
      if (ad && bulunan.indexOf(ad) < 0) {
        bulunan.push(ad);
        if (bulunan.length >= 2) break;
      }
      sira.push(n);
    }
  }
  if (bulunan.length >= 2) return bulunan[0] + " - " + bulunan[1] + " arası";
  if (bulunan.length) return bulunan[0] + " yakını";
  return "#" + no;
}

/* Kasaba listesi: harita_render.json (sitede zaten var).
   📍 [10.10.2026] Kasabalardan SONRA isimsiz ara noktalar da listelenir. */
function ayKasabalariDoldur() {
  var dl = document.getElementById("ay-sehir-listesi");
  if (!dl) return;
  fetch("harita_render.json?_=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (h) {
      var adlar = [];
      var d = (h && (h.dugumler || h.nodes)) || {};
      Object.keys(d).forEach(function (k) {
        var ad = d[k] && (d[k].ad || d[k].isim || d[k].name);
        if (typeof d[k] === "string") ad = d[k];
        if (ad) adlar.push(ad);
      });
      adlar.sort(function (a, b) { return a.localeCompare(b, "tr"); });
      var araNoktalar = [];
      if (Array.isArray(h && h.dugumler) && Array.isArray(h.kenarlar)) {
        var isim = {}, komsu = {}, isimsiz = [];
        h.dugumler.forEach(function (n) {
          if (!n) return;
          if (n.isim) isim[n.id] = n.isim; else isimsiz.push(n.id);
        });
        h.kenarlar.forEach(function (e) {
          (komsu[e[0]] = komsu[e[0]] || []).push(e[1]);
          (komsu[e[1]] = komsu[e[1]] || []).push(e[0]);
        });
        araNoktalar = isimsiz.map(function (no) {
          var et = ayAraNoktaEtiketi(no, komsu, isim);
          return et.charAt(0) === "#" ? et : et + " #" + no;
        }).sort(function (a, b) { return a.localeCompare(b, "tr"); });
      }
      dl.innerHTML = adlar.concat(araNoktalar).map(function (a) {
        return "<option value=" + ayTirnak(emirKacis(a)) + "></option>";
      }).join("");
    })
    .catch(function () { /* harita yoksa kutu serbest yazıya düşer */ });
}

/* 👑 MAKAM LİSTESİ — `trade_config.DIVAN_GOREVLERI` ile BİREBİR aynı olmalı.
   ⚠️⚠️ [17.09.2026 — DÜZELTİLDİ] Burada eskiden oyunda OLMAYAN üç makam
      vardı ("Maliye Nazırı", "İçişleri Nazırı", "Ordu Komutanı") ve
      gerçek listedeki sekiz makam (Sancak Beyi, Kazasker, Savcı, Kadı…)
      EKSİKTİ. Siteden "Maliye Nazırı" seçilse bot onu tanımaz, hesabı
      görevsiz sayardı. CLAUDE.md kuralı: "kısıtlı seçenekli alanın
      seçenekleri launcher ile BİREBİR aynı olmalıdır."
   ⚠️ Yeni makam eklenecekse önce `trade_config.DIVAN_GOREVLERI`, sonra
      burası. `testler/test_site_emir.py` ikisinin ayrışmasını engelliyor. */
var AY_DIVAN = ["Sancak Beyi", "Maden Mütevellîsi", "Sözcü", "Kazasker",
                "Ticaret Nazırı", "Serdar-ı Ekrem", "Savcı", "Kadı",
                "Yeniçeri Ağası", "Ziraat Nazırı", "Belediye Reisi",
                "Liman Şefi"];

function ayDivaniDoldur() {
  var kap = document.getElementById("ay-divan-kutular");
  if (!kap) return;
  var html = "";
  AY_DIVAN.forEach(function (g, i) {
    if (!g) return;
    html += '<label class="ay-tik-tek"><input type="checkbox" class="ay-divan-tik"'
          + ' data-gorev=' + ayTirnak(emirKacis(g)) + ' id="ay-divan-' + i + '"> '
          + emirKacis(g) + "</label>";
  });
  kap.innerHTML = html;
  Array.prototype.forEach.call(kap.querySelectorAll(".ay-divan-tik"), function (el) {
    el.addEventListener("change", emirGuncelle);
  });
  var sil = document.getElementById("ay-divan-sil");
  if (sil) sil.addEventListener("change", emirGuncelle);
}

/* Seçili makamları emir satırına çevirir. "" = değiştirme. */
function ayMakamDegeri() {
  var sil = document.getElementById("ay-divan-sil");
  if (sil && sil.checked) return "iptal";
  var secili = [];
  Array.prototype.forEach.call(
    document.querySelectorAll("#ay-divan-kutular .ay-divan-tik"), function (el) {
      if (el.checked) secili.push(el.getAttribute("data-gorev"));
    });
  /* ⚠️ Ayırıcı `trade_config.GOREV_AYIRACI` ile aynı olmalı: " + ". */
  return secili.join(" + ");
}

/* --- görev adımı satırı --- */
function ayGorevSatiriEkle() {
  var kap = document.getElementById("ay-gorev-satirlar");
  if (!kap) return;
  var no = ++ayGorevSayac;
  var kutu = document.createElement("div");
  kutu.className = "emir-satir ay-gorev-satir";
  var tipHtml = AY_ADIM_TIPLERI.map(function (t) {
    return "<option value=" + ayTirnak(t[0]) + ">" + t[1] + "</option>";
  }).join("");
  kutu.innerHTML =
    "<label>Ne yapsın" +
    "<select class=" + ayTirnak("ay-gorev-tip") + ">" + tipHtml + "</select></label>" +
    "<label>Nereye / Kim / Ne" +
    "<input class=" + ayTirnak("ay-gorev-hedef") + " list=" + ayTirnak("ay-sehir-listesi") +
    " placeholder=" + ayTirnak("örn. Ardencaple") + " autocomplete=" + ayTirnak("off") + "></label>" +
    "<label>Adet<input class=" + ayTirnak("ay-gorev-adet") + " type=" + ayTirnak("number") +
    " min=" + ayTirnak("1") + " placeholder=" + ayTirnak("1") + " disabled></label>" +
    "<button type=" + ayTirnak("button") + " class=" + ayTirnak("emir-mini-btn ay-gorev-sil") + ">➖</button>";
  kap.appendChild(kutu);

  var tip = kutu.querySelector(".ay-gorev-tip");
  var hedef = kutu.querySelector(".ay-gorev-hedef");
  var adet = kutu.querySelector(".ay-gorev-adet");
  tip.addEventListener("change", function () {
    // ⚠️ Adım türüne göre yardım listesi ve adet kutusu değişir —
    //    kullanıcı hiçbir şey ezberlemesin.
    var t = tip.value;
    // 🌲🚚 [19.10.2026] odun adımlarında adet İSTEĞE BAĞLI (boş = sığdığı kadar / hepsi).
    adet.disabled = (t !== "satin_al" && t !== "odun_yukle" && t !== "odun_sat");
    adet.placeholder = (t === "odun_yukle" ? "boş = sığdığı kadar"
                        : (t === "odun_sat" ? "boş = çantadakinin hepsi" : "1"));
    // ⚠️ Değer istemeyen adımda hedef kutusu KAPATILIR (kullanıcı boşuna
    //    bir şey yazmasın); `ayGorevMetni` onu yine de gönderir.
    hedef.disabled = (AY_DEGERSIZ.indexOf(t) >= 0);
    if (hedef.disabled) {
      hedef.value = "";
      hedef.removeAttribute("list");
      hedef.placeholder = "(değer gerekmez)";
      emirGuncelle();
      return;
    }
    if (t === "tarla_al" || t === "ev_al") {
      // ⚠️ Liste `ev_atolye_modul.TARLA_TIPLERI` ile BİREBİR aynı olmalı
      //    (canlı HTML'den ölçüldü, 12 tip).
      hedef.setAttribute("list", "ay-tarla-listesi");
      hedef.placeholder = (t === "ev_al"
        ? "tarla tipi — örn. Sebze (boş = tip seçilmez)"
        : "örn. Mısır (boş = tip seçilmez)");
    } else if (t === "takip") {
      hedef.setAttribute("list", "ay-takip-listesi");
      hedef.placeholder = "Yok / Grup Takip / Ordu Takip / Hızlı Maden";
    } else if (t === "atolye") {
      hedef.removeAttribute("list");
      hedef.placeholder = "meslek (örn. Terzi)";
    } else if (t === "hersey_sat" || t === "gruba_katil" || t === "odun_sat") {
      hedef.setAttribute("list", "emir-hesap-listesi");
      // 🌲🚚 [19.10.2026] odun_sat'ta alıcı boş bırakılabilir → ⚙️ Sistem "odun alıcıları"
      hedef.placeholder = (t === "gruba_katil" ? "grup lideri"
                           : (t === "odun_sat" ? "alıcı hesap (boş = ⚙️ Sistem'deki şehir alıcısı)"
                                               : "alıcı hesap"));
    } else if (t === "seyahat" || t === "varinca" || t === "ev_tasi") {
      hedef.setAttribute("list", "ay-sehir-listesi");
      hedef.placeholder = "örn. Ardencaple";
    } else if (t === "gemiye_bin") {
      hedef.setAttribute("list", "emir-hesap-listesi");
      hedef.placeholder = "geminin SAHİBİ (armatör)";
    } else if (t === "satin_al") {
      // ⚠ "al-mal-listesi" ALIM formunun listesidir ve pazar.json'dan
      //   ZATEN doluyor (emirPazarListesiDoldur) — ikinci bir liste
      //   tutmuyoruz, tek kaynak.
      hedef.setAttribute("list", "al-mal-listesi");
      hedef.placeholder = "örn. Çuval Buğday";
    } else {
      hedef.removeAttribute("list");
      hedef.placeholder = "kaç tur beklesin (örn. 2)";
    }
    emirGuncelle();
  });
  [hedef, adet].forEach(function (el) {
    el.addEventListener("input", emirGuncelle);
  });
  kutu.querySelector(".ay-gorev-sil").addEventListener("click", function () {
    kutu.remove();
    emirGuncelle();
  });
  emirGuncelle();
  return no;
}

/* Kutulardan `gorev_zinciri` biçiminde metin üretir. */
function ayGorevMetni() {
  var parcalar = [];
  var satirlar = document.querySelectorAll("#ay-gorev-satirlar .ay-gorev-satir");
  for (var i = 0; i < satirlar.length; i++) {
    var tip = satirlar[i].querySelector(".ay-gorev-tip").value;
    var hedef = (satirlar[i].querySelector(".ay-gorev-hedef").value || "").trim();
    // 🌲🚚 [19.10.2026] odun_yukle[:adet] — adet ADET kutusundan (boş = sığdığı kadar).
    if (tip === "odun_yukle") {
      var ay = parseInt(satirlar[i].querySelector(".ay-gorev-adet").value, 10);
      parcalar.push(ay > 0 ? "odun_yukle:" + ay : "odun_yukle");
      continue;
    }
    // 🌲🚚 [19.10.2026] odun_sat ALICISIZ da yazılır: alıcı ⚙️ Sistem → "odun alıcıları"ndan
    //    (Pontiac: "TELEGRAMDAN" belirlenip değiştirilsin) → "odun_sat" / "odun_sat:x200".
    //    ⚠️ AY_DEGERSIZ'e EKLENMEDİ: hedef kutusu açık kalsın, alıcı yine yazılabilsin.
    if (tip === "odun_sat" && !hedef) {
      var os0 = parseInt(satirlar[i].querySelector(".ay-gorev-adet").value, 10);
      parcalar.push(os0 > 0 ? "odun_sat:x" + os0 : "odun_sat");
      continue;
    }
    // ⚠️ Değer istemeyen adım (ev_al/grup_kur/grup_dagit) boş olsa da
    //    gönderilir; diğerlerinde boş adım gönderilmez.
    if (!hedef) {
      if (AY_DEGERSIZ.indexOf(tip) >= 0) { parcalar.push(tip); }
      continue;
    }
    if (tip === "satin_al") {
      var a = parseInt(satirlar[i].querySelector(".ay-gorev-adet").value, 10);
      hedef += " x" + (a > 0 ? a : 1);
    }
    // 🌲🚚 odun_sat:<alıcı>[ x<adet>] — adet yoksa çantadakinin hepsi.
    if (tip === "odun_sat") {
      var os = parseInt(satirlar[i].querySelector(".ay-gorev-adet").value, 10);
      if (os > 0) hedef += " x" + os;
    }
    parcalar.push(tip + ":" + hedef);
  }
  return parcalar.join(", ");
}

/* =========================================================
   ➕ HESAP EKLE (13.09.2026)
   Kullanıcının ortağı: *"multileri ekleyebilme seçeneği gelse güzel olur,
   sana yazdırmak yerine emir girsem."*
   ⚠️ Şablon bot tarafındaki `site_emirleri.hesap_ekle_coz` ile BİREBİR:
        HESAP EKLE / hesap: / şifre: / takip:
   ⚠️ Şifre hiçbir yere YAZILMAZ (localStorage dahil) — yalnızca metne girer.
   ⚠️ Takip listesi (he-takip) launcher.py ile aynı 6 seçenek; varsayılan
      Hızlı Maden (yeni hesap için 2 dakikalık tur).
   ========================================================= */
function hesapEkleMesajiKur() {
  var ad = emirDeger("he-hesap");
  var sifre = emirDeger("he-sifre");
  var takip = emirDeger("he-takip");
  var eksik = [];
  if (!ad) eksik.push("oyun kullanıcı adı");
  if (!sifre) eksik.push("şifre");
  if (/\s/.test(ad)) return { hata: "Kullanıcı adında boşluk olamaz (oyunun login adı)." };
  if (eksik.length) return { hata: "Eksik: " + eksik.join(", ") };
  // Zaten listedeyse bot hiçbir şey yapmaz — kullanıcı boşuna beklemesin.
  if (emirKarakterBul(ad)) {
    return { hata: "'" + ad + "' zaten hesaplarımız arasında görünüyor. Var olan hesabın " +
                   "şifresi bu yoldan değiştirilemez (bilerek)." };
  }
  var satirlar = ["HESAP EKLE", "hesap: " + ad, "şifre: " + sifre];
  if (takip) satirlar.push("takip: " + takip);
  return { metin: satirlar.join(EMIR_NL) };
}

/* =========================================================
   📋 HAZIR PLANLAR — görev zincirini tek seçimle doldurur (13.09.2026)
   Ortak "taşınma eksik" demişti; özellik vardı ama dört seviye derindeydi.
   Adım sıraları `gorev_zinciri.py` ve rehberdeki örneklerle AYNI
   (ör. evi taşımada hersey_sat BAŞTA olmak zorunda — sandık boş değilse
   bot taşımayı reddeder).
   Her adım: [tip, hedef, adet]. `{x}` yer tutucuları kullanıcı doldurur.
   ========================================================= */
var AY_PLANLAR = [
  ["tasi", "🚚 Hesabı başka şehre taşı (her şeyi sat → git → evi taşı → ev+tarla → atölye)",
   "Önce ev sandığını boşaltıp satar (20 günlük yiyecek kalır), sonra yola çıkar, varınca evi taşır, " +
   "tarla ve atölye alır. Alıcı hesap, hedef şehir ve meslek kutularını doldur.",
   [["hersey_sat", "", 0], ["seyahat", "", 0], ["ev_tasi", "", 0], ["ev_al", "", 0], ["atolye", "", 0]]],
  ["tasi2tarla", "🚚🥬 Hesabı taşı + 2 SEBZE tarlası (sat → git → evi taşı → 2 tarla)",
   "Tam otomatik: satıcı ALICIDAN ÖNCE girer, malı en düşük fiyattan ona rezerveli satar ve alıcıya " +
   "otomatik ALIM emri açar. Alıcı malı aldığı gün satıcıya TEKRAR girilir, zincir kapanır ve hesap " +
   "AYNI GÜN yola çıkar. Varınca evi taşır, 2 sebze tarlası alır ve bekleme moduna döner. " +
   "Sadece alıcı hesabı ve hedef şehri doldur.",
   [["hersey_sat", "", 0], ["seyahat", "", 0], ["ev_tasi", "", 0],
    ["tarla_al", "Sebze", 0], ["tarla_al", "Sebze", 0]]],
  ["odun", "🌲 Odunu başka şehre taşı (erzak → yükle → git → alıcıya sat → dön)",
   "Evdeki Tomruk Odun'u çanta ağırlığına sığdığı kadar (ya da Adet kutusundaki kadar) çantaya yükler, " +
   "hedef şehre gider, odunu ALICIYA rezerveli en düşük fiyattan satar ve alıcıya ALIM emri açar; " +
   "alıcı alınca evine döner. Yolda odun satılmaz, eve geri gönderilmez. Dönüş şehrini (evinin kasabası) " +
   "doldur; alıcıyı yaz ya da BOŞ bırak (boşsa ⚙️ Sistem → 🌲🚚 Odun alıcıları'ndaki o şehrin alıcısı — " +
   "Telegram'dan değiştirilebilir). Taşıyıcı alıcıdan önce girer, ilan bekliyorsa sonra. " +
   "Toplu: Hesap kutusuna kasaba: Ardencaple yaz; 3+ hesapsa yay: 3 ekle (OPSEC).",
   [["erzak", "", 0], ["odun_yukle", "", 0], ["seyahat", "Glasgow", 0], ["odun_sat", "", 0],
    ["seyahat", "", 0]]],
  ["gitaldon", "🛒 Git, al, dön (başka şehirden mal getir)",
   "Hedef şehre gider, vardığı gün alışverişi yapar ve AYNI gün dönüş emrini verir. Boşa gün geçmez.",
   [["seyahat", "", 0], ["satin_al", "", 10], ["seyahat", "", 0]]],
  ["kita", "⛵ Kıta şehrine git (limana yürü → gemiye bin → bekle → karada yürü)",
   "Kıta şehirlerine kara yolu YOK. Önce limana gidilir, gemiye binilir, geçiş süresi bekle: ile geçirilir. " +
   "Yemeği binmeden önce aldırmak için alım adımı gemiden öncedir.",
   [["seyahat", "Ardencaple", 0], ["satin_al", "", 30], ["gemiye_bin", "", 0], ["bekle", "12", 0], ["seyahat", "", 0]]],
  ["lider", "👥 Toplu taşıma — LİDER (yola çık → varınca grubu dağıt → ev + atölye)",
   "Lideri 👥 Grup Ayarları'nda tanımladıktan sonra: hedefe gider, varınca grubu dağıtır (takipçilerin " +
   "Grup Takip modu kendiliğinden kapanır), ev + atölye alır.",
   [["seyahat", "", 0], ["grup_dagit", "", 0], ["ev_al", "", 0], ["atolye", "", 0]]],
  ["takipci", "🤝 Toplu taşıma — TAKİPÇİ (varmayı bekle → takibi kapat → ev + atölye)",
   "Takipçiye seyahat: YAZILMAZ, onu grup taşır. Vardığında takip modu kapanır ve aynı gün ev/atölye alınır. " +
   "Hesabın takip modunu ayrıca 'Grup Takip' yap.",
   [["varinca", "", 0], ["takip", "Yok", 0], ["ev_al", "", 0], ["atolye", "", 0]]],
  ["evkur", "🏠 Bulunduğu şehirde ev + tarla + atölye kur (evsiz hesap)",
   "Parası 130 akçenin altındaysa hiçbir şey almaz (yarım kurulum olmasın).",
   [["ev_al", "", 0], ["atolye", "", 0]]]
];

function ayPlaniDoldur() {
  var sec = document.getElementById("ay-plan");
  if (!sec) return;
  var html = "<option value=" + ayTirnak("") + ">— kendim adım ekleyeceğim —</option>";
  AY_PLANLAR.forEach(function (p) {
    html += "<option value=" + ayTirnak(p[0]) + ">" + emirKacis(p[1]) + "</option>";
  });
  sec.innerHTML = html;
  sec.addEventListener("change", function () { ayPlanUygula(sec.value); });
}

function ayPlanUygula(kod) {
  var kap = document.getElementById("ay-gorev-satirlar");
  var aciklama = document.getElementById("ay-plan-aciklama");
  if (!kap) return;
  var plan = null;
  AY_PLANLAR.forEach(function (p) { if (p[0] === kod) plan = p; });
  if (!plan) { if (aciklama) aciklama.hidden = true; return; }
  kap.innerHTML = "";
  kap.dataset.iptal = "0";
  plan[3].forEach(function (adim) {
    ayGorevSatiriEkle();
    var satir = kap.lastElementChild;
    if (!satir) return;
    var tip = satir.querySelector(".ay-gorev-tip");
    var hedef = satir.querySelector(".ay-gorev-hedef");
    var adet = satir.querySelector(".ay-gorev-adet");
    tip.value = adim[0];
    tip.dispatchEvent(new Event("change"));       // yardım listesi + adet kutusu ayarlansın
    if (hedef && !hedef.disabled) hedef.value = adim[1] || "";
    if (adet && !adet.disabled && adim[2]) adet.value = adim[2];
    // Boş kalan hedef kutusu dikkat çeksin (kullanıcı dolduracak).
    if (hedef && !hedef.disabled && !hedef.value) hedef.classList.add("ay-eksik");
    if (hedef) hedef.addEventListener("input", function () { hedef.classList.remove("ay-eksik"); });
  });
  if (aciklama) { aciklama.textContent = "📋 " + plan[2]; aciklama.hidden = false; }
  emirGuncelle();
  var ilkBos = kap.querySelector(".ay-gorev-hedef.ay-eksik");
  if (ilkBos) ilkBos.focus();
}

/* =========================================================
   🧭 KURULUM + DÜZEN (26.10.2026 — FABLE_GOREV_2026-10-26 İŞ 32)
   Pontiac: *"bizim görev zincirinden ziyade bir hesaba aksi emir verene kadar ne iş yapacağını
   aktarmamız gerekiyor"* → üç kutu görev zincirini yazar (KURULUM — bir kez): seyahat:<kasaba> ·
   ev_al:<tür> · atolye:<meslek>; boş kutu atlanır. DÜZEN = 🎛️ Hesap planı kutuları (aksi emre
   kadar). İkisi de `ayMesajiKur` ile TEK AYAR mesajına girer.
   ⚠️ Seçenekler botla BİREBİR: tür = `ev_atolye_modul.TARLA_TIPLERI` adları (🐂 Sığır KAPALI —
      kodlanmadı, HTML bekliyor) · meslek = atölye kartlarının adları (`atolye_sec` bulur).
      `test_kalici_duzen` G bunları botun çözücüsüyle karşılaştırır.
   ========================================================= */
var AY_KURULUM_TURLERI = ["Buğday", "Mısır", "Sebze", "Arpa", "Manda", "Koç"];
var AY_KURULUM_KAPALI_TURLER = ["Sığır"];
var AY_KURULUM_MESLEKLERI = ["Değirmenci", "Fırıncı", "Kasap", "Demirci", "Terzi", "Marangoz",
                             "Heykeltıraş", "Bahçıvan"];

/* (saf) Kutulardan adım listesi: [[tip, hedef, adet], …] — boş / tanınmayan kutu atlanır. */
function kurulumAdimlari(kasaba, tur, meslek) {
  var adimlar = [];
  kasaba = String(kasaba || "").trim();
  tur = String(tur || "").trim();
  meslek = String(meslek || "").trim();
  if (kasaba) adimlar.push(["seyahat", kasaba, 0]);
  if (tur && AY_KURULUM_TURLERI.indexOf(tur) >= 0) adimlar.push(["ev_al", tur, 0]);
  if (meslek && AY_KURULUM_MESLEKLERI.indexOf(meslek) >= 0) adimlar.push(["atolye", meslek, 0]);
  return adimlar;
}

/* (saf) "seyahat:Stirling, ev_al:Sebze, atolye:Kasap" — `gorev_zinciri.zinciri_coz`un okuduğu biçim. */
function kurulumMetni(kasaba, tur, meslek) {
  return kurulumAdimlari(kasaba, tur, meslek).map(function (a) { return a[0] + ":" + a[1]; }).join(", ");
}

/* Üç kutudan görev satırlarını kurar (hazır plan gibi). Kutuların hepsi boşsa satırlara DOKUNMAZ. */
function kurulumKutulariniUygula() {
  var kap = document.getElementById("ay-gorev-satirlar");
  var ozet = document.getElementById("ay-kd-ozet");
  if (!kap) return;
  var kas = emirDeger("ay-kd-kasaba"), tur = emirDeger("ay-kd-tur"), mes = emirDeger("ay-kd-meslek");
  var adimlar = kurulumAdimlari(kas, tur, mes);
  if (!adimlar.length) { if (ozet) ozet.hidden = true; return; }
  kap.innerHTML = "";
  kap.dataset.iptal = "0";
  adimlar.forEach(function (adim) {
    ayGorevSatiriEkle();
    var satir = kap.lastElementChild;
    if (!satir) return;
    var tip = satir.querySelector(".ay-gorev-tip");
    var hedef = satir.querySelector(".ay-gorev-hedef");
    tip.value = adim[0];
    tip.dispatchEvent(new Event("change"));
    if (hedef && !hedef.disabled) hedef.value = adim[1];
  });
  if (ozet) {
    ozet.textContent = "🧭 Görev zincirine yazıldı: " + kurulumMetni(kas, tur, mes) +
      " — günlük düzen için aşağıdaki 🎛️ Hesap planı kutularını seç (aynı mesaja girer).";
    ozet.hidden = false;
  }
  emirGuncelle();
}

/* 👥 [11.10.2026] "A, B ; C" → ["A", "B", "C"] (boşluk/tekrar ayıklanır).
   Bot aynı kuralla böler (site_emirleri.emri_coz). */
function ayHesapAdlari() {
  var adlar = [];
  String(emirDeger("ay-hesap") || "").split(/[,;]+/).forEach(function (x) {
    x = x.trim();
    if (x && adlar.map(function (y) { return y.toLowerCase(); }).indexOf(x.toLowerCase()) < 0) adlar.push(x);
  });
  return adlar;
}

/* =========================================================
   👥 TOPLU EMİR — HEDEF SEÇİCİ (19.10.2026 · FABLE_GOREV_2026-10-18 İŞ 16)
   `hedef_secici.py`nin JS EŞİ (site 👁️ önizlemesi). Kural BİREBİR aynı:
     hesap: kasaba: Ardencaple, Stirling; mod: Hızlı Cami; hariç: Thebear
   • farklı süzgeçler VE · bir süzgecin değerleri VEYA · açık adlar EKLENİR ·
     hariç en son çıkarılır · kasaba = son okunan yer (gelisim.json) ·
     mod = takip (sistem.json) · liste = sistem ayarı hesap_listeleri (+ hazır).
   ⚠️ Asıl çözüm botta, emir GELDİĞİ AN yapılır; burası yalnızca önizleme.
   ⚠️ test_toplu_emir aynı örnekleri Node'da bu fonksiyonlara ve Python'a
      verip sonuçları karşılaştırır — birini değiştirirsen ötekini de değiştir.
   ========================================================= */
var HEDEF_BOLGELER = {
  kuzey: ["Glasgow", "Stirling", "Ardencaple"],
  guney: ["Whithorn", "Wigtown", "Kirkcudbright", "Girvan"]
};
var HEDEF_SECICI_ADLARI = {
  "kasaba": "kasaba", "kasabalar": "kasaba", "sehir": "kasaba",
  "mod": "mod", "takip": "mod", "takip modu": "mod",
  "meslek": "meslek", "meslekler": "meslek",
  "bolge": "bolge",
  "liste": "liste", "listeler": "liste", "hesap listesi": "liste",
  "haric": "haric", "haric tut": "haric"
};
var HEDEF_MODLAR = ["Yok", "Grup Takip", "Ordu Takip", "Alışverişçi", "Hızlı Maden", "Hızlı Cami",
                    "Hızlı Ot"];
var HEDEF_HAZIR_LISTELER = [["gözcüler", "ara_nokta_gozcu"], ["kuvvet öncelikli", "kuvvet_oncelikli"],
                            ["cami ayrıcalıklı", "cami_ayricalikli"]];

function hedefSade(m) {
  var s = String(m == null ? "" : m).replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
  [["ı", "i"], ["ş", "s"], ["ç", "c"], ["ğ", "g"], ["ü", "u"], ["ö", "o"]].forEach(function (p) {
    s = s.split(p[0]).join(p[1]);
  });
  return s.split(/\s+/).filter(Boolean).join(" ");
}
function hedefAnahtar(ad) { return String(ad == null ? "" : ad).replace(/İ/g, "i").trim().toLowerCase(); }
function hedefKas(x) { return hedefSade(x).split(" ").join(""); }
function hedefMod(m) { var s = hedefSade(m); return ["", "yok", "normal", "bos", "-"].indexOf(s) >= 0 ? "yok" : s; }
function hedefMeslek(m) {
  var s = hedefSade(m).split("i").join("").split(" ").join("");
  return ["", "-", "yok", "ssz"].indexOf(s) >= 0 ? "" : s;
}
function hedefBolge(b) {
  var s = hedefSade(b);
  return ({ "kuzey": "kuzey", "guney": "guney", "glasgow sancagi": "kuzey",
            "galloway": "guney", "galloway sancagi": "guney" })[s] || s;
}

function hedefDegerCoz(deger) {
  var sonuc = { adlar: [], kasaba: [], bolge: [], mod: [], meslek: [], liste: [], haric: [], bilinmeyen: [] };
  var secici = false;
  String(deger == null ? "" : deger).split(";").forEach(function (parca) {
    var hedef = "adlar";
    parca.split(",").forEach(function (tok) {
      tok = tok.trim();
      if (!tok) return;
      var i = tok.indexOf(":");
      if (i >= 0) {
        var et = tok.slice(0, i), val = tok.slice(i + 1);
        var k = HEDEF_SECICI_ADLARI[hedefSade(et)];
        if (!k) { sonuc.bilinmeyen.push(et.trim()); hedef = null; return; }
        hedef = k; secici = true;
        tok = val.trim();
        if (!tok) return;
      }
      if (hedef === null) return;
      if (sonuc[hedef].map(hedefSade).indexOf(hedefSade(tok)) < 0) sonuc[hedef].push(tok);
    });
  });
  sonuc.secici = secici;
  return sonuc;
}

function hedefListeBul(ad, listeler) {
  var h = hedefSade(ad), bulunan = null;
  Object.keys(listeler || {}).forEach(function (k) {
    if (bulunan === null && hedefSade(k) === h && Array.isArray(listeler[k])) {
      bulunan = listeler[k].map(function (x) { return String(x).trim(); }).filter(Boolean);
    }
  });
  return bulunan;
}

function hedefSecimCoz(secim, hesaplar, kasabaH, meslekH, listeler) {
  kasabaH = kasabaH || {}; meslekH = meslekH || {};
  var tum = [], takip = {}, anahtarlar = {};
  (hesaplar || []).forEach(function (h) {
    var ad = String((h && h.k_adi) || "").trim(), a = hedefAnahtar(ad);
    if (!a || a in takip) return;
    tum.push(ad); takip[a] = String(h.takip || "Yok"); anahtarlar[a] = ad;
  });
  var uyarilar = [], filtreler = [];
  function kume(f) { var s = {}; Object.keys(anahtarlar).forEach(function (a) { if (f(a)) s[a] = 1; }); return s; }
  if (secim.kasaba.length) {
    var ist = secim.kasaba.map(hedefKas);
    var bil = Object.keys(kasabaH).map(function (a) { return kasabaH[a] ? hedefKas(kasabaH[a]) : ""; });
    secim.kasaba.forEach(function (k) { if (bil.indexOf(hedefKas(k)) < 0) uyarilar.push("'" + k + "' kasabasında son okunan hesabımız yok"); });
    filtreler.push(["kasaba: " + secim.kasaba.join(", "), kume(function (a) { return ist.indexOf(hedefKas(kasabaH[a] || "")) >= 0; })]);
  }
  if (secim.bolge.length) {
    var kas = [];
    secim.bolge.forEach(function (b) {
      var bb = HEDEF_BOLGELER[hedefBolge(b)];
      if (!bb) { uyarilar.push("'" + b + "' diye bir bölge yok (kuzey / güney)"); return; }
      bb.forEach(function (x) { kas.push(hedefKas(x)); });
    });
    filtreler.push(["bölge: " + secim.bolge.join(", "), kume(function (a) { return kas.indexOf(hedefKas(kasabaH[a] || "")) >= 0; })]);
  }
  if (secim.mod.length) {
    var im = secim.mod.map(hedefMod), bm = HEDEF_MODLAR.map(hedefMod);
    secim.mod.forEach(function (m) { if (bm.indexOf(hedefMod(m)) < 0) uyarilar.push("'" + m + "' diye bir mod yok (" + HEDEF_MODLAR.join(" · ") + ")"); });
    filtreler.push(["mod: " + secim.mod.join(", "), kume(function (a) { return im.indexOf(hedefMod(takip[a] || "Yok")) >= 0; })]);
  }
  if (secim.meslek.length) {
    var ims = secim.meslek.map(hedefMeslek);
    filtreler.push(["meslek: " + secim.meslek.join(", "), kume(function (a) { return ims.indexOf(hedefMeslek(meslekH[a] || "")) >= 0; })]);
  }
  if (secim.liste.length) {
    var uye = {};
    secim.liste.forEach(function (l) {
      var lst = hedefListeBul(l, listeler);
      if (lst === null) { uyarilar.push("'" + l + "' adlı hesap listesi yok (⚙️ Sistem → hesap listeleri)"); return; }
      lst.forEach(function (x) { uye[hedefAnahtar(x)] = 1; });
    });
    filtreler.push(["liste: " + secim.liste.join(", "), uye]);
  }
  secim.bilinmeyen.forEach(function (b) { uyarilar.push("'" + b + ":' seçicisi tanınmadı (kasaba · bölge · mod · meslek · liste · hariç)"); });
  var secilen = [], gorulen = {}, bulunamayan = [];
  var anahtarVar = Object.keys(anahtarlar).length > 0;
  secim.adlar.forEach(function (ad) {
    var a = hedefAnahtar(ad);
    if (!a || gorulen[a]) return;
    gorulen[a] = 1;
    secilen.push(anahtarlar[a] || ad);
    if (anahtarVar && !(a in anahtarlar)) bulunamayan.push(ad);
  });
  if (filtreler.length) {
    tum.forEach(function (ad) {
      var a = hedefAnahtar(ad);
      if (gorulen[a]) return;
      if (filtreler.every(function (f) { return f[1][a]; })) { gorulen[a] = 1; secilen.push(ad); }
    });
  }
  var haric = {};
  secim.haric.forEach(function (x) {
    haric[hedefAnahtar(x)] = 1;
    if (anahtarVar && !(hedefAnahtar(x) in anahtarlar)) uyarilar.push("hariç tutulan '" + x + "' listemizde yok");
  });
  secilen = secilen.filter(function (ad) { return !haric[hedefAnahtar(ad)]; });
  var suzgec = filtreler.map(function (f) { return f[0]; }).join(" VE ");
  var ozet = secim.adlar.length ? "adlar: " + secim.adlar.join(", ") + (suzgec ? " + (" + suzgec + ")" : "") : suzgec;
  if (secim.haric.length) ozet += " − hariç: " + secim.haric.join(", ");
  return { hesaplar: secilen, bulunamayan: bulunamayan, uyarilar: uyarilar, ozet: ozet.trim() };
}

/* Sitedeki veriden önizleme bağlamı (sistem.json + gelisim.json). */
function hedefBaglam() {
  var s = (sistemVerisi && sistemVerisi.sistem) || {};
  var hesaplar = ((sistemVerisi && sistemVerisi.hesaplar) || []).map(function (h) {
    return { k_adi: h.ad, takip: (h.ayar && h.ayar.takip) || "Yok" };
  });
  var kasaba = {}, meslek = {};
  (emirGelisim || []).forEach(function (k) {
    var a = hedefAnahtar(k.karakter);
    if (!a) return;
    kasaba[a] = k.kasaba || ""; meslek[a] = k.meslek || "";
  });
  var listeler = {};
  HEDEF_HAZIR_LISTELER.forEach(function (x) { if ((s[x[1]] || []).length) listeler[x[0]] = s[x[1]].slice(); });
  var hl = s.hesap_listeleri || {};
  Object.keys(hl).forEach(function (ad) {
    if (!Array.isArray(hl[ad])) return;
    Object.keys(listeler).forEach(function (k) { if (hedefSade(k) === hedefSade(ad)) delete listeler[k]; });
    listeler[ad] = hl[ad].slice();
  });
  return { hesaplar: hesaplar, kasaba: kasaba, meslek: meslek, listeler: listeler };
}

/* Hesap kutusunda seçici var mı? (`kasaba:` · `mod:` · … ya da bilinmeyen `x:`) */
function hedefSeciciVarMi(deger) {
  var s = hedefDegerCoz(deger);
  return s.secici || s.bilinmeyen.length > 0 || s.haric.length > 0;
}

/* 👁️ Önizleme metni: "👥 seçici: … → N hesap: A, B …" */
function hedefOnizleme(deger) {
  var b = hedefBaglam();
  var r = hedefSecimCoz(hedefDegerCoz(deger), b.hesaplar, b.kasaba, b.meslek, b.listeler);
  var adlar = r.hesaplar;
  var metin = "👥 Seçici: " + (r.ozet || "?") + " → " + adlar.length + " hesap" +
    (adlar.length ? ": " + adlar.slice(0, 60).join(", ") + (adlar.length > 60 ? " … +" + (adlar.length - 60) : "") : "");
  if (r.bulunamayan.length) metin += " · ⚠️ listede bulunamadı: " + r.bulunamayan.join(", ");
  r.uyarilar.forEach(function (u) { metin += " · ⚠️ " + u; });
  if (!adlar.length) metin += " · ⛔ hiçbir hesap bulunamadı → bot emri UYGULAMAZ";
  metin += " · ℹ️ Kesin liste emir bota ulaştığı an çözülür (Telegram onayında yazılır).";
  return metin;
}

/* 🎛️ [19.10.2026 — İŞ 15] İş sırası belirteçleri — `hesap_plani.IS_TOKENLERI`
   ile BİREBİR (anahtarlar sadeleştirilmiş: ı/i · ş/s … farkı yok). test_hesap_plani
   iki tabloyu karşılaştırır; birini değiştirirsen ötekini de değiştir. */
var PLAN_IS_TOKENLERI = {
  "atolye": "atolye", "meslek": "atolye", "uretim": "atolye",
  "odun": "odun", "orman": "odun", "odun kes": "odun",
  "ot": "ot", "sifali ot": "ot", "ot topla": "ot", "sifali ot topla": "ot",
  "demir": "demir", "demir madeni": "demir",
  "maden": "maden", "madenler": "maden",
  "cami": "cami", "kilise": "cami",
  "eau": "eau", "amele": "eau", "amele pazari": "eau",
  "ders": "ders", "ders dinle": "ders",
  "iksir": "iksir", "iksir yap": "iksir", "iksir uret": "iksir", "basit iksir": "iksir",
  "yok": "yok", "hicbiri": "yok", "is yok": "yok"
};
function planIsBilinmeyen(metin) {
  var s = String(metin || "").trim();
  if (/^(iptal|normal|-|sil)$/i.test(s)) return [];
  var bilinmeyen = [];
  s.split(/[,;>→]+/).forEach(function (p) {
    var k = hedefSade(p);
    if (k && !PLAN_IS_TOKENLERI[k]) bilinmeyen.push(p.trim());
  });
  return bilinmeyen;
}

/* Emir metnini kurar — `emirMesajiKur` buradan çağırır. */
function ayMesajiKur() {
  var adlar = ayHesapAdlari();
  if (!adlar.length) return { hata: "Eksik: hangi hesap" };
  // 👥 [19.10.2026 — İŞ 16] Seçici (kasaba: · mod: · liste: …) yazıldıysa metin
  //    OLDUĞU GİBİ gider (`;` seçici ayracıdır, virgüle çevrilmez); bot çözer.
  var _hamHesap = String(emirDeger("ay-hesap") || "").trim();
  var _secici = hedefSeciciVarMi(_hamHesap);

  var satirlar = ["AYAR", "hesap: " + adlar.join(", ")];
  if (_secici) satirlar[1] = "hesap: " + _hamHesap;
  function ekle(etiket, deger) {
    if (deger) satirlar.push(etiket + ": " + deger);
  }
  ekle("takip", emirDeger("ay-takip"));
  ekle("inziva", emirDeger("ay-inziva"));
  ekle("gemi", emirDeger("ay-gemi"));
  ekle("kaptan", emirDeger("ay-kaptan"));
  ekle("ases", emirDeger("ay-ases"));
  ekle("puan", emirDeger("ay-puan"));
  ekle("ordu", emirDeger("ay-ordu"));   /* 🎖️ hangi ordu (ordu puanı) */
  ekle("ordu enerjisi", emirDeger("ay-ordu-enerji"));   /* 🪖 Ordu Takip hesabının enerjisi */
  ekle("divan", ayMakamDegeri());   /* 👑 çoklu makam (tikli liste) */
  ekle("seyahat", emirDeger("ay-seyahat"));
  ekle("ders", emirDeger("ay-ders"));
  ekle("armatör", emirDeger("ay-armator"));
  // 🎓👷 [03.09.2026] Hocalık + işçi tutma (bkz. site_emirleri._IZINLI_ALANLAR)
  ekle("ders verme", emirDeger("ay-ders-verme"));
  ekle("işçi", emirDeger("ay-isci"));
  // 🌲 [10.10.2026] Orman işi (site_emirleri "orman işi" → orman_isi: odun / yok)
  ekle("orman işi", emirDeger("ay-orman"));
  // 📦 [05.10.2026] Günlük Midas kutusu (site_emirleri "midas" → midas_kutu)
  ekle("midas", emirDeger("ay-midas"));
  // 💰 [20.10.2026] Midas para hedefi (site_emirleri "midas para hedefi" → midas_para_hedefi)
  ekle("midas para hedefi", emirDeger("ay-midas-hedef"));
  // 👕 [26.10.2026 — İŞ 31] Giysi al (site_emirleri "giysi al" → giysi_al: açık / kapalı)
  ekle("giysi al", emirDeger("ay-giysi"));
  // 🖥️ [05.10.2026] Formda kutusu olmayan üç alan (site_emirleri etiketleri)
  ekle("hızlı", emirDeger("ay-jeton"));          /* seyahat_jetonlu */
  ekle("grup lideri", emirDeger("ay-grup"));     /* grup_lideri */
  ekle("yol", emirDeger("ay-yol"));              /* yol_secimi */
  // 🎛️ [19.10.2026 — İŞ 15] HESAP PLANI (site_emirleri._IZINLI_ALANLAR → plan_*;
  //    değerler hesap_plani.deger_coz ile doğrulanır). Boş = değiştirme.
  var _planIs = String(emirDeger("ay-plan-is") || "").trim();
  if (_planIs) {
    var _bilinmeyen = planIsBilinmeyen(_planIs);
    if (_bilinmeyen.length) return { hata: "İş sırasında tanınmayan: " + _bilinmeyen.join(", ") +
      " (atölye · odun · ot · demir · maden · cami · eaü · ders · yok)" };
  }
  var _planCami = String(emirDeger("ay-plan-cami") || "").trim();
  if (_planCami && !/^(\d{1,6}|iptal)$/i.test(_planCami)) return { hata: "Cami parası sayı olmalı (örn. 50) ya da “iptal”" };
  ekle("yemek", emirDeger("ay-plan-yemek"));
  ekle("meyhane", emirDeger("ay-plan-meyhane"));
  ekle("yol yemeği", emirDeger("ay-plan-yol"));
  ekle("tarla", emirDeger("ay-plan-tarla"));
  ekle("iş sırası", _planIs);
  ekle("kalan enerji", emirDeger("ay-plan-kalan"));
  ekle("cami parası", _planCami);
  ekle("satış", emirDeger("ay-plan-satis"));
  var _pIptal = document.getElementById("ay-plan-iptal");
  if (_pIptal && _pIptal.checked) satirlar.push("plan: iptal");
  // 🧹 [19.10.2026 — İŞ 11 d] SIFIRLA (site_emirleri._SIFIRLA_ETIKETLERI → SIFIRLA_ALANLARI)
  var _sifirla = document.getElementById("ay-sifirla");
  if (_sifirla && _sifirla.checked) satirlar.push("sıfırla: evet");
  // 🩺 [19.10.2026 — İŞ 5] TEŞHİS (site_emirleri "teşhis" → teshis, bir kerelik)
  var _teshis = document.getElementById("ay-teshis");
  ekle("teşhis", _teshis && _teshis.checked ? "evet" : "");
  // 🗳️ [26.10.2026 — İŞ 35] OY HAZIRLA (site_emirleri "oy hazırla" → oy_hazirla, bir kerelik)
  ekle("oy hazırla", emirDeger("ay-oy-hazirla"));

  if (document.getElementById("ay-gorev-satirlar").dataset.iptal === "1") {
    satirlar.push("görev: iptal");
  } else {
    // 📋 Hazır plandan kalan BOŞ kutu varsa adım sessizce düşer; kullanıcı
    //    bunu fark etsin (eksik adımlı zincir yanlış iş yaptırır).
    var bosKutu = document.querySelectorAll("#ay-gorev-satirlar .ay-gorev-hedef.ay-eksik").length;
    if (bosKutu) return { hata: "Görev zincirinde " + bosKutu + " kutu boş kaldı (sarı çerçeveli) — doldur ya da o adımı ➖ ile sil." };
    var g = ayGorevMetni();
    if (g) satirlar.push("görev: " + g);
  }

  if (satirlar.length < 3) {
    return { hata: "Hiçbir ayara dokunmadın — değiştirmek istediğin kutuyu seç." };
  }
  // 📅 [19.10.2026 — İŞ 16] Toplu seyahat / zincir güne yayma (OPSEC)
  var _yay = emirDeger("ay-yay");
  if (_yay) satirlar.push("yay: " + _yay);
  return { metin: satirlar.join(EMIR_NL) };
}

function ayKur() {
  ayKasabalariDoldur();
  ayDivaniDoldur();
  ayPlaniDoldur();
  // ➕ Hesap ekleme formu dinleyicileri
  ["he-hesap", "he-sifre", "he-takip"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", emirGuncelle);
      el.addEventListener("change", emirGuncelle);
    }
  });
  var ekle = document.getElementById("ay-gorev-ekle");
  var temizle = document.getElementById("ay-gorev-temizle");
  var kap = document.getElementById("ay-gorev-satirlar");
  if (ekle) ekle.addEventListener("click", function () {
    kap.dataset.iptal = "0";
    ayGorevSatiriEkle();
  });
  if (temizle) temizle.addEventListener("click", function () {
    kap.innerHTML = "";
    // ⚠️ "iptal" ayrı bir durumdur: adım YOK demek "değiştirme",
    //    iptal demek "varsa mevcut görevi sil".
    kap.dataset.iptal = kap.dataset.iptal === "1" ? "0" : "1";
    emirGuncelle();
  });
  ["ay-hesap", "ay-takip", "ay-inziva", "ay-gemi", "ay-kaptan", "ay-ases",
   "ay-puan", "ay-ordu", "ay-ordu-enerji", "ay-seyahat", "ay-ders", "ay-armator",
   "ay-ders-verme", "ay-isci", "ay-orman", "ay-midas", "ay-midas-hedef", "ay-giysi", "ay-jeton", "ay-grup", "ay-yol",
   "ay-yay", "ay-plan-yemek", "ay-plan-meyhane", "ay-plan-yol", "ay-plan-tarla", "ay-plan-is",
   "ay-plan-kalan", "ay-plan-cami", "ay-plan-satis", "ay-plan-iptal", "ay-sifirla", "ay-teshis",
   "ay-oy-hazirla"
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", emirGuncelle);
      el.addEventListener("change", emirGuncelle);
    }
  });
  // 🧭 [26.10.2026 — İŞ 32] Kurulum + Düzen kutuları → görev satırları.
  ["ay-kd-kasaba", "ay-kd-tur", "ay-kd-meslek"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", kurulumKutulariniUygula);
  });
  // 👁️ [05.10.2026] Hesap seçilince ŞU ANKİ ayarları göster (sistem.json).
  var _ayh = document.getElementById("ay-hesap");
  if (_ayh) {
    _ayh.addEventListener("input", ayMevcutYaz);
    _ayh.addEventListener("change", ayMevcutYaz);
  }
}

/* =========================================================
   ⚙️ SİSTEM AYARLARI (05.10.2026)
   Kullanıcı: *"tüm değişkenleri siteden yönetebilelim ... hepsini
   emirlerden görmemizi sağla ve güncellememizi siteden yapmayı
   kolaylaştır ve ekle olmayanları diğer görevlerinden ayrı olarak yap"*.
   ⚠️ Şablon `site_emirleri.sistem_emri_coz` ile BİREBİR aynı olmalı:
      ilk satır "⚙️ SİSTEM AYARI", her satır "etiket: değer"; listelerde
      "etiket ekle: a, b" · "etiket çıkar: a" · "etiket: a, b" (listeyi bu
      yap) · "etiket: iptal" (boşalt). Etiketler `SISTEM_ALANLARI`ndaki
      anahtarlardan seçildi.
   ========================================================= */
var sistemVerisi = null;

// [kutu kimliği, botun anladığı etiket]
var SISTEM_TEKIL = [
  ["si-maden-oncelik", "maden önceliği"],
  ["si-kapanis", "kapanış"],
  ["si-garson", "yaşlı garson"],
  ["si-rapor", "rapor ismi"],
  ["si-armator", "gemi armatörü"],
  ["si-kaptan-hedef", "kaptan hedef limanı"],
  ["si-kaptan-devir", "kaptan devir hedefi"],
  ["si-kaptan-hareket", "kaptan hareket"],
  ["si-yelken", "kaptan yelken"],
  ["si-kiyi", "kaptan kıyı mesafesi"],
  ["si-molla", "molla hesabı"],
  ["si-kasa-esik", "kasa eşiği"],
  ["si-kasa-tutar", "kasa tutarı"],
  ["si-kasa-azami", "kasa günlük üst sınır"],
  ["si-kasa-birim", "kasa birim fiyatı"],
  ["si-ot-gun", "ot satış günü"],
  ["si-giysi-agi", "giysi ağı"],
  ["si-giysi-tavan", "giysi tavanı"],
  ["si-giysi-asgari", "giysi asgari para"]
];
// [kutu kimliği (işlem kutusu = kimlik + "-islem"), botun anladığı etiket]
var SISTEM_LISTELER = [
  ["si-maden-kasaba", "maden kasabaları"],
  ["si-cami", "cami ayrıcalıklı"],
  ["si-kuvvet", "kuvvet öncelikli"],
  ["si-odun", "odun kasabaları"],
  ["si-hurda-ot", "hurda ot kasabaları"],
  ["si-gozcu", "ara nokta gözcüleri"],
  ["si-kasa", "kasa hesapları"],
  ["si-kasa-mal", "kasa malları"],
  ["si-odun-alici", "odun alıcıları"],
  ["si-alim-gozcu", "alım gözcüleri"],
  ["si-ot-alici", "ot alıcıları"],
  ["si-firinci", "fırıncılar"],
  ["si-terzi", "terziler"],
  ["si-rota", "kaptan rota"],
  ["si-ders", "ders verebilir"],
  ["si-dost", "dost"],
  ["si-dusman", "düşman"],
  ["si-izleme", "izleme"]
];
var SISTEM_ETIKET = {
  maden_kasabalari: "⛏️ Maden kasabaları", maden_oncelik: "⛏️ Öncelikli maden",
  cami_ayricalikli: "🕌 Ayrıcalıklı cami hesapları", kuvvet_oncelikli: "💪 Kuvvet öncelikli hesaplar",
  odun_kasabalari: "🌲 Odun kasabaları", ara_nokta_gozcu: "📍👁️ Ara nokta gözcüleri",
  hurda_ot_kasabalari: "🌿 Hurda ot kasabaları",
  kasa_hesaplari: "🏦 Kasa hesapları (kasaba=kasa)", kasa_mal: "🏦 Kasaya satılacak mal",
  kasa_esik: "🏦 Kasa eşiği (akçe altı)", kasa_tutar: "🏦 Kasa aktarım tutarı",
  kasa_gunluk_azami: "🏦 Kasa günlük üst sınır", kasa_birim: "🏦 Kasa birim fiyatı",
  odun_alicilari: "🌲🚚 Odun alıcıları (kasaba=alıcı)",
  alim_gozculeri: "🪖 Alım modu gözcüleri (kasaba=hesap)",
  ot_alicilari: "⚗️ Ot alıcıları (kasaba=iksirci)", ot_satis_gunu: "⚗️ Ot satış günü (haftada bir)",
  firincilar: "🍞 Fırıncılar (kasaba=fırıncı)",
  terziler: "🧵 Terziler (kasaba=terzi)",
  giysi_agi: "👕 Giysi ağı (eksik giysiyi pazardan al)",
  giysi_tavani: "👕 Giysi tavanı (parça başına)", giysi_asgari_para: "👕 Giysiden sonra kalacak para",
  hesap_listeleri: "📋 Hesap listeleri (toplu emir)",
  kapanis_islemi: "🌙 Tur bitince",
  yasli_garson: "🧹 Yaşlı garson", telegram_isim: "📝 Rapor ismi",
  gemi_armatoru: "🚢 Gemi armatörü", molla_hesabi: "🕌 Molla hesabı",
  ders_verebilir: "🎓 Ders verebilir", kaptan_hedef_liman: "⚓ Kaptan hedef limanı",
  kaptan_devir_hedefi: "⚓ Kaptanlık devir hedefi", kaptan_hareket_aktif: "⚓ Kaptan hareketi",
  kaptan_yelken: "⚓ Yelken", kaptan_kiyi_mesafesi: "⚓ Kıyı mesafesi",
  kaptan_rota: "⚓ Kaptan rota durakları", gemiler: "⛵ Ek gemiler", modem: "🌐 Modem (yalnızca launcher)"
};

function sistemDegerYazisi(alan, d) {
  if (Array.isArray(d)) return d.length ? d.join(", ") : "—";
  if (d === true) return "açık";
  if (d === false) return "kapalı";
  if (alan === "kapanis_islemi") return ["açık bırak", "😴 uyku", "⏻ kapat"][d] || String(d);
  if (alan === "yasli_garson") return ([1, 20, 40, 60][d] || 1) + " sn";
  if (alan === "maden_oncelik") return ({ demir: "Demir", tas: "Taş", altin: "Altın", kil: "Kil" })[d] || "yok (ilk açık maden)";
  if (alan === "kaptan_yelken") return d || "otomatik";
  if (alan === "ot_satis_gunu") return d ? d + " (haftada bir)" : "kapalı";
  // 👕 [26.10.2026] yazılmamış giysi ağı = varsayılan AÇIK (bot: giysi_agi.ayar_coz)
  if (alan === "giysi_agi" && (d === null || d === undefined || d === "")) return "varsayılan (açık)";
  if (["kasa_esik", "kasa_tutar", "kasa_gunluk_azami", "kasa_birim",
       "giysi_tavani", "giysi_asgari_para"].indexOf(alan) >= 0) {
    return (d === null || d === undefined || d === "") ? "varsayılan" : String(d).replace(".", ",") + " akçe";
  }
  if (alan === "gemiler") {
    var ks = Object.keys(d || {});
    return ks.length ? ks.join(", ") : "—";
  }
  if (alan === "hesap_listeleri") {
    var ls = Object.keys(d || {});
    return ls.length ? ls.map(function (k) {
      var u = Array.isArray(d[k]) ? d[k] : [];
      return k + " (" + u.length + "): " + (u.join(", ") || "—");
    }).join(" · ") : "—";
  }
  if (d === null || d === undefined || d === "") return "—";
  return String(d);
}

function sistemMevcutYaz() {
  var kutu = document.getElementById("si-mevcut");
  var gun = document.getElementById("si-guncelleme");
  if (!kutu) return;
  if (!sistemVerisi) {
    kutu.textContent = "sistem.json henüz yayınlanmadı (bot ilk açılışında / ilk sistem emrinde üretilir).";
    return;
  }
  if (gun) gun.textContent = "(" + (sistemVerisi.son_guncelleme || "?") + ")";
  var s = sistemVerisi.sistem || {};
  var sira = ["maden_kasabalari", "maden_oncelik", "cami_ayricalikli", "kuvvet_oncelikli",
              "odun_kasabalari", "odun_alicilari", "alim_gozculeri", "hurda_ot_kasabalari", "ara_nokta_gozcu",
              "ot_alicilari", "ot_satis_gunu", "firincilar", "kasa_hesaplari", "kasa_mal", "kasa_esik",
              "kasa_tutar", "kasa_gunluk_azami", "kasa_birim", "terziler", "giysi_agi",
              "giysi_tavani", "giysi_asgari_para", "hesap_listeleri", "kapanis_islemi",
              "yasli_garson", "telegram_isim", "gemi_armatoru", "kaptan_hedef_liman",
              "kaptan_devir_hedefi", "kaptan_hareket_aktif", "kaptan_yelken",
              "kaptan_kiyi_mesafesi", "kaptan_rota", "gemiler", "molla_hesabi",
              "ders_verebilir", "modem"];
  var satir = sira.filter(function (a) { return a in s; }).map(function (a) {
    return "<tr><td>" + emirKacis(SISTEM_ETIKET[a] || a) + "</td><td><b>" +
           emirKacis(sistemDegerYazisi(a, s[a])) + "</b></td></tr>";
  });
  // 👕 [26.10.2026] giysi ağı HİÇ yazılmamışsa da görünsün: varsayılan AÇIK (kullanıcı "UYGUNDUR").
  if (!("giysi_agi" in s)) {
    satir.push("<tr><td>" + emirKacis(SISTEM_ETIKET.giysi_agi || "giysi_agi") + "</td><td><b>" +
               emirKacis(sistemDegerYazisi("giysi_agi", null)) + "</b></td></tr>");
  }
  var l = sistemVerisi.listeler || {};
  [["dost", "🤝 Dost (aile)"], ["dusman", "🏴 Düşman"], ["izleme", "🚨 İzleme"]].forEach(function (x) {
    var ad = l[x[0]] || [];
    satir.push("<tr><td>" + x[1] + " (" + ad.length + ")</td><td>" +
               emirKacis(ad.length ? ad.join(", ") : "—") + "</td></tr>");
  });
  var html = '<table class="si-tablo">' + satir.join("") + "</table>";
  var g = sistemVerisi.sistem_gecmis || [];
  if (g.length) {
    html += "<p class='emir-kucuk'><b>Son değişiklikler:</b></p><ul class='si-gecmis'>" +
      g.slice(0, 8).map(function (k) {
        return "<li>" + emirKacis(k.zaman || "") + " · " + emirKacis(k.yazan || "") + " — " +
          (k.degisiklikler || []).map(function (d) {
            return emirKacis((d.etiket || d.alan || "") + ": " +
                             (d.eski ? d.eski + " → " : "") + (d.yeni || ""));
          }).join(" · ") + "</li>";
      }).join("") + "</ul>";
  }
  kutu.innerHTML = html;
}

/* Hesap rolleri — launcher tablosundaki her sütun + siteden verilenler. */
function sistemRolleri() {
  var roller = {};
  function ekle(rol, ad) { (roller[rol] = roller[rol] || []).push(ad); }
  var cami = ((sistemVerisi && sistemVerisi.sistem && sistemVerisi.sistem.cami_ayricalikli) || [])
    .map(function (x) { return String(x).toLowerCase(); });
  var kuvvet = ((sistemVerisi && sistemVerisi.sistem && sistemVerisi.sistem.kuvvet_oncelikli) || [])
    .map(function (x) { return String(x).toLowerCase(); });
  var gozcu = ((sistemVerisi && sistemVerisi.sistem && sistemVerisi.sistem.ara_nokta_gozcu) || [])
    .map(function (x) { return String(x).toLowerCase(); });
  ((sistemVerisi && sistemVerisi.hesaplar) || []).forEach(function (h) {
    var a = h.ayar || {}, ad = h.ad;
    if (a.takip) ekle("🧭 Mod: " + a.takip, ad);
    if (a.kaptan) ekle("⚓ Kaptan", ad);
    if (a.gemi) ekle("🚢 Gemi tayfası", ad);
    if (a.ases) ekle("🛡️ Ases", ad);
    if (a.inziva) ekle("🕌 İnziva", ad);
    if (a.puan_ureten) ekle("⭐ Puan üreten (" + (a.puan_ureten === true ? "devlet" : a.puan_ureten) + ")", ad);
    if (a.divan_gorevi) ekle("👑 " + a.divan_gorevi, ad);
    if (a.ders_alani) ekle("🎓 Ders dinliyor (" + a.ders_alani + ")", ad);
    if (a.ders_verme) ekle("🎓 Hoca: " + a.ders_verme, ad);
    if (a.isci_tut) ekle("👷 İşçi tut", ad);
    if (a.orman_isi) ekle("🌲 Orman işi: " + a.orman_isi, ad);
    if (a.midas_kutu) ekle("📦 Midas kutusu (günde " + a.midas_kutu + ")", ad);
    if (a.midas_para_hedefi) ekle("💰 Midas para hedefi (" + a.midas_para_hedefi + " akçe)", ad);
    if (a.giysi_al) ekle("👕 Giysi al (eksik giysiyi pazardan)", ad);
    // 👕 [26.10.2026 inceleme] ağ varsayılan AÇIK → açıkça "kapalı" yazılmış hesap ağın DIŞINDA
    if (a.giysi_al === false) ekle("👕 Giysi ağı DIŞINDA (giysi almaz)", ad);
    if (a.gorev) ekle("🧭 Görev zinciri", ad + " (" + a.gorev + ")");
    if (a.seyahat_hedefi) ekle("🌍 Seyahat", ad + " → " + a.seyahat_hedefi);
    if (a.grup_lideri) ekle("👥 Grup", ad + " (lider: " + a.grup_lideri + ")");
    if (a.ordu_enerji) ekle("🪖 Ordu enerjisi: " + a.ordu_enerji, ad);
    if (a.ordu_adi) ekle("🎖️ Ordu puanı: " + a.ordu_adi, ad);
    if (a.hersey_sat) ekle("💸 Her şeyi sat", ad + " → " + a.hersey_sat);
    if (a.sadece_bekle) ekle("⏸️ Girip bekle (liste dışı)", ad);
    // 🩺 [26.10.2026 — İŞ 33] teşhis emri işlendi, hesabın girişi bekleniyor (sistem.json)
    if (a.teshis) ekle("🩺 Teşhis bekliyor", ad);
    if (cami.indexOf(String(ad).toLowerCase()) >= 0) ekle("🕌 Ayrıcalıklı cami", ad);
    if (kuvvet.indexOf(String(ad).toLowerCase()) >= 0) ekle("💪 Kuvvet öncelikli", ad);
    if (gozcu.indexOf(String(ad).toLowerCase()) >= 0) ekle("📍👁️ Ara nokta gözcüsü", ad);
    // 🎛️ [19.10.2026 — İŞ 15] hesap planı (boş = bugünkü düzen)
    var _plan = planOzetiJs(a);
    if (_plan) ekle("🎛️ Planlı hesap", ad + " (" + _plan + ")");
    if (String(a.plan_yemek || "") === "yok") ekle("🍽️⛔ Plan gereği yemek YEMEYEN", ad);
    if (h.bekleyen && h.bekleyen.length) ekle("⏳ Siteden bekleyen ayar", ad + " (" + h.bekleyen.join(", ") + ")");
  });
  return roller;
}

/* 🎛️ [19.10.2026 — İŞ 15] hesap ayarındaki plan_* alanlarının okunur özeti
   (kayıt değerleri zaten Türkçe: "basic" · "cami, demir, eaü" · 50 …). */
var PLAN_ALAN_ADLARI = [["plan_yemek", "yemek"], ["plan_meyhane", "meyhane"],
  ["plan_yol_yemegi", "yol yemeği"], ["plan_tarla", "tarla"], ["plan_is_sirasi", "iş"],
  ["plan_kalan_enerji", "kalan enerji"], ["plan_cami_para", "cami parası"], ["plan_satis", "satış"]];
function planOzetiJs(ayar) {
  var a = ayar || {};
  return PLAN_ALAN_ADLARI.filter(function (x) {
    return a[x[0]] !== undefined && a[x[0]] !== null && a[x[0]] !== "";
  }).map(function (x) {
    var d = a[x[0]];
    if (x[0] === "plan_is_sirasi") d = String(d).split(/\s*,\s*/).join(">");
    if (x[0] === "plan_cami_para") d = d + " akçe";
    return x[1] + "=" + d;
  }).join(" · ");
}
window.planOzetiJs = planOzetiJs;

function sistemRollerYaz() {
  var kutu = document.getElementById("si-roller");
  if (!kutu) return;
  if (!sistemVerisi) { kutu.textContent = "sistem.json henüz yayınlanmadı."; return; }
  var r = sistemRolleri();
  var adlar = Object.keys(r).sort(function (a, b) { return a.localeCompare(b, "tr"); });
  var ozel = 0;
  (sistemVerisi.hesaplar || []).forEach(function (h) { if (Object.keys(h.ayar || {}).length) ozel++; });
  kutu.innerHTML = "<p class='emir-kucuk'>Toplam " + (sistemVerisi.toplam_hesap || 0) +
    " hesap · " + ozel + " hesapta özel ayar var (geri kalanı normal tur).</p>" +
    "<ul class='si-roller'>" + adlar.map(function (rol) {
      return "<li><b>" + emirKacis(rol) + "</b> (" + r[rol].length + "): " +
             emirKacis(r[rol].join(", ")) + "</li>";
    }).join("") + "</ul>";
}

/* 👁️ Ayar formunda seçilen hesabın şu anki özel ayarları. */
function ayMevcutYaz() {
  var el = document.getElementById("ay-mevcut");
  if (!el) return;
  // 👥 [19.10.2026 — İŞ 16] Seçici yazıldıysa: hangi hesaplara gideceği (önizleme).
  var _ham = String(emirDeger("ay-hesap") || "").trim();
  if (_ham && hedefSeciciVarMi(_ham)) {
    el.textContent = hedefOnizleme(_ham);
    el.hidden = false;
    return;
  }
  // 👥 [11.10.2026] Birden çok hesap yazıldıysa: kaç hesap + listede olmayan ad.
  var _adlar = ayHesapAdlari();
  if (_adlar.length > 1) {
    var _bilinen = ((sistemVerisi && sistemVerisi.hesaplar) || []).map(function (x) {
      return String(x.ad || "").toLowerCase();
    });
    var _yok = _bilinen.length ? _adlar.filter(function (x) {
      return _bilinen.indexOf(x.toLowerCase()) < 0;
    }) : [];
    el.textContent = "👥 " + _adlar.length + " hesaba aynı ayar gidecek: " + _adlar.join(", ") +
      (_yok.length ? " · ⚠️ listede bulunamadı: " + _yok.join(", ") + " (yazım hatası olabilir)" : "");
    el.hidden = false;
    return;
  }
  var ad = String(_adlar[0] || "").toLowerCase();
  var h = null;
  ((sistemVerisi && sistemVerisi.hesaplar) || []).forEach(function (x) {
    if (String(x.ad || "").toLowerCase() === ad) h = x;
  });
  if (!ad || !h) { el.hidden = true; el.textContent = ""; return; }
  var a = h.ayar || {};
  var parca = Object.keys(a).sort().map(function (k) {
    var d = a[k];
    return k + ": " + (d === true ? "açık" : d === false ? "kapalı" : d);
  });
  var cami = ((sistemVerisi.sistem || {}).cami_ayricalikli || []).map(function (x) { return String(x).toLowerCase(); });
  if (cami.indexOf(ad) >= 0) parca.push("🕌 ayrıcalıklı cami (⚙️ Sistem ayarları)");
  var kuvvetL = ((sistemVerisi.sistem || {}).kuvvet_oncelikli || []).map(function (x) { return String(x).toLowerCase(); });
  if (kuvvetL.indexOf(ad) >= 0) parca.push("💪 kuvvet öncelikli (⚙️ Sistem ayarları)");
  el.textContent = "👁️ Şu an: " + (parca.length ? parca.join(" · ") : "özel ayar yok (normal tur)") +
    (h.bekleyen && h.bekleyen.length ? " · ⏳ bekleyen site emri: " + h.bekleyen.join(", ") : "");
  el.hidden = false;
}

function sistemMesajiKur() {
  var satirlar = ["⚙️ SİSTEM AYARI"];
  SISTEM_TEKIL.forEach(function (x) {
    var d = String(emirDeger(x[0]) || "").trim();
    if (d) satirlar.push(x[1] + ": " + d);
  });
  var hata = "";
  SISTEM_LISTELER.forEach(function (x) {
    var islem = emirDeger(x[0] + "-islem");
    if (!islem) return;
    var adlar = [];
    String(emirDeger(x[0]) || "").split(/[\r\n,;]+/).forEach(function (y) {
      y = y.trim();
      if (y && adlar.map(function (z) { return z.toLowerCase(); }).indexOf(y.toLowerCase()) < 0) adlar.push(y);
    });
    if (islem === "boşalt") { satirlar.push(x[1] + ": iptal"); return; }
    if (!adlar.length) { hata = hata || ("“" + x[1] + "” için ad yaz (virgülle ayır)"); return; }
    if (islem === "ekle") satirlar.push(x[1] + " ekle: " + adlar.join(", "));
    else if (islem === "çıkar") satirlar.push(x[1] + " çıkar: " + adlar.join(", "));
    else satirlar.push(x[1] + ": " + adlar.join(", "));
  });
  // 📋 [19.10.2026 — İŞ 16] adlı hesap listesi → "hesap listesi <ad>[ ekle| çıkar]: …"
  var lIslem = emirDeger("si-liste-islem");
  if (lIslem) {
    var lAd = String(emirDeger("si-liste-ad") || "").trim();
    var lAdlar = [];
    String(emirDeger("si-liste") || "").split(/[\r\n,;]+/).forEach(function (y) {
      y = y.trim();
      if (y && lAdlar.map(function (z) { return z.toLowerCase(); }).indexOf(y.toLowerCase()) < 0) lAdlar.push(y);
    });
    if (!lAd || lAd.indexOf(":") >= 0) hata = hata || "“hesap listesi” için liste adı yaz (iki nokta olmadan)";
    else if (lIslem === "boşalt") satirlar.push("hesap listesi " + lAd + ": iptal");
    else if (!lAdlar.length) hata = hata || ("“" + lAd + "” listesi için ad yaz (virgülle ayır)");
    else if (lIslem === "ekle") satirlar.push("hesap listesi " + lAd + " ekle: " + lAdlar.join(", "));
    else if (lIslem === "çıkar") satirlar.push("hesap listesi " + lAd + " çıkar: " + lAdlar.join(", "));
    else satirlar.push("hesap listesi " + lAd + ": " + lAdlar.join(", "));
  }
  if (hata) return { hata: "Eksik: " + hata };
  if (satirlar.length < 2) return { hata: "Hiçbir ayara dokunmadın — değiştirmek istediğin kutuyu seç." };
  return { metin: satirlar.join(EMIR_NL) };
}

function sistemYukle() {
  return fetch("sistem.json?_=" + Date.now())
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (v) {
      sistemVerisi = v;
      sistemMevcutYaz();
      sistemRollerYaz();
      ayMevcutYaz();
    });
}

function sistemKur() {
  var ISLEMLER = [["", "— değiştirme —"], ["ekle", "➕ ekle"], ["çıkar", "➖ çıkar"],
                  ["ata", "✏️ listeyi TAM OLARAK bu yap"], ["boşalt", "🗑️ listeyi boşalt"]];
  SISTEM_LISTELER.forEach(function (x) {
    var sec = document.getElementById(x[0] + "-islem");
    if (sec && !sec.options.length) {
      sec.innerHTML = ISLEMLER.map(function (o) {
        return '<option value="' + o[0] + '">' + o[1] + "</option>";
      }).join("");
    }
    [x[0], x[0] + "-islem"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("input", emirGuncelle); el.addEventListener("change", emirGuncelle); }
    });
  });
  SISTEM_TEKIL.forEach(function (x) {
    var el = document.getElementById(x[0]);
    if (el) { el.addEventListener("input", emirGuncelle); el.addEventListener("change", emirGuncelle); }
  });
  // 📋 [19.10.2026] adlı hesap listesi kutuları ("boşalt" = listeyi SİL)
  var lsec = document.getElementById("si-liste-islem");
  if (lsec && !lsec.options.length) {
    lsec.innerHTML = ISLEMLER.map(function (o) {
      return '<option value="' + o[0] + '">' + (o[0] === "boşalt" ? "🗑️ listeyi sil" : o[1]) + "</option>";
    }).join("");
  }
  ["si-liste-ad", "si-liste-islem", "si-liste"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener("input", emirGuncelle); el.addEventListener("change", emirGuncelle); }
  });
  sistemYukle();
}

emirOlaylariBagla();
ayKur();
sistemKur();   /* ⚙️ 05.10.2026 */
emirYukle();

/* =========================================================
   🚫 EMİR İPTAL (06.09.2026)
   Kullanıcı: *"sitede bekleyen emirleri güncelleme var mı?
   oradan manuel iptal etme şansımız?"*

   Akış diğer emirlerle AYNI: site metni üretir → pano/ntfy →
   Telegram → `divan_modul` → `pazar_emirleri.emirleri_iptal_et`.
   ⚠️ Site doğrudan gönderemez (Telegram botun kendi mesajını geri
      vermiyor) — bu ölçülmüş bir kısıt, bkz. emir.js açıklaması.
   ========================================================= */

/* Tek yerden gönderim: pano + (varsa) ntfy + Telegram denemesi.
   ⚠️ Metin üretimi ÇAĞIRANA aittir; bu fonksiyon yalnızca yollar. */
async function emirMetniniYolla(metin, durumEl) {
  await emirPanoyaYaz(metin);
  if (typeof EMIR_NTFY_AKTIF !== "undefined" && EMIR_NTFY_AKTIF) {
    try {
      const y = await fetch("https://ntfy.sh/" + EMIR_NTFY_KONU,
                            { method: "POST", body: metin });
      if (!y.ok) throw new Error("durum " + y.status);
      if (durumEl) durumEl.textContent = "✅ iptal emri bota iletildi";
      return true;
    } catch (e) {
      /* aşağıdaki pano yoluna düşülür */
    }
  }
  if (durumEl) {
    durumEl.textContent = "📋 Kopyalandı — Telegram'da 📜 Emirler konusuna " +
                          "yapıştır (bot her konuyu okur).";
  }
  try { emirTelegramdaAc(metin); } catch (e) { /* bonus, şart değil */ }
  return true;
}

function emirIptalMetni(kodlar) {
  return "EMİR İPTAL\nkod: " + kodlar.join(", ");
}

async function emirIptalEt(kodlar, ozet) {
  if (!kodlar || !kodlar.length) return;
  const soru = kodlar.length === 1
    ? "Bu emir iptal edilsin mi?\n\n" + (ozet || kodlar[0])
    : kodlar.length + " emrin HEPSİ iptal edilsin mi?";
  if (!window.confirm(soru + "\n\n(Metin panoya kopyalanır; Telegram'a " +
                      "yapıştırınca bot emri kuyruktan düşürür.)")) return;
  const durum = document.getElementById("emirdurum-durum");
  await emirMetniniYolla(emirIptalMetni(kodlar), durum);
  if (durum) setTimeout(function () { durum.textContent = ""; }, 9000);
}


/* =========================================================
   🤖 EMİR ASİSTANI (26.09.2026 — Öz Claude)
   ---------------------------------------------------------
   Kullanıcı: *"bu emirleri uygulamak için siteye basit bir yapay zeka
   kurabilir miyim … arkadaşlar bana sormadan oraya sorsa sadece emir nasıl
   uygulanır çözüp cevap atsa"* → karar: *"şimdilik emir asistanı olsun"*.

   KURAL TABANLI: ücretsiz, sınırsız, hesap/anahtar yok, internet gerekmez.
   ⚠️ Emir metni UYDURMAZ: yalnızca doğru FORMU açar ve cümleden anladığı
      kutuları (hesap · eşya · adet · akçe · ordu) doldurur; mesajı yine
      formun kendisi kurar (`emirMesajiKur`) — botun kuralı TEK yerde kalır.
   ⚠️ Şifre istemez, şifre yazmaz (HESAP EKLE formunda şifreyi kullanıcı girer).
   ========================================================= */
(function () {
  "use strict";

  var HARF = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u" };
  function sade(s) {
    return String(s || "").toLocaleLowerCase("tr-TR")
      .replace(/[çğıöşüâîû]/g, function (c) { return HARF[c] || c; })
      .replace(/[’`´]/g, "'")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function kacis(m) {
    return String(m == null ? "" : m).split("&").join("&amp;").split("<").join("&lt;")
      .split(">").join("&gt;").split('"').join("&quot;");
  }
  // "toyga'ya" → "toyga" · "aiegus'u" → "aiegus"
  function kelimeler(s) {
    return sade(s).split(" ").map(function (k) { return k.split("'")[0]; }).filter(Boolean);
  }

  // -------------------------------------------------------
  // NİYETLER — anahtar kelimeler SADELEŞTİRİLMİŞ yazılır (ç→c, ı→i …).
  //   Boşluklu anahtar = ifade (+3) · tek kelime = tam eşleşme (+2),
  //   4+ harfliyse kelime başı eşleşmesi (+1.5; "orduya" → "ordu").
  // -------------------------------------------------------
  var NIYETLER = [
    { id: "sat", tur: "sat", ikon: "💰", baslik: "Satış emri",
      ne: "Hesabın çantasındaki malı pazara koyar. Hesabı seçince eşya listesi kendiliğinden gelir; fiyatı \"en düşük\" bırakırsan pazardaki en ucuza iner. Malzemeye \"tüm otlar\" · \"tüm yemekler\" · \"tüm kuvvet verenler\" yazarsan o türdeki her eşya ayrı ilanla satılır; adet yerine 🔢 Tümü = çanta + evdeki hepsi.",
      anahtar: ["sat", "satis", "satsin", "satilsin", "satsın", "sattir", "pazara koy", "elden cikar", "eyalet adina sat",
                "rezle", "rezlesin", "rezerve et"] },
    { id: "al", tur: "al", ikon: "🛒", baslik: "Alım emri",
      ne: "Pazardan mal aldırır. “Azami” = TOPLAM akçe, tanesinin fiyatı DEĞİL (3500 boyayı tanesi en fazla 31'den: 3500 × 31 = 108500 yaz); bot tanesini azami ÷ adet'ten pahalıya ALMAZ. “tanesi 31 akçe” dersen toplamı ben hesaplarım. Önce 🛒 Pazar sekmesinde fiyata bakmak iyi olur.",
      anahtar: ["al", "alsin", "aldir", "alim", "satin al", "satin alsin", "topla", "ucuza al"] },
    { id: "gemi", tur: "gemi", ikon: "⛵", baslik: "Gemi alma emri",
      ne: "Satılık gemiyi aldırır. Kaptan adı ve azami fiyat ZORUNLU; hesap, geminin satıldığı limanın kasabasında olmalı.",
      anahtar: ["gemi al", "gemi satin", "gemi alsin", "satilik gemi"] },
    { id: "yanasma", tur: "yanasma", ikon: "⚓", baslik: "Yanaşma izni",
      ne: "Liman şefi hesabımız, yazdığın armatörün gemisini limana kabul eder.",
      anahtar: ["yanasma", "yanas", "limana kabul", "liman izni", "rihtim izni", "gemi kabul", "liman sefi"] },
    { id: "odenek", tur: "odenek", ikon: "📜", baslik: "Ödenek",
      ne: "Divan ödeneğini (mal listesi) kişiye dağıttırır. Kişi ve sancak seçilir, mallar satır satır eklenir.",
      anahtar: ["odenek", "odenekler", "odenek at", "odenek ver"] },
    { id: "mesaj", tur: "mesaj", ikon: "✉️", baslik: "Oyun içi mesaj",
      ne: "Hesabımızdan birine oyun içi mesaj (posta) gönderir: kimden · kime · konu · metin.",
      anahtar: ["mesaj", "mektup", "mesaj at", "mesaj gonder", "posta gonder", "posta at", "yaz ona"] },
    { id: "posta", tur: "posta", ikon: "📬", baslik: "Posta kontrol",
      ne: "Hesap oyuna girip gelen postalarına bakar; yenileri Telegram'a düşer.",
      anahtar: ["posta kontrol", "postalar", "postalari", "postasina bak", "gelen kutusu", "mesajlari kontrol", "mesaj kontrol", "mesajlarina bak"] },
    { id: "forum", tur: "forum", ikon: "📣", baslik: "Foruma cevap",
      ne: "Oyunun forumunda bir başlığa cevap yazdırır. Başlığın linki ve metin gerekir.",
      anahtar: ["forum", "foruma", "foruma yaz", "basliga cevap"] },
    { id: "divan", tur: "divan", ikon: "👑", baslik: "Divan listesi onayı",
      ne: "Hesaplar Sancak Kalesi → Divan Seçimi'nde kendi adlarının geçtiği listeyi ONAYLAR. \"İptal\"e asla basılmaz.",
      anahtar: ["divan onay", "divan listesi", "listeyi onayla", "liste onay", "divan liste"] },
    { id: "aile", tur: "aile", ikon: "👪", baslik: "Aile başvurusu kabul",
      ne: "Aile reisi olan hesap, yazdığın kişilerin aileye katılma başvurularını KABUL eder (birden çok kişi tek emirde). Reddet'e / Aileden Ayrıl'a asla basılmaz.",
      anahtar: ["aile", "aileye", "aile kabul", "aileye kabul", "aile basvuru", "aile basvurusu", "basvuru kabul",
                "basvuruyu kabul", "basvurusunu kabul", "aileye al", "aile reisi"] },
    { id: "ailebasvur", tur: "ailebasvur", ikon: "👪", baslik: "Aileye başvurma",
      ne: "Hesap aileyi TAM adıyla arar ve başvurur (akçe 0 = kutu boş). \"Aile Kur\"a asla basılmaz; hesap zaten bir ailedeyse emir iptal edilir.",
      anahtar: ["aileye basvur", "ailesine basvur", "aile basvur", "aileye basvuru", "ailesine basvuru",
                "aileye gir", "ailesine gir", "aileye katil", "ailesine katil"] },
    { id: "muayene", tur: "muayene", ikon: "🩺", baslik: "Muayenehane / eczane",
      ne: "YALNIZCA emirle: muayenehane al (250 akçe), eczanede basit iksir yap (ot + adet) ya da muayene gününe hazırlan (fiyatlar + azami). Kendiliğinden hiçbir şey yapılmaz.",
      anahtar: ["muayenehane", "muayene", "iksir", "eczane", "eczanem", "tabip", "hekim", "kendini hazirla", "iksir yap", "muayenehane al"] },
    { id: "tarlacevir", tur: "tarlacevir", ikon: "🌾🔁", baslik: "Tarla çevirme (ıslah)",
      ne: "Var olan tarlanın türünü değiştirir (Islah et, 50 akçe). Ekin hasat alınınca çevrilir; koç / manda çiftliğinde hayvan alınmaz, hayvanlar kesilip çiftlik boşalınca çevrilir.",
      anahtar: ["tarla cevir", "tarlayi cevir", "tarlasini cevir", "tarla degistir", "tarlayi degistir",
                "tarlasini degistir", "tarla turu", "tarlanin turu", "islah", "islah et", "tarlayi islah",
                "koca cevir", "mandaya cevir", "sigira cevir", "sebzeye cevir", "misira cevir",
                "bugdaya cevir", "arpaya cevir"] },
    { id: "oy", tur: "oy", ikon: "🗳️", baslik: "Oy verme",
      ne: "Belediye ya da divan seçiminde hesaplarımıza oy verdirir ya da Sancak Beyi'ni TANITIR; oylar en fazla 3 güne yayılır, oy veren hesap listeden düşer.",
      anahtar: ["oy", "oy ver", "oy verdir", "secim", "aday", "belediye secimi", "divan secimi", "reis secimi",
                "sancak beyi", "sancak beyini tani", "beyi tani", "bey tani"] },
    { id: "ordukatil", tur: "ordukatil", ikon: "🪖", baslik: "Orduya katılma",
      ne: "Hesabı orduya sokar; sonra her gün önce lideri takip eder, enerjisini (65) boya/madende harcar. Ordu adı ya da komutanı ZORUNLU.",
      anahtar: ["ordu", "orduya", "ordusuna", "orduya katil", "orduya sok", "askere", "asker yap", "ordu katil"] },
    { id: "profil", tur: "profil", ikon: "🎭", baslik: "Profil yazma",
      ne: "Hesabın oyun profiline RP/OOC metni, durum, doğum tarihi ve yaş yazar. Yalnız yaş yazarsan site gün/ay atar.",
      anahtar: ["profil", "rp", "ooc", "rp yaz", "dogum", "dogum tarihi", "yas", "karakter yasi"] },
    { id: "guven", tur: "guven", ikon: "🤝", baslik: "Güven puanı / renk",
      ne: "Bir oyuncuya güven puanı verdirir ya da renk attırır. ⚠️ İz bırakır — multi analizi tam buna bakar.",
      anahtar: ["guven", "guven puani", "guven ver", "renk", "renk at", "renk ver"] },
    { id: "hesapekle", tur: "hesapekle", ikon: "➕", baslik: "Yeni hesap ekle",
      ne: "Bota yeni bir hesap (multi) ekler: ad + şifre + takip modu. Şifreyi forma SEN yazarsın.",
      anahtar: ["hesap ekle", "yeni hesap", "multi ekle", "hesabi ekle", "yeni multi"] },
    { id: "sistem", tur: "sistem", ikon: "⚙️", baslik: "Sistem ayarları (maden · cami · kapanış · kaptan · listeler)",
      ne: "Hesaba bağlı OLMAYAN bot ayarları: maden kasabaları, öncelikli maden, ayrıcalıklı cami hesapları, 💪 kuvvet öncelikli hesaplar (kuvvet kassın + rezerve yemeği önce alsın), 📍👁️ ara nokta gözcüleri (Günlük + Gruplar ve Ordular okur, Kim Nerede'ye yazar), 🪖 alım modu gözcüleri (kasaba başına kalıcı silahlı grup — Yetki Dahilinde · 2 kişilik · dağıtılmaz), ⚗️ ot alıcıları + ot satış günü (haftada bir, o kasabadaki hesapların şifalı otu iksirciye rezerveli — ikisi birlikte gerekir), 🍞 fırıncılar (kasaba=fırıncı — o kasabadaki Et / Şişe Süt / Sebze / Somun Ekmeği ona rezerveli), 🏦 kasa hesabı (akçesi azalan hesap kasadan akçe çeker — boşken KAPALI), tur bitince uyku/kapat, yaşlı garson, gemi armatörü, kaptan rotası, molla, dost/düşman/izleme listeleri. Şu anki değerleri de gösterir.",
      anahtar: ["sistem ayar", "sistem ayari", "genel ayar", "bot ayari", "maden kasaba", "maden kasabalari",
                "maden onceligi", "oncelikli maden", "ayricalikli cami", "cami listesi", "camiye gitsin",
                "kuvvet oncelikli", "kuvvet kassin", "kuvvet kas", "kuvvet puani",
                "odun kasabasi", "odun kasabalari",
                "gozcu", "gozculer", "ara nokta gozcusu", "ara nokta gozculeri", "gordukleri",
                "alim modu", "alim gozcu", "silahli grup", "kalici grup",
                "hurda ot", "hurdada ot", "hurda yerine ot",
                "ot alici", "ot alicilari", "ot satis gunu", "iksirciye",
                "firinci", "firincilar", "firinci ata", "firinciya rezerve",
                "terzi", "terziler", "terzi ata", "giysi agi", "giysi tavani", "kiyafet agi",
                "kasa hesab", "kasadan", "otonom akce",
                "kapanis", "uyku modu", "bilgisayari kapat", "yasli garson", "dusman ekle", "dusmana ekle",
                "dost ekle", "izleme listesi", "kaptan hedef", "kaptan rota", "molla", "hangi ayar", "ayarlari gor"] },
    { id: "tasi", tur: "ayar", plan: "tasi", ikon: "🚚", baslik: "Hesabı başka şehre taşı (hazır plan)",
      ne: "Görev zinciri: her şeyi sat → yola çık → evi taşı → ev+tarla → atölye. Hedef şehri planın içinde seçersin.",
      anahtar: ["tasi", "tasin", "tasinsin", "tasima", "baska sehre", "sehir degistir", "kasaba degistir", "yerlesim", "goc"] },
    { id: "odun", tur: "ayar", plan: "odun", ikon: "🌲", baslik: "Odunu başka şehre taşı (hazır plan)",
      ne: "Oduncu hesap evdeki odunu çantaya yükler (ağırlığa göre), hedef şehre gider, alıcıya rezerveli satar + alıcıya alım emri; alıcı alınca döner (görev zinciri).",
      anahtar: ["odun tasi", "odun tasima", "odunu tasi", "odun goturu", "odun gotursun", "odunu glasgow",
                "odun sat", "tomruk"] },
    { id: "gitaldon", tur: "ayar", plan: "gitaldon", ikon: "🧭", baslik: "Git, al, dön (hazır plan)",
      ne: "Hesap başka şehre gidip mal alır ve geri döner (görev zinciri).",
      anahtar: ["git al don", "gidip al", "getir", "baska sehirden al", "mal getir"] },
    { id: "kita", tur: "ayar", plan: "kita", ikon: "⛵", baslik: "Kıta şehrine git (hazır plan)",
      ne: "Limana yürür → gemiye biner → bekler → karada yürür (görev zinciri).",
      anahtar: ["kita", "kitaya", "gemiye bin", "denizden git"] },
    { id: "evkur", tur: "ayar", plan: "evkur", ikon: "🏠", baslik: "Ev + tarla + atölye kur (hazır plan)",
      ne: "Evsiz hesap bulunduğu şehirde ev, tarla ve atölye kurar.",
      anahtar: ["ev al", "ev kur", "evkur", "tarla al", "atolye al", "atolye kur", "evsiz"] },
    // 🎛️👥 [19.10.2026 — FABLE_GOREV_2026-10-18 İŞ 15 + İŞ 16]
    { id: "hesapplani", tur: "ayar", ikon: "🎛️", baslik: "Hesap planı (yemek · iş sırası · cami parası · satış …)",
      ne: "Hesap hesap öncelik: tarla 1 → ases 2 → iş sırası (atölye · odun · ot · demir · maden · cami · eaü · ders · yok — ilk verilebilen kazanır; 🌿 ot = şifalı ot toplama, süre maden gibi, ot satılmaz evde birikir). Yemek (kuvvet/zeka/karizma/basic/yok), meyhane, yol yemeği, tarla (kendisi/işçi/besle), kalan enerji, cami parası, satış kapalı. Boş bırakılan = bugünkü düzen. 🖥️ Ayar formunun altındaki “🎛️ Hesap planı” bölümü.",
      anahtar: ["hesap plani", "plan ver", "planini", "oncelikleri", "is sirasi", "is onceligi", "basic yesin", "yemek yemesin",
                "cami parasi", "kalan enerji", "satis kapali", "satmasin", "yol yemegi", "erzak almasin",
                "tarla isci", "sadece besle", "kuvvet yesin", "zeka yesin", "karizma yesin",
                "ot topla", "sifali ot", "ot toplasin", "bitki topla"] },
    { id: "toplu", tur: "ayar", ikon: "👥", baslik: "Toplu emir (bir kasabadaki / moddaki hesapların hepsine)",
      ne: "Hesap kutusuna ad yerine seçici yaz: kasaba: Ardencaple · bölge: kuzey · mod: Hızlı Cami · meslek: Bahçıvan · liste: gözcüler · hariç: Thebear (noktalı virgülle birleştir). Satış/alım, posta, orduya katıl, oy ve divan onayı emirlerinde de çalışır; bot onayda tam listeyi + sayıyı yazar. Toplu seyahatte “📅 Güne yay”ı seç.",
      anahtar: ["toplu", "toplu emir", "hepsine", "butun hesaplar", "tum hesaplar", "kasabadaki hesaplar",
                "kuzeydeki", "guneydeki", "secici", "hesap listesi", "haric tut", "gune yay"] },
    { id: "sifirla", tur: "ayar", ikon: "🧹", baslik: "Sıfırla (görev zinciri + seyahat + bekleyen işler)",
      ne: "Hesabın görev zincirini (ilerlemesi dahil), seyahatini ve bekleyen tek seferlik işlerini (ev kurulumu · ev taşıma · her şeyi sat · atölye) siler; yeni emir gelmezse hesap OLDUĞU YERDE kendi moduyla devam eder. Takip modu ve hesap planı KORUNUR (takibi kapatmak için aynı emre “takip: Yok”). 🖥️ Ayar formunda “🧹 Sıfırla” kutusu.",
      anahtar: ["sifirla", "sıfırla", "sifirlansin", "emirden vazgec", "vazgec", "emri sil", "gorevi sifirla",
                "zinciri sifirla", "temiz sayfa", "bastan basla", "takili kaldi", "asili kaldi"] },
    { id: "teshis", tur: "ayar", ikon: "🩺", baslik: "Teşhis (hızlı moddaki hesap: evi · tarlası · kıyafeti)",
      ne: "Hızlı moddaki hesap ERTESİ girişinde ÖNCE (iş vermeden) evi var mı / hangi kasabada (🏠 İkametgah), tarlası/çiftliği, kılıç-kalkan-kıyafeti ve envanterini okuyup rapora yazar, ARDINDAN aynı girişte hızlı turunu da yapar; bitince emir kendiliğinden kapanır. Kim teşhis edildi / kimin evi bilinmiyor: 📍 Kim Nerede → “🩺 Hesap durumu”. Hızlı modda olmayan hesap bunları her gün zaten okuyor. 🖥️ Ayar formunda “🩺 Teşhis” kutusu; toplu da verilebilir.",
      anahtar: ["teshis", "teşhis", "teshis et", "evi var mi", "evi nerede", "ikametgah", "arsasi var mi",
                "tarlasi var mi", "hizli mod teshis", "ne giyiyor", "giysileri", "kiyafetleri ne"] },
    { id: "oyhazirla", tur: "ayar", ikon: "🗳️", baslik: "Oy hakkı hazırla (ev al / evi taşı + oy yetenekleri)",
      ne: "Hesap sonraki girişlerinde BULUNDUĞU kasabada oy vermeye hazırlanır: evi yoksa ev alır (yalnızca ev, tarla yok — en az 90 akçe), evi başka kasabadaysa evini taşır (yalnızca ev sandığı BOŞSA — taşınınca sandık silinir), Siyaset'te yalnızca oy yeteneklerini açar (Vatandaş → Kasaba Seçmeni; aday olma yetenekleri ve %66 YOK). Ev o kasabada + Kasaba Seçmeni tamam olunca emir kendiliğinden kapanır; ev alınamaz / taşınamazsa Telegram'a bir kez yazar. Yoldayken / seyahat emri sürerken / Grup Takip'teyken bekler. Ordu hesabında yapılmaz, adaylık KOYMAZ. 🖥️ Ayar formunda “🗳️ Oy hakkı hazırla”; toplu da verilebilir.",
      anahtar: ["oy hakki", "oy hakki hazirla", "oy hazirla", "oy veremiyor", "oy veremez", "secmen",
                "vatandas yetenegi", "siyaset ac", "siyaset agaci", "oy icin ev", "kasaba secmeni",
                "oy icin evi tasi", "oy yetenekleri"] },
    { id: "ayar", tur: "ayar", ikon: "🖥️", baslik: "Hesap ayarı / görev zinciri",
      ne: "Launcher'daki her ayar: takip modu, inziva, ders, gemi, kaptan, ases, puan, seyahat (📍 ara nokta da: #759 / 'Kirkcudbright - Wigtown arası' / kare '94 117'), görev zinciri, 🌲 orman işi (odun kes). Yalnızca DOKUNDUĞUN ayar gönderilir, gerisi değişmez.",
      anahtar: ["ayar", "inziva", "inzivaya", "ders", "ders ver", "hoca", "ases", "kaptan", "takip modu", "hizli maden", "hizli cami", "cami", "maden", "seyahat", "gorev", "gorev zinciri", "zincir", "puan", "isci tut", "grup lideri", "mod degistir", "odun kes", "odun kessin", "oduncu", "orman", "orman isi", "ara nokta", "ara noktaya", "noktaya gonder", "giysi al", "giysi alsin", "kiyafet al", "eksik giysi",
                // 🧭 [26.10.2026 — İŞ 32] Kurulum + Düzen (Ayar formunun 2. bölümü)
                "kurulum", "kalici duzen", "duzen kur", "aksi emre kadar", "meslek sec"] },
    { id: "durum", sekme: "#emirdurum", ikon: "📊", baslik: "Verdiğim emir ne oldu? / geri al",
      ne: "Emir Durumu sekmesi: bekleyenler üstte, kapananlar altta. Yanlış emri satırdaki 🚫 İptal ile geri alırsın.",
      anahtar: ["emir ne oldu", "emrim", "emirlerim", "emir durumu", "iptal", "geri al", "yanlis emir", "bekleyen emir"] },
    { id: "konu", bilgi: "konu", ikon: "📌", baslik: "Emri Telegram'da hangi konuya yapıştırayım?",
      ne: "",
      anahtar: ["hangi konu", "nereye yapistir", "hangi baslik", "telegram konu", "nereye yaz", "konuya"] },
    { id: "zaman", bilgi: "zaman", ikon: "⏱️", baslik: "Emir ne zaman uygulanır?",
      ne: "Bot her tur hesapları sırayla gezer. ⚡ \"Hemen yap\" tikliyse o hesaba SIRADAKİ hesap olarak girer; tiksizse hesabın kendi sırasında, sırası geçtiyse ertesi turda. AYAR emirlerinde \"hemen\" yoktur. Sonuç Telegram'da emrin konusuna ve 📊 Emir Durumu'na düşer.",
      anahtar: ["ne zaman", "ne zaman uygulan", "hemen", "kac dakika", "ne kadar surer", "bekliyor"] },
    { id: "fiyat", sekme: "#pazar", ikon: "🏷️", baslik: "Pazarda fiyat bakmak",
      ne: "🛒 Pazar sekmesi: 7 kasabanın ilanları, en ucuz fiyat.",
      anahtar: ["fiyat", "en ucuz", "kac akce", "pazar fiyat"] },
    { id: "nerede", sekme: "#sakinler", ikon: "📍", baslik: "Kim nerede?",
      ne: "📍 Kim Nerede sekmesi: 7 kasabanın bugünkü tam listesi.",
      anahtar: ["nerede", "kim nerede", "hangi kasabada", "bul"] }
  ];

  // Telegram konuları — emir.js'in EMIR_KONULARI ile AYNI kaynak.
  function konuOf(tur) {
    try { return (typeof emirKonusu === "function") ? emirKonusu(tur) : "📜 Emirler"; }
    catch (e) { return "📜 Emirler"; }
  }

  // -------------------------------------------------------
  // VARLIKLAR — hesap · eşya · adet · akçe · ordu
  // -------------------------------------------------------
  function hesapAdlari() {
    try { return (emirEnvanter || []).map(function (k) { return k.karakter; }).filter(Boolean); }
    catch (e) { return []; }
  }
  function esyaAdlari() {
    var set = {};
    try { (pazarVerisi || []).forEach(function (u) { if (u && u.isim) set[u.isim] = 1; }); } catch (e) {}
    try {
      (emirEnvanter || []).forEach(function (k) {
        (k.esyalar || []).forEach(function (x) { if (x && x.isim) set[x.isim] = 1; });
      });
    } catch (e) {}
    return Object.keys(set);
  }

  // 🧾🔢 [21.10.2026 — İŞ 24/25] "tüm otlarını sat" → malzeme "tüm otlar";
  //    "hepsini / tümünü / tamamını" → 🔢 Tümü. Kategori adları SAT_KATEGORILERI ile aynı.
  function kategoriBul(kel) {
    var hepsi = kel.some(function (k) {
      return /^(tum|butun|hepsi|tamami)/.test(k);
    });
    if (!hepsi) return "";
    var var_ = function (re) { return kel.some(function (k) { return re.test(k); }); };
    var veren = var_(/^(veren|arttiran|artiran)/);
    if (veren && var_(/^(kuvvet|guc)/)) return "tüm kuvvet verenler";
    if (veren && var_(/^zeka/)) return "tüm zeka verenler";
    if (veren && var_(/^karizma/)) return "tüm karizma verenler";
    if (var_(/^(otlar|otu$|otun|ot$|sifali)/)) return "tüm otlar";
    if (var_(/^(yemek|yiyecek)/)) return "tüm yemekler";
    return "";
  }

  function varliklariBul(metin) {
    var sonuc = { hesaplar: [], esya: "", adet: "", akce: "", ordu: "" };
    var kel = kelimeler(metin);
    var sd = " " + kel.join(" ") + " ";
    sonuc.kategori = kategoriBul(kel);
    sonuc.tumu = kel.some(function (k) { return /^(tumu|hepsi|tamami)/.test(k); });
    // Hesaplar: tam kelime ya da "toygaya" gibi ekli hâl (en fazla 4 harf ek).
    hesapAdlari().forEach(function (ad) {
      var a = sade(ad);
      if (!a || a.length < 3) return;
      var bulundu = kel.some(function (k) {
        return k === a || (k.indexOf(a) === 0 && k.length - a.length <= 4);
      });
      if (bulundu && sonuc.hesaplar.indexOf(ad) < 0) sonuc.hesaplar.push(ad);
    });
    // Eşya: en UZUN eşleşen ad ("Çuval Mısır", "Mısır"dan önce).
    var enIyi = "";
    esyaAdlari().forEach(function (ad) {
      var a = sade(ad);
      if (a.length < 3) return;
      if (sd.indexOf(" " + a + " ") >= 0 || sd.indexOf(" " + a) >= 0 && a.length >= 5) {
        if (a.length > sade(enIyi).length) enIyi = ad;
      }
    });
    sonuc.esya = enIyi;
    // Akçe: "20 akçe" · "azami 18,5 akce". ⚠️ Alım formundaki kutu TOPLAM
    //    akçedir; "20 akçe" çoğu zaman BİRİM fiyattır. Belirsizse kutu
    //    DOLDURULMAZ (50 deri için 20 akçe bütçe = hiçbir şey alınmaz).
    var ham = String(metin || "");
    var mAkce = ham.match(/(\d+(?:[.,]\d+)?)\s*(ak[çc]e)/i);
    if (mAkce) sonuc.akce = mAkce[1].replace(",", ".");
    sonuc.akceTuru = "";
    if (mAkce) {
      if (/toplam|b[üu]t[çc]e|en fazla toplam/i.test(ham)) sonuc.akceTuru = "toplam";
      else if (/tanesi|tane ba[şs][ıi]|birim|adedi|ak[çc]eden|ak[çc]elik/i.test(ham)) sonuc.akceTuru = "birim";
    }
    // Adet: akçe OLMAYAN ilk sayı
    var sayilar = ham.match(/\d+(?:[.,]\d+)?(\s*ak[çc]e)?/gi) || [];
    for (var i = 0; i < sayilar.length; i++) {
      if (!/ak[çc]e/i.test(sayilar[i])) { sonuc.adet = sayilar[i].replace(/[^\d]/g, ""); break; }
    }
    // Ordu: "X ordusuna" · "X ordusu"
    var mOrdu = ham.match(/([A-Za-zÇĞİÖŞÜçğıöşü0-9_.\-]+)\s+ordu(su|suna|sunun|sunda)\b/i);
    if (mOrdu && !/^(bir|bu|o|şu|su)$/i.test(mOrdu[1])) sonuc.ordu = mOrdu[1];
    return sonuc;
  }

  // -------------------------------------------------------
  // PUANLAMA
  // -------------------------------------------------------
  // İfade eşleşmesi Türkçe eklere dayanıklı: "mesajlari kontrol" ifadesi
  // "mesajlarini kontrol et"i de tutar (her kelime ardışık kelimenin BAŞI).
  // 3 harften kısa kelime (al, oy) yalnızca TAM eşleşir.
  function ifadeVar(kel, ifade) {
    var p = ifade.split(" ");
    for (var i = 0; i + p.length <= kel.length; i++) {
      var tamam = true;
      for (var j = 0; j < p.length; j++) {
        var k = kel[i + j], w = p[j];
        if (!(k === w || (w.length >= 3 && k.indexOf(w) === 0))) { tamam = false; break; }
      }
      if (tamam) return true;
    }
    return false;
  }

  function puanla(metin) {
    var kel = kelimeler(metin);
    if (!kel.length) return [];
    var sonuc = [];
    NIYETLER.forEach(function (n) {
      var p = 0;
      n.anahtar.forEach(function (a) {
        a = sade(a);
        if (a.indexOf(" ") >= 0) {
          if (ifadeVar(kel, a)) p += 3;
        } else if (kel.indexOf(a) >= 0) {
          p += 2;
        } else if (a.length >= 4 && kel.some(function (k) { return k.indexOf(a) === 0; })) {
          p += 1.5;
        }
      });
      if (p > 0) sonuc.push({ n: n, p: p });
    });
    sonuc.sort(function (x, y) { return y.p - x.p; });
    return sonuc;
  }

  // -------------------------------------------------------
  // FORMU AÇ + DOLDUR
  // -------------------------------------------------------
  function yaz(id, deger) {
    var el = document.getElementById(id);
    if (!el || deger === "" || deger == null) return false;
    el.value = deger;
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {}
    return true;
  }
  var HESAP_KUTUSU = {
    sat: "sat-hesap", al: "al-hesap", gemi: "gm-hesap", posta: "po-hesap", forum: "fr-hesap",
    yanasma: "ya-hesap", profil: "pr-hesap", guven: "gv-hesap", ayar: "ay-hesap", mesaj: "ms-kimden",
    aile: "ak-hesap"
  };
  var COKLU_HESAP_KUTUSU = { divan: "dv-hesaplar", ordukatil: "ok-hesaplar", oy: "oy-hesaplar",
                             ailebasvur: "ab-hesaplar", muayene: "mu-hesaplar",
                             tarlacevir: "tc-hesaplar" };

  function ac(n, v) {
    if (n.sekme) { location.hash = n.sekme; return; }
    if (!n.tur) return;
    var hedef = "#emir/" + n.tur + (n.plan ? "/" + n.plan : "");
    if (location.hash !== hedef) {
      location.hash = hedef;
    } else {
      var tb = document.querySelector('.emir-tur-btn[data-tur="' + n.tur + '"]');
      if (tb) tb.click();
    }
    v = v || {};
    setTimeout(function () {
      var h = v.hesaplar || [];
      if (COKLU_HESAP_KUTUSU[n.tur] && h.length) yaz(COKLU_HESAP_KUTUSU[n.tur], h.join("\n"));
      else if (HESAP_KUTUSU[n.tur] && h.length) yaz(HESAP_KUTUSU[n.tur], h[0]);
      if (n.tur === "mesaj" && h.length > 1) yaz("ms-kime", h[1]);
      if (n.tur === "ordukatil" && v.ordu) yaz("ok-ordu", v.ordu);
      // Eşya listesi hesaba göre dolduğu için eşya/adet biraz SONRA yazılır.
      setTimeout(function () {
        if (n.tur === "sat") {
          yaz("sat-mal", v.kategori || v.esya);
          // 🔢 "hepsini sat" → Tümü tiki (adet kutusu kapanır); yoksa sayı yazılır.
          var tk = document.getElementById("sat-tumu");
          if (v.tumu && tk && !tk.checked) {
            tk.checked = true;
            try { tk.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
          } else if (!v.tumu) {
            yaz("sat-adet", v.adet);
          }
        }
        if (n.tur === "al") {
          yaz("al-mal", v.esya); yaz("al-adet", v.adet);
          if (v.akceTuru === "toplam") yaz("al-azami", v.akce);
          else if (v.akceTuru === "birim" && v.adet) {
            yaz("al-azami", String(Math.round(parseFloat(v.akce) * parseInt(v.adet, 10) * 100) / 100));
          }
        }
        if (n.tur === "gemi") yaz("gm-azami", v.akce);
        var form = document.getElementById("emir-form-" + n.tur);
        if (form) { try { form.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
      }, 350);
    }, 120);
  }

  // -------------------------------------------------------
  // ÇİZİM
  // -------------------------------------------------------
  function konuTablosu() {
    var satirlar = [
      ["💰 Satış · 🛒 Alım", "🛒 Pazar"], ["⛵ Gemi Al · ⚓ Yanaşma", "⚓ Deniz"],
      ["🪖 Orduya katıl", "⚔️ Ordular"], ["🖥️ Ayar & görev zinciri · ➕ Hesap ekle", "⚙️ Ayar Emirleri"],
      ["📜 Ödenek", "💰 Ödenekler"], ["✉️ Mesaj", "✉️ Mesajlar"],
      ["🎭 Profil · 🤝 Güven · 🗳️ Oy · 📣 Forum · 👑 Divan onay · 👪 Aile kabul · 📬 Posta", "📜 Emirler"]
    ];
    return '<table class="asistan-konu-tablo"><tbody>' + satirlar.map(function (s) {
      return "<tr><td>" + s[0] + "</td><td><b>" + s[1] + "</b></td></tr>";
    }).join("") + "</tbody></table>" +
      '<p class="emir-kucuk">Bot her konuyu okur — yanlış konuya yapıştırsan da emir işlenir; ' +
      'konu yalnızca düzen için. Botun onayı da aynı konuya gelir.</p>';
  }

  function anladiklari(n, v) {
    var parca = [];
    var h = v.hesaplar || [];
    if (h.length && (HESAP_KUTUSU[n.tur] || COKLU_HESAP_KUTUSU[n.tur])) {
      parca.push("👤 " + h.map(kacis).join(", "));
    }
    if (v.esya && (n.tur === "sat" || n.tur === "al")) parca.push("📦 " + kacis(v.esya));
    if (v.adet && (n.tur === "sat" || n.tur === "al")) parca.push("🔢 " + kacis(v.adet) + " adet");
    if (v.akce && n.tur === "gemi") parca.push("💰 azami " + kacis(v.akce) + " akçe");
    if (v.akce && n.tur === "al") {
      if (v.akceTuru === "toplam") parca.push("💰 toplam en fazla " + kacis(v.akce) + " akçe");
      else if (v.akceTuru === "birim" && v.adet) parca.push("💰 tanesi " + kacis(v.akce) + " → toplam " +
        kacis(Math.round(parseFloat(v.akce) * parseInt(v.adet, 10) * 100) / 100) + " akçe");
      else parca.push("💰 " + kacis(v.akce) + " akçe — <b>tanesi mi toplam mı?</b> Azami TOPLAM kutusuna sen yaz " +
        "(ya da 🔢 pazara göre hesapla)");
    }
    if (v.ordu && n.tur === "ordukatil") parca.push("🪖 " + kacis(v.ordu));
    return parca;
  }

  function kartHtml(n, v, i) {
    var parca = anladiklari(n, v);
    var govde = n.bilgi === "konu" ? konuTablosu() : '<p class="asistan-ne">' + kacis(n.ne) + "</p>";
    var alt = "";
    if (n.tur) {
      alt += '<span class="asistan-rozet" title="Telegram\'da yapıştırılacak konu">📌 ' +
             kacis(konuOf(n.tur)) + "</span>";
    }
    if (parca.length) {
      alt += '<span class="asistan-anladim">Anladığım: ' + parca.join(" · ") + "</span>";
    }
    var dugme = "";
    if (n.tur) {
      dugme = '<button type="button" class="asistan-ac" data-i="' + i + '">' +
              (parca.length ? "✍️ Formu doldurarak aç" : "➡️ Formu aç") + "</button>";
    } else if (n.sekme) {
      dugme = '<button type="button" class="asistan-ac" data-i="' + i + '">➡️ Aç</button>';
    }
    return '<div class="asistan-kart' + (i === 0 ? " asistan-ilk" : "") + '">' +
      '<div class="asistan-kart-bas"><span class="asistan-ikon">' + n.ikon + "</span><b>" +
      kacis(n.baslik) + "</b></div>" + govde +
      (alt ? '<div class="asistan-alt">' + alt + "</div>" : "") +
      (dugme ? '<div class="asistan-dugmeler">' + dugme + "</div>" : "") + "</div>";
  }

  var ORNEKLER = [
    "toyga 50 deri alsın",
    "aiegus'u orduya sok",
    "hesabı başka şehre taşı",
    "inzivaya koy",
    "divan listesini onayla",
    "emri hangi konuya yapıştırayım?"
  ];

  function kur(girisId, cikisId, ornekId) {
    var giris = document.getElementById(girisId);
    var cikis = document.getElementById(cikisId);
    if (!giris || !cikis) return;
    var sonSonuc = [];
    var sonVarlik = {};
    var zaman = null;

    function ciz() {
      var metin = giris.value;
      if (!sade(metin)) { cikis.hidden = true; cikis.innerHTML = ""; sonSonuc = []; return; }
      var bulunan = puanla(metin).slice(0, 3);
      sonVarlik = varliklariBul(metin);
      sonSonuc = bulunan.map(function (x) { return x.n; });
      cikis.hidden = false;
      if (!bulunan.length) {
        cikis.innerHTML = '<div class="asistan-kart"><p class="asistan-ne">🤔 Bunu anlayamadım. ' +
          'Başka kelimelerle dene (örn. <i>"toyga 50 deri alsın"</i>) ya da aşağıdan emir türünü seç. ' +
          'Hâlâ bulamazsan <a href="#rehber" class="bas-link">📖 Rehber</a>.</p>' +
          '<div class="asistan-hepsi">' + NIYETLER.filter(function (n) { return n.tur && !n.plan; })
            .map(function (n) {
              return '<button type="button" class="asistan-cip" data-id="' + n.id + '">' + n.ikon + " " +
                     kacis(n.baslik) + "</button>";
            }).join("") + "</div></div>";
        return;
      }
      cikis.innerHTML = sonSonuc.map(function (n, i) { return kartHtml(n, sonVarlik, i); }).join("");
    }

    giris.addEventListener("input", function () { clearTimeout(zaman); zaman = setTimeout(ciz, 140); });
    giris.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        ciz();
        if (sonSonuc[0] && (sonSonuc[0].tur || sonSonuc[0].sekme)) ac(sonSonuc[0], sonVarlik);
      }
    });
    cikis.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".asistan-ac") : null;
      if (b) { var n = sonSonuc[+b.getAttribute("data-i")]; if (n) ac(n, sonVarlik); return; }
      var c = e.target.closest ? e.target.closest(".asistan-cip") : null;
      if (c) {
        var id = c.getAttribute("data-id");
        NIYETLER.forEach(function (n) { if (n.id === id) ac(n, sonVarlik); });
      }
    });
    var ornek = ornekId && document.getElementById(ornekId);
    if (ornek) {
      ornek.innerHTML = ORNEKLER.map(function (o) {
        return '<button type="button" class="asistan-ornek">' + kacis(o) + "</button>";
      }).join("");
      ornek.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest(".asistan-ornek") : null;
        if (!b) return;
        giris.value = b.textContent;
        ciz();
        try { giris.focus(); } catch (er) {}
      });
    }
  }

  // Testler/konsol için dışarı açılan saf yardımcılar.
  window.emirAsistani = { puanla: puanla, varliklariBul: varliklariBul, sade: sade, NIYETLER: NIYETLER };

  function baslat() {
    kur("asistan-soru", "asistan-cevap", "asistan-ornekler");
    kur("asistan-soru-bas", "asistan-cevap-bas", "asistan-ornekler-bas");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", baslat);
  else baslat();
})();

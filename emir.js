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
  if (!k) {
    dl.innerHTML = "";
    bilgi.textContent = "Hesabı seçince o karakterin eşyaları burada listelenir.";
    return;
  }
  var esyalar = (k.esyalar || []).filter(function (x) {
    return x.isim && x.isim.indexOf("Akçe") === -1;
  });
  esyalar.sort(function (a, b) { return (b.adet || 0) - (a.adet || 0); });
  dl.innerHTML = esyalar.map(function (x) {
    return emirSecenek(x.isim, x.adet + " adet");
  }).join("");
  bilgi.textContent = k.karakter + " — " + k.kasaba + " · " + esyalar.length +
    " çeşit eşya · cebinde " + emirSayiYaz(k.akce || 0) + " akçe";
}

function emirSatisMalBilgi() {
  var k = emirKarakterBul(emirDeger("sat-hesap"));
  var mal = emirDeger("sat-mal");
  var bilgi = document.getElementById("sat-bilgi");
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
    var eksik = [];
    if (!hesap) eksik.push("satacak hesap");
    if (!mal) eksik.push("malzeme");
    if (!adet) eksik.push("adet");
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
      "adet: " + Math.round(adet),
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

  // ---------------- 🗳️ OY VER (26.09.2026) ----------------
  // ⚠️ Şablon `oy_modul.emri_coz` ile BİREBİR aynı olmalı: başlık +
  //    "seçim:" + (belediye → "kasaba:" · divan → "sancak:") + "aday:"/"liste:"
  //    + "gün:" + isteğe bağlı her hesap ayrı "hesap:" satırı.
  if (emirTur === "oy") {
    var oySecim = emirDeger("oy-secim") === "divan" ? "divan" : "belediye";
    var oyYer = emirDeger("oy-yer");
    var oyAday = emirDeger("oy-aday");
    var oyEksik = [];
    if (!oyYer) oyEksik.push(oySecim === "divan" ? "sancak" : "kasaba");
    if (!oyAday) oyEksik.push(oySecim === "divan" ? "liste adı" : "aday");
    if (oyEksik.length) return { hata: "Eksik: " + oyEksik.join(", ") };
    var oyGun = parseInt(emirDeger("oy-gun"), 10);
    if (!(oyGun >= 1 && oyGun <= 3)) oyGun = 3;
    var oySatir = ["OY VER", "seçim: " + oySecim,
                   (oySecim === "divan" ? "sancak: " : "kasaba: ") + oyYer,
                   (oySecim === "divan" ? "liste: " : "aday: ") + oyAday,
                   "gün: " + oyGun];
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
  ayar: "⚙️ Ayar Emirleri", hesapekle: "⚙️ Ayar Emirleri",
  odenek: "💰 Ödenekler",
  mesaj: "✉️ Mesajlar"
  // geri kalan her şey (profil, güven, oy, forum, divan onay, posta) → 📜 Emirler
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
  ["gemiye_bin", "⛵ Gemiye bin"],
  ["karaya_cik", "🏝️ Karaya çık (gemiden in)"],
  ["satin_al", "🛒 Pazardan al"],
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
var AY_DEGERSIZ = ["grup_kur", "grup_dagit", "karaya_cik",
                   "ev_tasi", "ev_tasi_zorla"];

/* Takip modu seçenekleri (launcher'daki listeyle aynı). */
var AY_TAKIP_MODLARI = ["Yok", "Grup Takip", "Ordu Takip", "Alışverişçi",
                        "Hızlı Maden", "Hızlı Cami"];

var ayGorevSayac = 0;

function ayTirnak(m) {
  return String.fromCharCode(34) + m + String.fromCharCode(34);
}

/* Kasaba listesi: harita_render.json (sitede zaten var). */
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
      dl.innerHTML = adlar.map(function (a) {
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
    adet.disabled = (t !== "satin_al");
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
    } else if (t === "hersey_sat" || t === "gruba_katil") {
      hedef.setAttribute("list", "emir-hesap-listesi");
      hedef.placeholder = (t === "hersey_sat" ? "alıcı hesap" : "grup lideri");
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

/* Emir metnini kurar — `emirMesajiKur` buradan çağırır. */
function ayMesajiKur() {
  var hesap = emirDeger("ay-hesap");
  if (!hesap) return { hata: "Eksik: hangi hesap" };

  var satirlar = ["AYAR", "hesap: " + hesap];
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
   "ay-ders-verme", "ay-isci"
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", emirGuncelle);
      el.addEventListener("change", emirGuncelle);
    }
  });
}

emirOlaylariBagla();
ayKur();
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
      ne: "Hesabın çantasındaki malı pazara koyar. Hesabı seçince eşya listesi kendiliğinden gelir; fiyatı \"en düşük\" bırakırsan pazardaki en ucuza iner.",
      anahtar: ["sat", "satis", "satsin", "satilsin", "satsın", "sattir", "pazara koy", "elden cikar", "eyalet adina sat"] },
    { id: "al", tur: "al", ikon: "🛒", baslik: "Alım emri",
      ne: "Pazardan mal aldırır. Azami fiyatı yazarsan bot daha pahalıya ALMAZ. Önce 🛒 Pazar sekmesinde fiyata bakmak iyi olur.",
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
    { id: "oy", tur: "oy", ikon: "🗳️", baslik: "Oy verme",
      ne: "Belediye ya da divan seçiminde hesaplarımıza oy verdirir; oylar en fazla 3 güne yayılır, oy veren hesap listeden düşer.",
      anahtar: ["oy", "oy ver", "oy verdir", "secim", "aday", "belediye secimi", "divan secimi", "reis secimi"] },
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
    { id: "tasi", tur: "ayar", plan: "tasi", ikon: "🚚", baslik: "Hesabı başka şehre taşı (hazır plan)",
      ne: "Görev zinciri: her şeyi sat → yola çık → evi taşı → ev+tarla → atölye. Hedef şehri planın içinde seçersin.",
      anahtar: ["tasi", "tasin", "tasinsin", "tasima", "baska sehre", "sehir degistir", "kasaba degistir", "yerlesim", "goc"] },
    { id: "gitaldon", tur: "ayar", plan: "gitaldon", ikon: "🧭", baslik: "Git, al, dön (hazır plan)",
      ne: "Hesap başka şehre gidip mal alır ve geri döner (görev zinciri).",
      anahtar: ["git al don", "gidip al", "getir", "baska sehirden al", "mal getir"] },
    { id: "kita", tur: "ayar", plan: "kita", ikon: "⛵", baslik: "Kıta şehrine git (hazır plan)",
      ne: "Limana yürür → gemiye biner → bekler → karada yürür (görev zinciri).",
      anahtar: ["kita", "kitaya", "gemiye bin", "denizden git"] },
    { id: "evkur", tur: "ayar", plan: "evkur", ikon: "🏠", baslik: "Ev + tarla + atölye kur (hazır plan)",
      ne: "Evsiz hesap bulunduğu şehirde ev, tarla ve atölye kurar.",
      anahtar: ["ev al", "ev kur", "evkur", "tarla al", "atolye al", "atolye kur", "evsiz"] },
    { id: "ayar", tur: "ayar", ikon: "🖥️", baslik: "Hesap ayarı / görev zinciri",
      ne: "Launcher'daki her ayar: takip modu, inziva, ders, gemi, kaptan, ases, puan, seyahat, görev zinciri. Yalnızca DOKUNDUĞUN ayar gönderilir, gerisi değişmez.",
      anahtar: ["ayar", "inziva", "inzivaya", "ders", "ders ver", "hoca", "ases", "kaptan", "takip modu", "hizli maden", "hizli cami", "cami", "maden", "seyahat", "gorev", "gorev zinciri", "zincir", "puan", "isci tut", "grup lideri", "mod degistir"] },
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

  function varliklariBul(metin) {
    var sonuc = { hesaplar: [], esya: "", adet: "", akce: "", ordu: "" };
    var kel = kelimeler(metin);
    var sd = " " + kel.join(" ") + " ";
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
    yanasma: "ya-hesap", profil: "pr-hesap", guven: "gv-hesap", ayar: "ay-hesap", mesaj: "ms-kimden"
  };
  var COKLU_HESAP_KUTUSU = { divan: "dv-hesaplar", ordukatil: "ok-hesaplar", oy: "oy-hesaplar" };

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
        if (n.tur === "sat") { yaz("sat-mal", v.esya); yaz("sat-adet", v.adet); }
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
      ["🎭 Profil · 🤝 Güven · 🗳️ Oy · 📣 Forum · 👑 Divan onay · 📬 Posta", "📜 Emirler"]
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

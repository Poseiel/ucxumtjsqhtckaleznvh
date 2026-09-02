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
      fetch("sancak.json?_=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]);
    emirEnvanter = (sonuclar[0] && sonuclar[0].karakterler) || [];
    emirPazar = (sonuclar[1] && sonuclar[1].urunler) || [];
    emirSancaklar = (sonuclar[2] && sonuclar[2].sancaklar) || [];
  } catch (hata) {
    console.error("Emir verisi yüklenemedi", hata);
  }
  emirHesaplariDoldur();
  emirPazarListesiDoldur();
  emirSancakDoldur();
  emirOdenekSatirEkle();
  emirDipnotYaz();
  emirGuncelle();
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

function emirPazarListesiDoldur() {
  var dl = document.getElementById("al-mal-listesi");
  if (!dl) return;
  var liste = Array.from(emirPazarOzet().values());
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
    return {
      metin: [
        "alacak: " + ahesap,
        "malzeme: " + amal,
        "adet: " + Math.round(aadet),
        "azami: " + emirSayiYaz(azami)
      ].join(EMIR_NL)
    };
  }

  // ---------------- ✉️ MESAJ ----------------
  // Kullanıcı isteği (29.08.2026): sitedeki Filo listesinden bir geminin
  // sahibine oyun içi mesaj yollamak. Filo sekmesindeki "Mesaj at" düğmesi
  // bu formu doldurup buraya getiriyor.
  // ⚠️ Şablon `divan_modul.yeni_mesaj_coz` ile BİREBİR aynı olmalı —
  //    birini değiştirirsen diğerini de değiştir.
  // 🖥️ AYAR EMRİ — launcher'ın site karşılığı.
  if (emirTur === "ayar") return ayMesajiKur();

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
    msatir.push(mMetin);
    return { metin: msatir.join(EMIR_NL) };
  }

  var kisi = emirDeger("od-kisi");
  var mallar = emirOdenekSatirlari();
  if (!kisi) return { hata: "Eksik: ödenek atılacak kişi" };
  if (!mallar.length) return { hata: "Eksik: en az bir mal satırı (mal + fiyat + adet)" };
  var osatirlar = ["Ödenek atılacak kişi: " + kisi];
  var toplam = 0;
  mallar.forEach(function (m) {
    osatirlar.push("Verilecek mal: " + m.mal);
    osatirlar.push("Fiyat: " + emirSayiYaz(m.fiyat));
    osatirlar.push("Adet: " + m.adet);
    toplam += m.fiyat * m.adet;
  });
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
}

// ---------------------------------------------------------
// GÖNDERİM
// ---------------------------------------------------------
function emirDipnotYaz() {
  var el = document.getElementById("emir-dipnot");
  if (!el) return;
  el.textContent = EMIR_NTFY_AKTIF
    ? "Gönder'e basınca emir doğrudan bota gider; bot sıradaki turda uygular ve Telegram'a bilgi mesajı yazar."
    : "Gönder'e basınca metin PANOYA kopyalanır — Telegram'da ilgili başlığa " +
      "(🛒 Pazar / 👑 Divan / ⚓ Deniz) yapıştırıp gönder. " +
      "Mesajın SENİN hesabından çıkması şart: Telegram, botun kendi " +
      "yazdığı mesajı bota geri vermiyor (gruba geçmek bunu değiştirmedi).";
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

  document.getElementById("sat-hesap").addEventListener("input", function () {
    emirSatisMalDoldur();
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
  document.getElementById("al-azami-oner").addEventListener("click", emirAzamiOner);

  document.getElementById("od-kisi").addEventListener("input", emirGuncelle);
  document.getElementById("od-sancak").addEventListener("change", function () {
    emirOdenekListeleriTazele();
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
      durum.textContent = "📋 Kopyalandı — Telegram grubunda HERHANGİ bir " +
                          "başlığa yapıştır (düzen için 🛒 Pazar / 👑 Divan).";
    } else {
      durum.textContent = "⚠️ Kopyalanamadı — aşağıdaki metni elle seçip kopyala.";
    }
    setTimeout(function () { durum.textContent = ""; }, 9000);
  });

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
  ["gemiye_bin", "⛵ Gemiye bin"],
  ["satin_al", "🛒 Pazardan al"],
  ["bekle", "⏳ Bekle"]
];

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

/* Divan görevleri: sabit liste (oyunun makamları). */
var AY_DIVAN = ["", "Ziraat Nazırı", "Ticaret Nazırı", "Belediye Reisi",
                "Maliye Nazırı", "İçişleri Nazırı", "Ordu Komutanı"];

function ayDivaniDoldur() {
  var sec = document.getElementById("ay-divan");
  if (!sec) return;
  var html = "<option value=" + ayTirnak("") + ">— değiştirme —</option>";
  html += "<option value=" + ayTirnak("iptal") + ">— görevi kaldır —</option>";
  AY_DIVAN.forEach(function (g) {
    if (!g) return;
    html += "<option value=" + ayTirnak(emirKacis(g)) + ">" + emirKacis(g) + "</option>";
  });
  sec.innerHTML = html;
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
    if (t === "seyahat") {
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
    if (!hedef) continue;                 // ⚠️ boş adım gönderilmez
    if (tip === "satin_al") {
      var a = parseInt(satirlar[i].querySelector(".ay-gorev-adet").value, 10);
      hedef += " x" + (a > 0 ? a : 1);
    }
    parcalar.push(tip + ":" + hedef);
  }
  return parcalar.join(", ");
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
  ekle("divan", emirDeger("ay-divan"));
  ekle("seyahat", emirDeger("ay-seyahat"));
  ekle("ders", emirDeger("ay-ders"));
  ekle("armatör", emirDeger("ay-armator"));

  if (document.getElementById("ay-gorev-satirlar").dataset.iptal === "1") {
    satirlar.push("görev: iptal");
  } else {
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
   "ay-puan", "ay-divan", "ay-seyahat", "ay-ders", "ay-armator"
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

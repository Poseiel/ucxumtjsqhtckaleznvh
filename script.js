// script.js
// Bu dosya tamamen orijinaldir; herhangi bir üçüncü taraf sitesinden kod
// alınmamıştır. Veriler (harita_render.json, pazar.json) kendi
// hesaplarımızdan/botumuzdan üretilir.

// ---------------------------------------------------------
// GİRİŞ PERDESİ (ŞİFRE KAPISI)
// Şifrenin kendisi kodda YOK; sadece SHA-256 özeti tutulur. Doğru şifre
// girilince tarayıcıya (localStorage) kaydedilir, bir daha sorulmaz.
// Şifre botun günlük Telegram mesajıyla paylaşılır (v82.py SITE_SIFRESI).
// Not: Bu istemci tarafı bir perdedir — asıl koruma, sitenin tahmin
// edilemez rastgele adresidir.
// ---------------------------------------------------------
const GIRIS_HASH = "cada33142d4b07c5efcb1db741409c490e5f34d6ccddfa42c727ee9a3ed5cd95";

async function sha256Hex(metin) {
  const veri = new TextEncoder().encode(metin);
  const ozet = await crypto.subtle.digest("SHA-256", veri);
  return [...new Uint8Array(ozet)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

(function girisKontrol() {
  const perde = document.getElementById("giris-perdesi");
  if (!perde) return;

  if (localStorage.getItem("poseidon_giris") === GIRIS_HASH) {
    perde.remove();
    return;
  }

  const dene = async () => {
    const sifre = document.getElementById("giris-sifre").value;
    if ((await sha256Hex(sifre)) === GIRIS_HASH) {
      localStorage.setItem("poseidon_giris", GIRIS_HASH);
      perde.remove();
    } else {
      document.getElementById("giris-hata").hidden = false;
    }
  };

  document.getElementById("giris-btn").addEventListener("click", dene);
  document.getElementById("giris-sifre").addEventListener("keydown", (e) => {
    if (e.key === "Enter") dene();
  });
})();

// ---------------------------------------------------------
// SEKME GEÇİŞİ
// ---------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ---------------------------------------------------------
// PAZAR SEKMESİ
// ---------------------------------------------------------
let pazarVerisi = [];

async function pazarYukle() {
  try {
    const yanit = await fetch("pazar.json?_=" + Date.now());
    const veri = await yanit.json();
    pazarVerisi = veri.urunler || [];
    document.getElementById("son-guncelleme-metni").textContent = veri.son_guncelleme || "bilinmiyor";

    const kasabalar = [...new Set(pazarVerisi.map((u) => u.kasaba))].sort();
    const secim = document.getElementById("pazar-kasaba-filtre");
    kasabalar.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      secim.appendChild(opt);
    });

    // [YENİ] Ürün seçme kutusu: aramaya gerek kalmadan "ne var ne yok"
    // görebilmek için. Yanına kaç kasabada satıldığı yazılır.
    const urunSayim = new Map();
    pazarVerisi.forEach((u) => urunSayim.set(u.isim, (urunSayim.get(u.isim) || 0) + 1));
    const urunSecim = document.getElementById("pazar-urun-filtre");
    [...urunSayim.keys()].sort((a, b) => a.localeCompare(b, "tr")).forEach((isim) => {
      const opt = document.createElement("option");
      opt.value = isim;
      opt.textContent = `${isim} (${urunSayim.get(isim)} ilan)`;
      urunSecim.appendChild(opt);
    });

    pazarTabloCiz();
  } catch (e) {
    document.getElementById("son-guncelleme-metni").textContent = "yüklenemedi";
    console.error("Pazar verisi yüklenemedi:", e);
  }
}

function pazarTabloCiz() {
  const arama = document.getElementById("pazar-arama").value.trim().toLocaleLowerCase("tr-TR");
  const kasabaFiltre = document.getElementById("pazar-kasaba-filtre").value;
  const urunFiltre = document.getElementById("pazar-urun-filtre").value;

  const filtreli = pazarVerisi.filter((u) => {
    const isimUyar = !arama || u.isim.toLocaleLowerCase("tr-TR").includes(arama);
    const urunUyar = !urunFiltre || u.isim === urunFiltre;
    const kasabaUyar = !kasabaFiltre || u.kasaba === kasabaFiltre;
    return isimUyar && urunUyar && kasabaUyar;
  });

  const govde = document.getElementById("pazar-tablo-govde");
  govde.innerHTML = "";
  filtreli.forEach((u) => {
    const satir = document.createElement("tr");
    satir.innerHTML = `<td>${u.isim}</td><td>${u.adet}</td><td>${u.fiyat}</td><td>${u.kasaba}</td>`;
    govde.appendChild(satir);
  });

  document.getElementById("pazar-sonuc-yok").hidden = filtreli.length !== 0;
}

document.getElementById("pazar-arama").addEventListener("input", pazarTabloCiz);
document.getElementById("pazar-kasaba-filtre").addEventListener("change", pazarTabloCiz);
document.getElementById("pazar-urun-filtre").addEventListener("change", pazarTabloCiz);

// ---------------------------------------------------------
// ENVANTER SEKMESİ
// Veri: envanter.json (pazar_json_uret.py, en güncel
// tam_kapsamli_envanter_raporu_*.txt dosyasından üretir).
// Kişisel çanta + ev sandığı toplanmış tek liste halindedir.
// ---------------------------------------------------------
let envanterKarakterler = []; // [{karakter, kasaba, akce, esyalar:[{isim, adet}]}]
let envanterSatirlari = [];   // düz arama listesi: [{isim, adet, karakter, kasaba, akceMi}]

function akceFormat(sayi) {
  return sayi.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function kasabaYerAdi(kasaba) {
  return kasaba === "Bilinmiyor" ? "kasabası bilinmeyen karakterlerde" : `${kasaba} kasabasında`;
}

async function envanterYukle() {
  try {
    const yanit = await fetch("envanter.json?_=" + Date.now());
    const veri = await yanit.json();
    envanterKarakterler = veri.karakterler || [];
    document.getElementById("envanter-rapor-tarihi").textContent = veri.rapor_tarihi || "bilinmiyor";

    // Düz arama listesi: akçe de aranabilir bir "eşya" gibi eklenir
    envanterSatirlari = [];
    envanterKarakterler.forEach((k) => {
      if (k.akce > 0) {
        envanterSatirlari.push({ isim: "Akçe", adet: k.akce, karakter: k.karakter, kasaba: k.kasaba, akceMi: true });
      }
      (k.esyalar || []).forEach((e) => {
        envanterSatirlari.push({ isim: e.isim, adet: e.adet, karakter: k.karakter, kasaba: k.kasaba, akceMi: false });
      });
    });

    // Kasaba filtresi seçenekleri
    const kasabalar = [...new Set(envanterKarakterler.map((k) => k.kasaba))]
      .sort((a, b) => a.localeCompare(b, "tr"));
    const secim = document.getElementById("envanter-kasaba-filtre");
    kasabalar.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      secim.appendChild(opt);
    });

    // [YENİ] Eşya seçme kutusu: "kimin üstünde ne var" sorusunu aramaya
    // gerek kalmadan yanıtlar. Yanında toplam adet ve kaç kişide olduğu yazar.
    const esyaToplam = new Map();
    const esyaKisi = new Map();
    envanterSatirlari.forEach((s) => {
      if (s.akceMi) return;
      esyaToplam.set(s.isim, (esyaToplam.get(s.isim) || 0) + s.adet);
      if (!esyaKisi.has(s.isim)) esyaKisi.set(s.isim, new Set());
      esyaKisi.get(s.isim).add(s.karakter);
    });
    const esyaSecim = document.getElementById("envanter-esya-filtre");
    [...esyaToplam.keys()].sort((a, b) => a.localeCompare(b, "tr")).forEach((isim) => {
      const opt = document.createElement("option");
      opt.value = isim;
      opt.textContent = `${isim} — ${esyaToplam.get(isim)} adet / ${esyaKisi.get(isim).size} kişi`;
      esyaSecim.appendChild(opt);
    });

    envanterOzetCiz();
    envanterTabloCiz();
  } catch (e) {
    document.getElementById("envanter-rapor-tarihi").textContent = "yüklenemedi";
    console.error("Envanter verisi yüklenemedi:", e);
  }
}

// En üstteki özet: toplam akçe + kasaba kasaba akçe
function envanterOzetCiz() {
  const toplam = envanterKarakterler.reduce((t, k) => t + k.akce, 0);
  const kasabaToplam = new Map();
  envanterKarakterler.forEach((k) => {
    kasabaToplam.set(k.kasaba, (kasabaToplam.get(k.kasaba) || 0) + k.akce);
  });
  const siralanmis = [...kasabaToplam.entries()].sort((a, b) => b[1] - a[1]);

  const el = document.getElementById("envanter-ozet");
  el.innerHTML =
    `<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">💰 Toplam Akçe</span><span class="ozet-deger">${akceFormat(toplam)}</span></div>` +
    siralanmis
      .map(([kasaba, tutar]) =>
        `<div class="ozet-kart"><span class="ozet-etiket">${kasaba}</span><span class="ozet-deger">${akceFormat(tutar)}</span></div>`)
      .join("");
}

function envanterTabloCiz() {
  const arama = document.getElementById("envanter-arama").value.trim().toLocaleLowerCase("tr-TR");
  const kasabaFiltre = document.getElementById("envanter-kasaba-filtre").value;
  const esyaFiltre = document.getElementById("envanter-esya-filtre").value;
  const baslik = document.getElementById("envanter-tablo-baslik");
  const govde = document.getElementById("envanter-tablo-govde");
  const toplamEl = document.getElementById("envanter-toplam");
  const sonucYok = document.getElementById("envanter-sonuc-yok");
  govde.innerHTML = "";
  toplamEl.innerHTML = "";

  // --- Ne arama ne de eşya seçimi YOKKEN: karakter listesi ---
  if (!arama && !esyaFiltre) {
    baslik.innerHTML = "<tr><th>Karakter</th><th>Kasaba</th><th>Akçe</th><th>Eşya Çeşidi</th></tr>";
    const filtreli = envanterKarakterler.filter((k) => !kasabaFiltre || k.kasaba === kasabaFiltre);

    [...filtreli]
      .sort((a, b) => b.akce - a.akce)
      .forEach((k) => {
        const satir = document.createElement("tr");
        satir.innerHTML = `<td>${k.karakter}</td><td>${k.kasaba}</td><td>${akceFormat(k.akce)}</td><td>${(k.esyalar || []).length}</td>`;
        govde.appendChild(satir);
      });

    sonucYok.hidden = filtreli.length !== 0;
    if (kasabaFiltre && filtreli.length) {
      const kasabaAkce = filtreli.reduce((t, k) => t + k.akce, 0);
      toplamEl.innerHTML =
        `<p class="toplam-baslik">Toplam;</p>` +
        `<p>${filtreli.length} karakter ${kasabaYerAdi(kasabaFiltre)} bulunuyor, toplam ${akceFormat(kasabaAkce)} Akçe.</p>`;
    }
    return;
  }

  // --- Arama VEYA eşya seçimi VARKEN: eşya görünümü (pazar mantığı) ---
  // Dropdown TAM ad eşleşmesi yapar, arama kutusu kısmi arar.
  baslik.innerHTML = "<tr><th>Adet</th><th>Eşya</th><th>Karakter</th><th>Kasaba</th></tr>";
  const filtreli = envanterSatirlari.filter((s) => {
    const isimUyar = !arama || s.isim.toLocaleLowerCase("tr-TR").includes(arama);
    const esyaUyar = !esyaFiltre || s.isim === esyaFiltre;
    const kasabaUyar = !kasabaFiltre || s.kasaba === kasabaFiltre;
    return isimUyar && esyaUyar && kasabaUyar;
  });

  [...filtreli]
    .sort((a, b) => b.adet - a.adet)
    .forEach((s) => {
      const satir = document.createElement("tr");
      const adetMetni = s.akceMi ? akceFormat(s.adet) : s.adet;
      satir.innerHTML = `<td>${adetMetni}</td><td>${s.isim}</td><td>${s.karakter}</td><td>${s.kasaba}</td>`;
      govde.appendChild(satir);
    });

  sonucYok.hidden = filtreli.length !== 0;
  if (!filtreli.length) return;

  // Alt toplamlar: eşyalar adet olarak, akçe ayrı olarak kasaba kasaba toplanır
  const esyaKasabaToplam = new Map();
  const akceKasabaToplam = new Map();
  let esyaGenel = 0;
  let akceGenel = 0;

  filtreli.forEach((s) => {
    if (s.akceMi) {
      akceKasabaToplam.set(s.kasaba, (akceKasabaToplam.get(s.kasaba) || 0) + s.adet);
      akceGenel += s.adet;
    } else {
      esyaKasabaToplam.set(s.kasaba, (esyaKasabaToplam.get(s.kasaba) || 0) + s.adet);
      esyaGenel += s.adet;
    }
  });

  const satirlar = [];
  [...esyaKasabaToplam.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([kasaba, adet]) => satirlar.push(`<p>${adet} adet ${kasabaYerAdi(kasaba)} bulunuyor.</p>`));
  [...akceKasabaToplam.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([kasaba, tutar]) => satirlar.push(`<p>${akceFormat(tutar)} Akçe ${kasabaYerAdi(kasaba)} bulunuyor.</p>`));

  const genel = [];
  if (esyaGenel > 0) genel.push(`${esyaGenel} adet`);
  if (akceGenel > 0) genel.push(`${akceFormat(akceGenel)} Akçe`);

  toplamEl.innerHTML =
    `<p class="toplam-baslik">Toplam;</p>` +
    satirlar.join("") +
    `<p class="genel-toplam">Genel toplam: ${genel.join(" ve ")}.</p>`;
}

document.getElementById("envanter-arama").addEventListener("input", envanterTabloCiz);
document.getElementById("envanter-kasaba-filtre").addEventListener("change", envanterTabloCiz);
document.getElementById("envanter-esya-filtre").addEventListener("change", envanterTabloCiz);

// ---------------------------------------------------------
// SANCAK ENVANTERİ SEKMESİ
// Veri: sancak.json (divan_ticaret.py Ticaret Nazırı makamından okur ->
// Town_Reports/Sancak_Envanteri_*.txt -> pazar_json_uret.sancak_uret).
// Envanter sekmesiyle AYNI mantık; tek fark filtrenin kasaba değil SANCAK
// olması. "Önemli ürünler" listesi JSON'dan gelir (tek kaynak:
// pazar_json_uret.SANCAK_ONEMLI_URUNLER) — burada ikinci bir kopya TUTMA.
// ---------------------------------------------------------
let sancakKayitlari = [];   // [{sancak, kasaba, nazir, hazine, akce, esyalar:[]}]
let sancakSatirlari = [];   // düz liste: [{isim, adet, sancak, akceMi}]
let sancakOnemli = [];      // sancak.json -> onemli
let sancakEsik = 0;         // sancak.json -> onemli_esik (0 = uyarı yok)

async function sancakYukle() {
  try {
    const yanit = await fetch("sancak.json?_=" + Date.now());
    const veri = await yanit.json();
    sancakKayitlari = veri.sancaklar || [];
    sancakOnemli = veri.onemli || [];
    // Eşik de JSON'dan gelir (tek kaynak: divan_ticaret.ONEMLI_ESIK,
    // rapor başlığına yazılır). Eski dosyalarda yoksa 0 → uyarı çizilmez.
    sancakEsik = Number(veri.onemli_esik) || 0;
    document.getElementById("sancak-rapor-tarihi").textContent = veri.rapor_tarihi || "bilinmiyor";

    // Akçe de aranabilir bir "ürün" gibi listeye girer (Envanter ile aynı).
    sancakSatirlari = [];
    sancakKayitlari.forEach((s) => {
      if (s.akce > 0) {
        sancakSatirlari.push({ isim: "Akçe", adet: s.akce, sancak: s.sancak, akceMi: true });
      }
      (s.esyalar || []).forEach((e) => {
        sancakSatirlari.push({ isim: e.isim, adet: e.adet, sancak: s.sancak, akceMi: false });
      });
    });

    const sancakSecim = document.getElementById("sancak-sancak-filtre");
    [...new Set(sancakKayitlari.map((s) => s.sancak))]
      .sort((a, b) => a.localeCompare(b, "tr"))
      .forEach((ad) => {
        const opt = document.createElement("option");
        opt.value = ad;
        opt.textContent = ad;
        sancakSecim.appendChild(opt);
      });

    const urunToplam = new Map();
    sancakSatirlari.forEach((s) => {
      if (s.akceMi) return;
      urunToplam.set(s.isim, (urunToplam.get(s.isim) || 0) + s.adet);
    });
    const urunSecim = document.getElementById("sancak-urun-filtre");
    [...urunToplam.keys()].sort((a, b) => a.localeCompare(b, "tr")).forEach((isim) => {
      const opt = document.createElement("option");
      opt.value = isim;
      opt.textContent = `${isim} — ${urunToplam.get(isim)} adet`;
      urunSecim.appendChild(opt);
    });

    sancakOzetCiz();
    sancakTabloCiz();
  } catch (e) {
    // Henüz hiç okunmamışsa (Ticaret Nazırı turu atmamışsa) sancak.json YOK.
    // Sessizce boş kalmasın — kullanıcı "site bozuk mu?" diye düşünmesin.
    document.getElementById("sancak-rapor-tarihi").textContent = "henüz veri yok";
    document.getElementById("sancak-sonuc-yok").hidden = false;
    console.error("Sancak envanteri yüklenemedi:", e);
  }
}

function sancakOzetCiz() {
  const el = document.getElementById("sancak-ozet");
  el.innerHTML = sancakKayitlari
    .map((s) =>
      `<div class="ozet-kart"><span class="ozet-etiket">${s.sancak}</span>` +
      `<span class="ozet-deger">${akceFormat(s.akce)}</span>` +
      `<span class="ozet-alt">${(s.esyalar || []).length} çeşit · ${s.kasaba}</span></div>`)
    .join("");
}

// Şu an ekranda görünen satırlar (kopyalama butonu da bunu kullanır — yani
// kopyalanan liste ile görülen liste HER ZAMAN aynıdır).
function sancakSuzulmus() {
  const arama = document.getElementById("sancak-arama").value.trim().toLocaleLowerCase("tr-TR");
  const urunFiltre = document.getElementById("sancak-urun-filtre").value;
  const sancakFiltre = document.getElementById("sancak-sancak-filtre").value;
  const sadeceOnemli = document.getElementById("sancak-onemli-filtre").checked;

  return sancakSatirlari.filter((s) => {
    if (arama && !s.isim.toLocaleLowerCase("tr-TR").includes(arama)) return false;
    if (urunFiltre && s.isim !== urunFiltre) return false;
    if (sancakFiltre && s.sancak !== sancakFiltre) return false;
    // ⚠️ Tik AÇIKKEN yalnızca önemli kalemler görünür; arama/ürün seçimi
    // yapıldıysa tik yok sayılır (aradığını bulamamak can sıkıcı olurdu).
    // ⚠️ Liste boşsa (eski bir sancak.json) tik YOK SAYILIR — yoksa tablo
    //    tamamen boşalır ve veri yokmuş gibi görünür.
    if (sadeceOnemli && sancakOnemli.length && !arama && !urunFiltre
        && !sancakOnemli.includes(s.isim)) return false;
    return true;
  });
}

function sancakTabloCiz() {
  const baslik = document.getElementById("sancak-tablo-baslik");
  const govde = document.getElementById("sancak-tablo-govde");
  const sonucYok = document.getElementById("sancak-sonuc-yok");
  const cokSancak = new Set(sancakKayitlari.map((s) => s.sancak)).size > 1;
  govde.innerHTML = "";

  // 🏛️ [01.09.2026] "Sat" sütunu — eyalet adına satış emri üretir.
  // ⚠️ Akçe satırında düğme YOKTUR (para satılmaz).
  baslik.innerHTML = cokSancak
    ? "<tr><th>Adet</th><th>Ürün</th><th>Sancak</th><th>Sat</th></tr>"
    : "<tr><th>Adet</th><th>Ürün</th><th>Sat</th></tr>";

  const filtreli = sancakSuzulmus();
  // Önemli kalemler listenin başında, JSON'daki sırayla (akçe → demir → taş
  // → kil → boya); gerisi adede göre büyükten küçüğe.
  const sira = (s) => {
    const i = sancakOnemli.indexOf(s.isim);
    return i === -1 ? 999 : i;
  };
  [...filtreli]
    .sort((a, b) => sira(a) - sira(b) || b.adet - a.adet)
    .forEach((s) => {
      const satir = document.createElement("tr");
      const onemliMi = sancakOnemli.includes(s.isim);
      if (onemliMi) satir.className = "sancak-onemli";
      const adetMetni = s.akceMi ? akceFormat(s.adet) : s.adet;
      // Telegram özetiyle AYNI kural: önemli bir kalem eşiğin altındaysa ⚠️.
      // (Akçe bir eşya değil, para satırı — ona uyarı konmaz.)
      const uyari = (onemliMi && !s.akceMi && sancakEsik && s.adet < sancakEsik)
        ? "⚠️ " : "";
      // Akçe satılamaz; diğer her ürün için "Sat" düğmesi.
      const satHucre = s.akceMi
        ? "<td></td>"
        : '<td><button class="satir-sat-btn" type="button">Sat</button></td>';
      satir.innerHTML = cokSancak
        ? `<td>${adetMetni}</td><td>${uyari}${s.isim}</td><td>${s.sancak}</td>${satHucre}`
        : `<td>${adetMetni}</td><td>${uyari}${s.isim}</td>${satHucre}`;
      const btn = satir.querySelector(".satir-sat-btn");
      if (btn) btn.addEventListener("click", () => sancakSatKutusuAc(s));
      govde.appendChild(satir);
    });

  sonucYok.hidden = filtreli.length !== 0;
}

// ---------------------------------------------------------------------
// 🏛️ EYALET SATIŞ KUTUSU (01.09.2026)
// ---------------------------------------------------------------------
// Kullanıcı: *"eyalet envanter listesinin yanında satış kutucuğu koy,
// basınca açılsın oyundakine benzer."*
// ⚠️ Emir METNİ burada üretilmez — Tamam'a basınca `emir.js`teki
//    `eyaletSatisiAc` formu doldurur, metin TEK yerde (`emirMesajiKur`)
//    kurulur. Aksi halde iki ayrı yerde iki farklı biçim doğardı.
let sancakSatSecili = null;

function sancakSatNaziriBul(sancakAdi) {
  // Satışı yapacak hesap, o sancağın TİCARET NAZIRI'dır — raporu zaten
  // o yazdı, `sancak.json` içinde `nazir` alanında duruyor.
  const kayit = sancakKayitlari.find((k) => k.sancak === sancakAdi);
  return (kayit && kayit.nazir) || "";
}

function sancakSatOzetYaz() {
  const el = document.getElementById("sancak-sat-ozet");
  if (!el || !sancakSatSecili) return;
  const alici = (document.getElementById("sancak-sat-alici").value || "").trim();
  const adet = Number(document.getElementById("sancak-sat-adet").value) || 0;
  const nazir = sancakSatNaziriBul(sancakSatSecili.sancak);
  const kim = alici
    ? `yalnızca <b>${alici}</b> alabilir`
    : "akçesi <b>10.000’den fazla</b> olan ilk hesabımız alır (biri alınca diğerleri bakmaz)";
  const satici = nazir
    ? `<b>${nazir}</b> (Ticaret Nazırı)`
    : "<b>Ticaret Nazırı</b> hesabı";
  el.innerHTML = `${satici} ${adet} adet satışa çıkaracak; ${kim}. ` +
    "Para eyalet hazinesine girer.";
}

function sancakSatKutusuAc(satir) {
  sancakSatSecili = satir;
  const perde = document.getElementById("sancak-sat-perde");
  if (!perde) return;
  document.getElementById("sancak-sat-urun").textContent = satir.isim;
  document.getElementById("sancak-sat-stok").textContent =
    `(depoda ${satir.adet} adet` +
    (satir.sancak ? ` · ${satir.sancak}` : "") + ")";
  const adetKutu = document.getElementById("sancak-sat-adet");
  adetKutu.max = satir.adet;
  adetKutu.value = satir.adet;          // varsayılan: hepsi
  document.getElementById("sancak-sat-fiyat-mod").value = "maks";
  document.getElementById("sancak-sat-fiyat-kutu").hidden = true;
  document.getElementById("sancak-sat-fiyat").value = 999.95;
  document.getElementById("sancak-sat-alici").value = "";
  perde.hidden = false;
  sancakSatOzetYaz();
  adetKutu.focus();
}

function sancakSatKutusuKapat() {
  const perde = document.getElementById("sancak-sat-perde");
  if (perde) perde.hidden = true;
  sancakSatSecili = null;
}

function sancakSatOnayla() {
  if (!sancakSatSecili) return;
  const mod = document.getElementById("sancak-sat-fiyat-mod").value;
  let fiyat = 999.95;
  if (mod === "elle") {
    fiyat = Number(document.getElementById("sancak-sat-fiyat").value) || 0;
    // ⚠️ Oyun tavanı — üstünü yazarsa sessizce kırpmak yerine düzeltip
    //    kutuda da gösteriyoruz ki kullanıcı ne gittiğini görsün.
    if (fiyat > 999.95) fiyat = 999.95;
    if (fiyat <= 0) {
      document.getElementById("sancak-sat-ozet").textContent =
        "Fiyat 0’dan büyük olmalı.";
      return;
    }
  }
  let adet = Math.round(Number(document.getElementById("sancak-sat-adet").value) || 0);
  if (adet < 1) adet = 1;
  if (adet > sancakSatSecili.adet) adet = sancakSatSecili.adet;

  const bilgi = {
    nazir: sancakSatNaziriBul(sancakSatSecili.sancak),
    urun: sancakSatSecili.isim,
    adet: adet,
    fiyat: fiyat,
    alici: (document.getElementById("sancak-sat-alici").value || "").trim()
  };
  sancakSatKutusuKapat();
  // Emir sekmesine geç
  const sekme = document.querySelector('.tab-btn[data-tab="emir"]');
  if (sekme) sekme.click();
  if (typeof eyaletSatisiAc === "function") eyaletSatisiAc(bilgi);
}

function sancakSatOlaylariBagla() {
  const perde = document.getElementById("sancak-sat-perde");
  if (!perde) return;
  document.getElementById("sancak-sat-iptal")
    .addEventListener("click", sancakSatKutusuKapat);
  document.getElementById("sancak-sat-tamam")
    .addEventListener("click", sancakSatOnayla);
  // Perdenin BOŞLUĞUNA tıklayınca kapansın (kutunun içine tıklayınca değil)
  perde.addEventListener("click", (e) => {
    if (e.target === perde) sancakSatKutusuKapat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !perde.hidden) sancakSatKutusuKapat();
  });
  document.getElementById("sancak-sat-fiyat-mod")
    .addEventListener("change", (e) => {
      document.getElementById("sancak-sat-fiyat-kutu").hidden =
        e.target.value !== "elle";
    });
  ["sancak-sat-adet", "sancak-sat-alici"].forEach((id) => {
    document.getElementById(id).addEventListener("input", sancakSatOzetYaz);
  });
}

// Kopyalanan metin oyuna/foruma yapıştırılacak: "adet isim", oyunun kendi
// gösterimiyle aynı sıra.
function sancakKopyaMetni() {
  const tarih = document.getElementById("sancak-rapor-tarihi").textContent;
  const sancakFiltre = document.getElementById("sancak-sancak-filtre").value;
  const baslik = (sancakFiltre || "Sancak") + " — Envanter (" + tarih + ")";
  const sira = (s) => {
    const i = sancakOnemli.indexOf(s.isim);
    return i === -1 ? 999 : i;
  };
  const satirlar = [...sancakSuzulmus()]
    .sort((a, b) => sira(a) - sira(b) || b.adet - a.adet)
    .map((s) => {
      const adet = s.akceMi ? akceFormat(s.adet) : s.adet;
      const ek = sancakFiltre ? "" : `  (${s.sancak})`;
      return `${adet} ${s.isim}${ek}`;
    });
  return [baslik, ...satirlar].join("\n");
}

document.getElementById("sancak-arama").addEventListener("input", sancakTabloCiz);
document.getElementById("sancak-urun-filtre").addEventListener("change", sancakTabloCiz);
document.getElementById("sancak-sancak-filtre").addEventListener("change", sancakTabloCiz);
document.getElementById("sancak-onemli-filtre").addEventListener("change", sancakTabloCiz);
sancakSatOlaylariBagla();
document.getElementById("sancak-kopyala").addEventListener("click", async () => {
  const durum = document.getElementById("sancak-kopya-durum");
  const metin = sancakKopyaMetni();
  try {
    await navigator.clipboard.writeText(metin);
    durum.textContent = "✅ kopyalandı";
  } catch (e) {
    // Pano izni yoksa (bazı tarayıcı/HTTP durumları) eski yönteme düş.
    const kutu = document.createElement("textarea");
    kutu.value = metin;
    document.body.appendChild(kutu);
    kutu.select();
    try { document.execCommand("copy"); durum.textContent = "✅ kopyalandı"; }
    catch (e2) { durum.textContent = "⚠️ kopyalanamadı"; }
    document.body.removeChild(kutu);
  }
  setTimeout(() => { durum.textContent = ""; }, 2500);
});

// ---------------------------------------------------------
// BELEDİYE ENVANTERİ SEKMESİ
// Veri: belediye.json (divan_belediye.py Belediye Reisi makamından okur ->
// Town_Reports/Belediye_Envanteri_*.txt -> pazar_json_uret.belediye_uret).
// Sancak Envanteri ile AYNI mantık, İKİ fark (kullanıcı isteği 21.08.2026):
//   1) Filtre "sancak" değil KASABA (Ardencaple / Glasgow / Girvan / ...).
//   2) "Önemli ürünler" kavramı YOK — tüm ürünler dümdüz listelenir, o
//      yüzden burada ⭐ tiki ve eşik uyarısı da YOKTUR.
// ---------------------------------------------------------
let belediyeKayitlari = [];  // [{kasaba, sancak, reis, akce, agirlik, esyalar:[]}]
let belediyeSatirlari = [];  // düz liste: [{isim, adet, kasaba, akceMi}]

async function belediyeYukle() {
  try {
    const yanit = await fetch("belediye.json?_=" + Date.now());
    const veri = await yanit.json();
    belediyeKayitlari = veri.belediyeler || [];
    document.getElementById("belediye-rapor-tarihi").textContent = veri.rapor_tarihi || "bilinmiyor";

    // Akçe de aranabilir bir "ürün" gibi listeye girer (Envanter ile aynı).
    belediyeSatirlari = [];
    belediyeKayitlari.forEach((b) => {
      if (b.akce > 0) {
        belediyeSatirlari.push({ isim: "Akçe", adet: b.akce, kasaba: b.kasaba, akceMi: true });
      }
      (b.esyalar || []).forEach((e) => {
        belediyeSatirlari.push({ isim: e.isim, adet: e.adet, kasaba: b.kasaba, akceMi: false });
      });
    });

    const kasabaSecim = document.getElementById("belediye-kasaba-filtre");
    [...new Set(belediyeKayitlari.map((b) => b.kasaba))]
      .sort((a, b) => a.localeCompare(b, "tr"))
      .forEach((ad) => {
        const opt = document.createElement("option");
        opt.value = ad;
        opt.textContent = ad;
        kasabaSecim.appendChild(opt);
      });

    const urunToplam = new Map();
    belediyeSatirlari.forEach((s) => {
      if (s.akceMi) return;
      urunToplam.set(s.isim, (urunToplam.get(s.isim) || 0) + s.adet);
    });
    const urunSecim = document.getElementById("belediye-urun-filtre");
    [...urunToplam.keys()].sort((a, b) => a.localeCompare(b, "tr")).forEach((isim) => {
      const opt = document.createElement("option");
      opt.value = isim;
      opt.textContent = `${isim} — ${urunToplam.get(isim)} adet`;
      urunSecim.appendChild(opt);
    });

    belediyeOzetCiz();
    belediyeTabloCiz();
  } catch (e) {
    // Henüz hiç okunmamışsa (Belediye Reisi turu atmamışsa) belediye.json YOK.
    // Sessizce boş kalmasın — kullanıcı "site bozuk mu?" diye düşünmesin.
    document.getElementById("belediye-rapor-tarihi").textContent = "henüz veri yok";
    document.getElementById("belediye-sonuc-yok").hidden = false;
    console.error("Belediye envanteri yüklenemedi:", e);
  }
}

function belediyeOzetCiz() {
  const el = document.getElementById("belediye-ozet");
  el.innerHTML = belediyeKayitlari
    .map((b) =>
      `<div class="ozet-kart"><span class="ozet-etiket">${b.kasaba}</span>` +
      `<span class="ozet-deger">${akceFormat(b.akce)}</span>` +
      `<span class="ozet-alt">${(b.esyalar || []).length} çeşit · ${b.sancak}</span></div>`)
    .join("");
}

// Şu an ekranda görünen satırlar (kopyalama butonu da bunu kullanır — yani
// kopyalanan liste ile görülen liste HER ZAMAN aynıdır).
function belediyeSuzulmus() {
  const arama = document.getElementById("belediye-arama").value.trim().toLocaleLowerCase("tr-TR");
  const urunFiltre = document.getElementById("belediye-urun-filtre").value;
  const kasabaFiltre = document.getElementById("belediye-kasaba-filtre").value;

  return belediyeSatirlari.filter((s) => {
    if (arama && !s.isim.toLocaleLowerCase("tr-TR").includes(arama)) return false;
    if (urunFiltre && s.isim !== urunFiltre) return false;
    if (kasabaFiltre && s.kasaba !== kasabaFiltre) return false;
    return true;
  });
}

function belediyeTabloCiz() {
  const baslik = document.getElementById("belediye-tablo-baslik");
  const govde = document.getElementById("belediye-tablo-govde");
  const sonucYok = document.getElementById("belediye-sonuc-yok");
  const cokKasaba = new Set(belediyeKayitlari.map((b) => b.kasaba)).size > 1;
  govde.innerHTML = "";

  baslik.innerHTML = cokKasaba
    ? "<tr><th>Adet</th><th>Ürün</th><th>Kasaba</th></tr>"
    : "<tr><th>Adet</th><th>Ürün</th></tr>";

  // Önemli ürün ayrımı YOK — akçe en üstte, gerisi adede göre büyükten küçüğe.
  const filtreli = belediyeSuzulmus();
  [...filtreli]
    .sort((a, b) => (b.akceMi ? 1 : 0) - (a.akceMi ? 1 : 0) || b.adet - a.adet)
    .forEach((s) => {
      const satir = document.createElement("tr");
      const adetMetni = s.akceMi ? akceFormat(s.adet) : s.adet;
      satir.innerHTML = cokKasaba
        ? `<td>${adetMetni}</td><td>${s.isim}</td><td>${s.kasaba}</td>`
        : `<td>${adetMetni}</td><td>${s.isim}</td>`;
      govde.appendChild(satir);
    });

  sonucYok.hidden = filtreli.length !== 0;
}

// Kopyalanan metin oyuna/foruma yapıştırılacak: "adet isim", oyunun kendi
// gösterimiyle aynı sıra.
function belediyeKopyaMetni() {
  const tarih = document.getElementById("belediye-rapor-tarihi").textContent;
  const kasabaFiltre = document.getElementById("belediye-kasaba-filtre").value;
  const baslik = (kasabaFiltre || "Belediye") + " — Envanter (" + tarih + ")";
  const satirlar = [...belediyeSuzulmus()]
    .sort((a, b) => (b.akceMi ? 1 : 0) - (a.akceMi ? 1 : 0) || b.adet - a.adet)
    .map((s) => {
      const adet = s.akceMi ? akceFormat(s.adet) : s.adet;
      const ek = kasabaFiltre ? "" : `  (${s.kasaba})`;
      return `${adet} ${s.isim}${ek}`;
    });
  return [baslik, ...satirlar].join("\n");
}

document.getElementById("belediye-arama").addEventListener("input", belediyeTabloCiz);
document.getElementById("belediye-urun-filtre").addEventListener("change", belediyeTabloCiz);
document.getElementById("belediye-kasaba-filtre").addEventListener("change", belediyeTabloCiz);
document.getElementById("belediye-kopyala").addEventListener("click", async () => {
  const durum = document.getElementById("belediye-kopya-durum");
  const metin = belediyeKopyaMetni();
  try {
    await navigator.clipboard.writeText(metin);
    durum.textContent = "✅ kopyalandı";
  } catch (e) {
    // Pano izni yoksa (bazı tarayıcı/HTTP durumları) eski yönteme düş.
    const kutu = document.createElement("textarea");
    kutu.value = metin;
    document.body.appendChild(kutu);
    kutu.select();
    try { document.execCommand("copy"); durum.textContent = "✅ kopyalandı"; }
    catch (e2) { durum.textContent = "⚠️ kopyalanamadı"; }
    document.body.removeChild(kutu);
  }
  setTimeout(() => { durum.textContent = ""; }, 2500);
});

// ---------------------------------------------------------
// GELİŞİM SEKMESİ
// Veri: gelisim.json (pazar_json_uret.py, botun her gün yazdığı
// Gelisim_Durumu_*.txt dosyalarının en güncel iki gününü karşılaştırır).
// Her stat hücresinde düne göre fark rozeti: ▲ yeşil artış, = sarı sabit,
// ▼ kırmızı düşüş. Başlık yapışkandır, sütuna tıklayınca sıralanır.
// ---------------------------------------------------------
let gelisimKarakterler = [];
let gelisimSiralama = { anahtar: "kuvvet", azalan: true }; // varsayılan: KP'ye göre

// ⚠️ [30.08.2026] YENİ SÜTUNLAR — kullanıcı ve arkadaşının isteği:
//   *"bu gelişim listesinde hesapların açılma tarihi ve renklerini de
//     koyar mısın, onlara göre bir seçim yapalım"* (5 kaptan adayı seçmek
//     için) + *"meslekleri ve tarlaları, bir turda yetenekleri kayıt
//     ederiz"* + *"aile üyelerini ekle, bizim ailede olanlara Selçuklu
//     Ailesi yaz"*.
// ⚠️ Hiçbiri için EKSTRA SAYFA AÇILMIYOR:
//     renk    → stats sayfasının üst başlığından (zaten açık)
//     mülk    → Mulk_Tipleri.json (mülk taraması zaten yapıyor)
//     yetenek → Yetenek_Agaci.json (yetenek modülü zaten yazıyor)
//     aile    → dost_hesaplar.txt (filo takibi zaten kullanıyor)
//     tarih   → Hesap_Kayit_Tarihleri.json (BİR KEZ üretildi, değişmez)
const GELISIM_SUTUNLAR = [
  { anahtar: "karakter", etiket: "Karakter", sayisal: false },
  { anahtar: "kasaba", etiket: "Kasaba", sayisal: false },
  // 🏷️ [30.08.2026] AKTİF GÖREV — kullanıcı: *"hepsine hesapların
  //    bilgilerini ekleyelim mi diyordun, hepsini de ekle"*. Roller
  //    `ayarlar.json`daki tiklerden üretiliyor (ajan/kaptan/divan dahil,
  //    kullanıcı açıkça seçti). Hiçbir ekstra sayfa açılmıyor.
  { anahtar: "gorev_ozet", etiket: "Aktif Görev", sayisal: false },
  { anahtar: "aile", etiket: "Aile", sayisal: false },
  { anahtar: "meslek", etiket: "Meslek", sayisal: false },
  { anahtar: "mulk", etiket: "Tarla", sayisal: false },
  { anahtar: "yol", etiket: "Yol", sayisal: false },
  { anahtar: "renk", etiket: "Renk", sayisal: false },
  { anahtar: "kayit_tarihi", etiket: "Kayıt", sayisal: false },
  { anahtar: "seviye", etiket: "Seviye", sayisal: true },
  { anahtar: "kuvvet", etiket: "Kuvvet", sayisal: true },
  { anahtar: "zeka", etiket: "Zeka", sayisal: true },
  { anahtar: "karizma", etiket: "Karizma", sayisal: true },
  { anahtar: "guven", etiket: "Güven", sayisal: true },
  { anahtar: "akce", etiket: "Akçe", sayisal: true, ondalik: true },
  // ⚠️⚠️ [01.09.2026] `sayisal: false` İDİ → mücevher METİN gibi sıralanıyordu:
  //    "75" > "380" (önce ilk harfe bakılır). Kullanıcı: *"sitede jetona göre
  //    sıralama çalışmıyor?"* Değerler gelisim.json'a METİN olarak yazılıyor
  //    ("370"), o yüzden karşılaştırma sayıya ÇEVİREREK yapılır (bkz. alttaki
  //    `sayiya_cevir`) — eski kayıtlardaki "-" de bu sayede sona düşer.
  { anahtar: "mucevher", etiket: "💎", sayisal: true },
  // ⚠️ [30.08.2026] Kullanıcı: *"hepsini siteye koymak orayı çok şişirecek
  //    ... bir anda hepsi gözükmesin, detay istersek gözüksün."*
  //    Bu yüzden yetenek ağacı 5 sütun DEĞİL tek ÖZET sütun; medrese de
  //    tek özet. Ayrıntı satıra tıklayınca altta açılır (`detaySatiri`).
  { anahtar: "yetenek_ozet", etiket: "Yetenek", sayisal: false },
  { anahtar: "medrese_ozet", etiket: "Medrese", sayisal: false },
];

// Yetenek ağacı özeti: "İ100 S100 Z100 E0" — dar ama okunur.
function yetenekOzet(k) {
  const p = [["İ", k.yetenek_is], ["S", k.yetenek_siyaset],
             ["Z", k.yetenek_ziraat], ["E", k.yetenek_el]];
  if (p.every(([, v]) => v === undefined || v === null || v === "")) return "-";
  const metin = p.map(([h, v]) => h + (v === "" || v === undefined || v === null ? "?" : v)).join(" ");
  const bos = k.yetenek_puan;
  return metin + (bos ? ` <span class="bos-puan">+${bos}</span>` : "");
}

// Medrese özeti: en ilerlemiş 2 ana başlık, ör. "Dnz 8/8 · Dil 4/5".
const MEDRESE_KISA = {
  "Denizcilik": "Dnz", "Devlet": "Dvl", "İlim": "İlm",
  "Ordu": "Ord", "Bilim": "Blm", "Dil": "Dil", "Din": "Din",
};
function medreseOzet(k) {
  const m = k.medrese || {};
  const anahtarlar = Object.keys(m);
  if (!anahtarlar.length) return "-";
  const sirali = anahtarlar
    .map((b) => ({ b, ...m[b] }))
    .sort((a, b) => (b.tamam / Math.max(b.toplam, 1)) - (a.tamam / Math.max(a.toplam, 1)));
  const ilk = sirali.slice(0, 2)
    .map((x) => `${MEDRESE_KISA[x.b] || x.b} ${x.tamam}/${x.toplam}`).join(" · ");
  const kalan = sirali.length - 2;
  return ilk + (kalan > 0 ? ` <span class="kalan-sayi">+${kalan}</span>` : "");
}

// Renk adını oyundaki rengiyle göster (metin aynen kalır, sadece nokta).
const RENK_KODU = {
  "Beyaz": "#e8e8e8", "Sarı": "#e8d44d", "Yeşil": "#5cb85c",
  "Mavi": "#5b9bd5", "Turuncu": "#e8903a", "Kırmızı": "#d9534f",
  "Kahverengi": "#8b5a2b", "Siyah": "#333333",
};

// ⚠️⚠️ [01.09.2026] BU FONKSİYON UNUTULMUŞTU ve sayfayı KOMPLE KIRDI.
//    Sıralama satırında `sayiya_cevir` çağrılıyordu ama tanımı yoktu →
//    ReferenceError → Gelişim tablosu HİÇ çizilmedi ("sitedeki gelişim
//    ekranı komple sıfırlanmış" şikâyeti bundandı).
//    📌 DERS: script.js'e yeni bir yardımcı çağrısı eklerken tanımının da
//       yazıldığını doğrula; JS'te eksik fonksiyon sessiz değil ÖLÜMCÜLDÜR
//       (o andan sonraki tüm çizim durur).
function sayiya_cevir(deger) {
  if (deger === null || deger === undefined || deger === "") return null;
  if (typeof deger === "number") return isNaN(deger) ? null : deger;
  // "1.234,56" (oyun biçimi) ve "370" (düz metin) ikisi de gelebilir.
  const metin = String(deger).trim().replace(/\s/g, "");
  if (!metin || metin === "-") return null;
  const sayi = Number(metin.indexOf(",") >= 0
    ? metin.replace(/\./g, "").replace(",", ".")
    : metin);
  return isNaN(sayi) ? null : sayi;
}

function farkRozeti(bugunDeger, dunDeger, ondalikMi) {
  if (dunDeger === undefined || dunDeger === null) return "";
  const fark = bugunDeger - dunDeger;
  const degisti = ondalikMi ? Math.abs(fark) >= 0.01 : fark !== 0;
  if (!degisti) return ` <span class="fark fark-esit">=</span>`;
  const metin = ondalikMi
    ? Math.abs(fark).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.abs(fark);
  return fark > 0
    ? ` <span class="fark fark-artis">▲+${metin}</span>`
    : ` <span class="fark fark-dusus">▼-${metin}</span>`;
}

async function gelisimYukle() {
  try {
    const yanit = await fetch("gelisim.json?_=" + Date.now());
    const veri = await yanit.json();
    gelisimKarakterler = veri.karakterler || [];

    const tarihEl = document.getElementById("gelisim-tarih-notu");
    if (veri.dun_tarihi) {
      tarihEl.textContent = `${veri.dun_tarihi} → ${veri.bugun_tarihi}`;
    } else {
      tarihEl.textContent = `${veri.bugun_tarihi} (ilk gün — karşılaştırma yarın başlar)`;
    }

    const kasabalar = [...new Set(gelisimKarakterler.map((k) => k.kasaba))]
      .sort((a, b) => a.localeCompare(b, "tr"));
    const secim = document.getElementById("gelisim-kasaba-filtre");
    kasabalar.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      secim.appendChild(opt);
    });

    gelisimTabloCiz();
  } catch (e) {
    document.getElementById("gelisim-tarih-notu").textContent = "veri yok";
    document.getElementById("gelisim-sonuc-yok").hidden = false;
    console.error("Gelişim verisi yüklenemedi:", e);
  }
}

// Satıra tıklanınca açılan ayrıntı paneli: yetenek ağacının dört dalı,
// medresenin TÜM ana başlıkları ve yarım kalmış dersler.
// ⚠️ Tamamlanmış dersler TEK TEK yazılmaz (45 satır olurdu) — yalnızca
//    "x/y tamam" özeti + hâlâ eksik olanlar listelenir; asıl merak edilen
//    "hangisini çalıştırayım" sorusunun cevabı odur.
function detayIcerigi(k) {
  const bolumler = [];

  const agac = [["İş", k.yetenek_is], ["Siyaset", k.yetenek_siyaset],
                ["Ziraat", k.yetenek_ziraat], ["El becerisi", k.yetenek_el]]
    .filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (agac.length) {
    bolumler.push(
      `<div class="detay-blok"><h4>🌳 Yetenek ağacı</h4>` +
      agac.map(([ad, v]) =>
        `<div class="detay-cubuk"><span>${ad}</span>` +
        `<div class="cubuk"><div style="width:${Math.min(v, 100)}%"></div></div>` +
        `<b>%${v}</b></div>`).join("") +
      (k.yetenek_puan ? `<p class="detay-not">Harcanmamış puan: <b>${k.yetenek_puan}</b></p>` : "") +
      `</div>`);
  }

  // 🎓 MEDRESE — her ana başlık için çubuk + ALTINDA o başlığın DERSLERİ.
  // ⚠️⚠️ [30.08.2026] TAMAMLANANLAR DA GÖSTERİLİR. Kullanıcı: *"tamamlanmış
  //    dersleri de görelim, bizim kafamız karışır onu göremezsek."*
  //    ✔ = tamamlanmış · yüzdeli = yarım kalmış.
  const m = k.medrese || {};
  const tumDersler = k.medrese_dersler || {};
  const basliklar = Object.keys(m).sort();
  if (basliklar.length) {
    const grup = {};
    Object.keys(tumDersler).forEach((ad) => {
      const b = (ad.split("-")[0] || "").replace(/[0-9]+$/, "").trim();
      (grup[b] = grup[b] || []).push(ad);
    });
    // Ders numarasina gore sirala (Din1, Din2 ... Din10 dogru sirada)
    const numara = (ad) => {
      const mm = /(\d+)/.exec(ad.split("-")[0] || "");
      return mm ? parseInt(mm[1], 10) : 0;
    };
    bolumler.push(
      `<div class="detay-blok detay-genis"><h4>🎓 Medrese</h4>` +
      basliklar.map((b) => {
        const dersler = (grup[b] || []).sort((x, y) => numara(x) - numara(y));
        const liste = dersler.map((ad) => {
          const yz = tumDersler[ad];
          const kisa = ad.split("-").slice(1).join("-").trim() || ad;
          return yz >= 100
            ? `<li class="ders-tamam">✔ ${kisa}</li>`
            : `<li class="ders-eksik">${kisa} <b>%${yz}</b></li>`;
        }).join("");
        return `<div class="medrese-baslik">` +
          `<div class="detay-cubuk"><span>${b}</span>` +
          `<div class="cubuk"><div style="width:${Math.min(m[b].yuzde, 100)}%"></div></div>` +
          `<b>${m[b].tamam}/${m[b].toplam}</b></div>` +
          (liste ? `<ul class="ders-liste">${liste}</ul>` : "") +
          `</div>`;
      }).join("") +
      `</div>`);
  }

  // 📖 ÖNCELİK LİSTESİ — yarım kalan dersler, en ilerlemiş önce.
  // Üstteki medrese bloğu HEPSİNİ gösteriyor; bu bölüm "hangisini
  // çalıştırayım" sorusunun cevabını ayrıca öne çıkarır.
  const eksik = k.medrese_eksik || {};
  const eksikAdlar = Object.keys(eksik).sort((a, b) => eksik[b] - eksik[a]);
  if (eksikAdlar.length) {
    bolumler.push(
      `<div class="detay-blok"><h4>📖 Öncelik: yarım kalanlar ` +
      `<span class="detay-not">(${eksikAdlar.length})</span></h4>` +
      `<ul class="detay-liste">` +
      eksikAdlar.map((a) => `<li>${a} — <b>%${eksik[a]}</b></li>`).join("") +
      `</ul></div>`);
  }

  if (!bolumler.length) {
    return `<p class="detay-not">Bu hesap için henüz ayrıntı toplanmadı. ` +
           `Medrese yetenekleri her hesapta bir kez okunur; ders çalışan ` +
           `hesaplarda her turda tazelenir.</p>`;
  }
  return `<div class="detay-sarmal">${bolumler.join("")}</div>`;
}

function gelisimTabloCiz() {
  const kasabaFiltre = document.getElementById("gelisim-kasaba-filtre").value;
  const baslik = document.getElementById("gelisim-tablo-baslik");
  const govde = document.getElementById("gelisim-tablo-govde");
  govde.innerHTML = "";

  // Başlık (tıklanınca sırala; aktif sütunda yön oku göster)
  baslik.innerHTML = "<tr>" + GELISIM_SUTUNLAR.map((s) => {
    const aktif = gelisimSiralama.anahtar === s.anahtar;
    const ok = aktif ? (gelisimSiralama.azalan ? " ↓" : " ↑") : "";
    return `<th class="siralanabilir${aktif ? " aktif-sutun" : ""}" data-anahtar="${s.anahtar}">${s.etiket}${ok}</th>`;
  }).join("") + "</tr>";

  baslik.querySelectorAll("th").forEach((th) => {
    th.addEventListener("click", () => {
      const anahtar = th.dataset.anahtar;
      if (gelisimSiralama.anahtar === anahtar) {
        gelisimSiralama.azalan = !gelisimSiralama.azalan;
      } else {
        const sutun = GELISIM_SUTUNLAR.find((s) => s.anahtar === anahtar);
        gelisimSiralama = { anahtar, azalan: sutun.sayisal }; // sayısal: büyükten küçüğe başla
      }
      gelisimTabloCiz();
    });
  });

  const filtreli = gelisimKarakterler.filter((k) => !kasabaFiltre || k.kasaba === kasabaFiltre);

  const sutun = GELISIM_SUTUNLAR.find((s) => s.anahtar === gelisimSiralama.anahtar);
  const yon = gelisimSiralama.azalan ? -1 : 1;
  [...filtreli].sort((a, b) => {
    // ⚠️ Yeni sütunlar eski kayıtlarda boş olabilir; boşlar sona düşsün ki
    //    sıralama "undefined" yüzünden karışmasın.
    const av = a[sutun.anahtar], bv = b[sutun.anahtar];
    const abos = av === undefined || av === null || av === "";
    const bbos = bv === undefined || bv === null || bv === "";
    if (abos && bbos) return 0;
    if (abos) return 1;
    if (bbos) return -1;
    // ⚠️ [01.09.2026] Sayısal sütunun değeri METİN olabilir (mücevher
    //    gelisim.json'a "370" diye yazılıyor) ya da "-" olabilir. Ham
    //    çıkarma ("-" - 5) NaN üretir ve NaN dönen karşılaştırma
    //    sıralamayı sessizce bozar; bu yüzden sayıya çevrilir ve
    //    çevrilemeyen değer SONA atılır.
    if (sutun.sayisal) {
      const an = sayiya_cevir(av), bn = sayiya_cevir(bv);
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      return (an - bn) * yon;
    }
    return String(av).localeCompare(String(bv), "tr") * yon;
  }).forEach((k) => {
    const dun = k.dun;
    const hucreler = GELISIM_SUTUNLAR.map((s) => {
      if (!s.sayisal) {
        // Hesaplanan özet sütunları (tabloda tek hücre, ayrıntı altta).
        if (s.anahtar === "yetenek_ozet")
          return `<td class="gelisim-metin ozet-hucre">${yetenekOzet(k)}</td>`;
        if (s.anahtar === "medrese_ozet")
          return `<td class="gelisim-metin ozet-hucre">${medreseOzet(k)}</td>`;
        // 🏷️ Roller ayrı ayrı rozet olarak çizilir (gözle taramak kolay olsun).
        if (s.anahtar === "gorev_ozet") {
          const roller = k.gorevler || [];
          if (!roller.length) return `<td class="gelisim-metin gorev-bos">—</td>`;
          return `<td class="gelisim-metin">` + roller.map(
            (r) => `<span class="gorev-rozet">${r}</span>`).join(" ") + `</td>`;
        }
        // ⚠️ Yeni sütunlar ESKİ gelisim.json'da olmayabilir → boşsa "-".
        const ham = (k[s.anahtar] === undefined || k[s.anahtar] === null
                     || k[s.anahtar] === "") ? "-" : k[s.anahtar];
        // Renk sütununda küçük bir renk noktası: gözle taramak kolay olsun.
        if (s.anahtar === "renk" && RENK_KODU[ham]) {
          return `<td class="gelisim-metin"><span class="renk-nokta" `
               + `style="background:${RENK_KODU[ham]}"></span>${ham}</td>`;
        }
        return `<td class="gelisim-metin">${ham}</td>`;
      }
      // Yetenek sütunları henüz yoksa boş göster (0 yazıp yanıltmasın).
      if (k[s.anahtar] === undefined || k[s.anahtar] === null
          || k[s.anahtar] === "") return `<td>-</td>`;
      const deger = s.ondalik ? akceFormat(k[s.anahtar]) : k[s.anahtar];
      const rozet = farkRozeti(k[s.anahtar], dun ? dun[s.anahtar] : null, s.ondalik);
      return `<td>${deger}${rozet}</td>`;
    }).join("");
    const satir = document.createElement("tr");
    satir.className = "gelisim-satir";
    satir.innerHTML = hucreler;
    govde.appendChild(satir);

    // ▾ DETAY SATIRI — tıklayınca açılır/kapanır.
    // ⚠️ Kullanıcı: *"bir anda hepsi gözükmesin, detay istersek gözüksün."*
    //    Bu yüzden başlangıçta GİZLİ ve DOM'a yalnızca bir kez eklenir.
    const detay = document.createElement("tr");
    detay.className = "gelisim-detay";
    detay.hidden = true;
    const hucre = document.createElement("td");
    hucre.colSpan = GELISIM_SUTUNLAR.length;
    hucre.innerHTML = detayIcerigi(k);
    detay.appendChild(hucre);
    govde.appendChild(detay);
    satir.addEventListener("click", () => {
      detay.hidden = !detay.hidden;
      satir.classList.toggle("acik", !detay.hidden);
    });
  });

  document.getElementById("gelisim-sonuc-yok").hidden = filtreli.length !== 0;
}

document.getElementById("gelisim-kasaba-filtre").addEventListener("change", gelisimTabloCiz);

// ---------------------------------------------------------
// HAREKET SEKMESİ
// Veri: hareket.json (town_module.hareket_gecmisi_analiz → son 6 günün
// Town_Data snapshot'larından çıkarılan rota) + inziva kaydı.
// ---------------------------------------------------------
let hareketKayitlari = [];
let hareketKayiplar = [];

// Kasaba OLMAYAN konum etiketleri. "Ara Nokta (...)" ve yön tahminleri
// (İngiltere yolu, Glasgow-Girvan arası) de buraya dahildir.
const KASABA_DISI_ETIKETLER = [
  "Şehir Dışı", "İnzivada", "Arafta", "Öldü", "Profil Yok", "Bilinmiyor",
  "İngiltere yolu", "Glasgow-Girvan arası",
];

function kasabaDisiMi(konum) {
  return KASABA_DISI_ETIKETLER.includes(konum) || (konum || "").startsWith("Ara Nokta");
}

function konumRozetSinifi(konum) {
  if (konum === "İnzivada" || konum === "Arafta") return "konum-rozet konum-inziva";
  if (konum === "Öldü" || konum === "Profil Yok") return "konum-rozet konum-oldu";
  // Yolda olanlar (ara nokta / yön tahmini) — inzivadan ayırt edilsin
  if (kasabaDisiMi(konum)) return "konum-rozet konum-disari";
  return "konum-rozet";
}

async function hareketYukle() {
  try {
    const yanit = await fetch("hareket.json?_=" + Date.now());
    const veri = await yanit.json();
    hareketKayitlari = veri.kayitlar || [];
    hareketKayiplar = veri.kayiplar || [];
    inzivaDonusler = veri.donusler || [];
    multiCiftler = veri.multi_ciftler || [];
    multiKumeler = veri.multi_kumeler || [];
    sakinlerListesi = veri.sakinler || [];
    sakinlerBizim = veri.bizim_sayilar || {};
    sakinlerBizimToplam = veri.bizim_toplam || 0;
    // 🆕 Yeni hesap takibi — eski hareket.json'larda bu alanlar YOKTUR,
    // o zaman listeler boş kalır ve sayfa eskisi gibi çalışır.
    yeniHesaplar = veri.yeni_hesaplar || [];
    yeniHesapGruplari = veri.yeni_hesap_gruplari || [];
    inzivaDilekce = veri.dilekce || "";
    inzivaDilekceParcalari = veri.dilekce_parcalari || null;
    document.getElementById("sakinler-tarih").textContent = veri.son_gun || "bilinmiyor";

    document.getElementById("hareket-tarih-notu").textContent =
      `${veri.ilk_gun} → ${veri.son_gun} (${veri.gun_sayisi} gün)`;

    const konumlar = [...new Set(hareketKayitlari.map((k) => k.su_anki_konum))]
      .sort((a, b) => a.localeCompare(b, "tr"));
    const secim = document.getElementById("hareket-kasaba-filtre");
    konumlar.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      secim.appendChild(opt);
    });

    hareketOzetCiz();
    hareketTabloCiz();
    inzivaCiz();
    sakinlerCiz();
  } catch (e) {
    document.getElementById("hareket-tarih-notu").textContent = "veri yok";
    document.getElementById("hareket-sonuc-yok").hidden = false;
    console.error("Hareket verisi yüklenemedi:", e);
  }
}

function hareketOzetCiz() {
  const toplam = hareketKayitlari.length;
  const cokHareketli = hareketKayitlari.filter((k) => k.hareket_sayisi >= 2).length;
  const disarida = hareketKayitlari.filter((k) => kasabaDisiMi(k.su_anki_konum)).length;

  document.getElementById("hareket-ozet").innerHTML =
    `<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">🔄 Hareket eden</span><span class="ozet-deger">${toplam}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">2+ hareket</span><span class="ozet-deger">${cokHareketli}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">Şu an dışarıda</span><span class="ozet-deger">${disarida}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">Kayıt altındaki kayıp</span><span class="ozet-deger">${hareketKayiplar.length}</span></div>`;
}

function hareketTabloCiz() {
  const arama = document.getElementById("hareket-arama").value.trim().toLocaleLowerCase("tr-TR");
  const konumFiltre = document.getElementById("hareket-kasaba-filtre").value;
  const sadeceCok = document.getElementById("hareket-cok-filtre").checked;

  const filtreli = hareketKayitlari.filter((k) => {
    const isimUyar = !arama || k.karakter.toLocaleLowerCase("tr-TR").includes(arama);
    const konumUyar = !konumFiltre || k.su_anki_konum === konumFiltre;
    const cokUyar = !sadeceCok || k.hareket_sayisi >= 2;
    return isimUyar && konumUyar && cokUyar;
  });

  const govde = document.getElementById("hareket-tablo-govde");
  govde.innerHTML = "";
  filtreli.forEach((k) => {
    // Rota adımları artık {konum, tarih} taşıyor — hangi gün nereye gittiği
    // rozetin altında görünüyor. (Eski format düz metin listesiydi.)
    const rota = k.rota
      .map((adim) => {
        const konum = typeof adim === "string" ? adim : adim.konum;
        const tarih = typeof adim === "string" ? "" : (adim.tarih || "");
        const gun = tarih ? tarih.slice(8, 10) + "." + tarih.slice(5, 7) : "";
        return `<span class="rota-adim"><span class="${konumRozetSinifi(konum)}">${konum}</span>` +
          (gun ? `<span class="rota-tarih">${gun}</span>` : "") + `</span>`;
      })
      .join('<span class="rota-ok">→</span>');
    const satir = document.createElement("tr");
    satir.innerHTML =
      `<td>${k.karakter}</td>` +
      `<td><span class="${konumRozetSinifi(k.su_anki_konum)}">${k.su_anki_konum}</span></td>` +
      `<td class="rota-hucre">${rota}</td>` +
      `<td>${k.hareket_sayisi}</td>`;
    govde.appendChild(satir);
  });

  document.getElementById("hareket-sonuc-yok").hidden = filtreli.length !== 0;
}

document.getElementById("hareket-arama").addEventListener("input", hareketTabloCiz);
document.getElementById("hareket-kasaba-filtre").addEventListener("change", hareketTabloCiz);
document.getElementById("hareket-cok-filtre").addEventListener("change", hareketTabloCiz);

// ---------------------------------------------------------
// İNZİVA SEKMESİ (multi tespiti)
// Aynı gün ayrılan / aynı gün dönen, aynı aileden veya yakın tarihlerde
// açılmış hesaplar bir arada gösterilir — admine şikâyet için kanıt.
// ---------------------------------------------------------
let inzivaDonusler = [];
let multiCiftler = [];
let inzivaDilekce = "";
let inzivaDilekceParcalari = null;
let multiKumeler = [];
let sakinlerListesi = [];
// Kasaba başına KENDİ hesap sayımız (isim değil, sadece sayı — bkz.
// pazar_json_uret.bizim_hesaplari_say güvenlik notu).
let sakinlerBizim = {};
let sakinlerBizimToplam = 0;

// Öne çıkan bulgular: ham tablo yerine okunabilir cümleler.
function oneCikanlariCiz() {
  const kap = document.getElementById("one-cikanlar");
  const dikkat = multiCiftler.filter((c) => c.skor >= 3);

  // Henüz kanıt oluşmadıysa bile "ne izleniyor" bilgisini ver: aynı gün
  // inzivaya girmiş gruplar, çıkış günü geldiğinde asıl puanı alacak.
  const izlenen = new Map();
  hareketKayiplar
    .filter((k) => k.durum === "İnzivada")
    .forEach((k) => {
      const t = k.giris_tarihi || "?";
      if (!izlenen.has(t)) izlenen.set(t, []);
      izlenen.get(t).push(k.karakter);
    });
  const izlemeBloklari = [...izlenen.entries()]
    .filter(([, kisiler]) => kisiler.length > 1)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([tarih, kisiler]) =>
      `<p class="bulgu-satir">⏳ <strong>${tarih}</strong> tarihinde <strong>${kisiler.length} hesap</strong> ` +
      `birlikte inzivaya girdi: ${kisiler.join(", ")}. ` +
      `<em>Çıkış günleri bekleniyor — aynı gün çıkarlarsa puanları yükselecek.</em></p>`);

  if (!dikkat.length && !multiKumeler.length) {
    kap.innerHTML = izlemeBloklari.length
      ? `<div class="bulgu-blok"><h4>👀 İzlemedekiler</h4>${izlemeBloklari.join("")}` +
        `<p class="bulgu-not">Henüz kanıt sayılacak bir tekrar veya eşzamanlı çıkış yok. ` +
        `Bu gruplar aynı gün inzivadan çıkarsa otomatik olarak "dikkate değer"e yükselir.</p></div>`
      : `<p class="bos-durum">Bugün dikkate değer bir bulgu yok. ` +
        `Kayıtlar tutulmaya devam ediyor — aynı hesaplar tekrar birlikte inzivaya girerse burada görünecek.</p>`;
    return;
  }

  let html = "";

  // [04.08.2026 - kullanıcı isteği] KÜMELER EN ÜSTTE, BÜYÜK ve AYRI kart.
  // Asıl "büyük resim" budur: "şu N hesap tek grup hâlinde hareket ediyor"
  // (ör. 22 kişilik grup). Eskiden tek satırdı ve 235 çiftin arasında
  // kayboluyordu; kullanıcı "toplu listeyi göremiyorum, en ilk sırada
  // göreyim" dedi. Her üye ayrı bir etiket (chip) olarak gösterilir.
  if (multiKumeler.length) {
    html += `<div class="kume-bolum">` +
      `<h3 class="kume-bolum-baslik">🚨 Birlikte hareket eden gruplar (${multiKumeler.length})</h3>`;
    html += multiKumeler.map((k) => {
      const uyeler = k.uyeler || [];
      const tarihStr = (k.tarihler && k.tarihler.length) ? k.tarihler.join(", ") : "";
      return `<div class="kume-karti">` +
        `<div class="kume-baslik">` +
          `<span class="kume-rozet">${k.kisi_sayisi} HESAP</span>` +
          (k.en_yuksek_skor ? `<span class="kume-skor">en yüksek skor ${k.en_yuksek_skor}</span>` : "") +
        `</div>` +
        `<div class="kume-uyeler">` +
          uyeler.map((u) => `<span class="kume-uye">${u}</span>`).join("") +
        `</div>` +
        (tarihStr ? `<div class="kume-tarih">📅 Aynı gün inzivaya girdikleri tarih(ler): <strong>${tarihStr}</strong></div>` : "") +
        `</div>`;
    }).join("");
    html += `</div>`;
  }

  // İzlemedekiler (henüz çıkış günü gelmemiş, aynı gün girenler) — kümelerin ALTINDA
  if (izlemeBloklari.length) {
    html += `<div class="bulgu-blok"><h4>👀 İzlemedekiler</h4>${izlemeBloklari.join("")}</div>`;
  }

  if (dikkat.length) {
    html += `<div class="bulgu-blok">` +
      `<h4>🎯 Dikkate değer çiftler (${dikkat.length})</h4>` +
      dikkat.map((c) =>
        `<p class="bulgu-satir"><span class="skor-rozet ${skorSinifi(c.degerlendirme)}">${c.degerlendirme}</span> ${c.aciklama || ""}</p>`
      ).join("") +
      `</div>`;
  }

  const zayif = multiCiftler.length - dikkat.length;
  if (zayif > 0) {
    html += `<p class="bulgu-not">Ayrıca ${zayif} zayıf eşleşme var (yalnızca aynı gün ayrılmışlar, ` +
      `başka bağ yok). Bunlar aşağıdaki listede duruyor ama dilekçeye varsayılan olarak eklenmiyor.</p>`;
  }

  kap.innerHTML = html;
}

// ---------------------------------------------------------
// KİM NEREDE SEKMESİ (bugünün tam kasaba listesi)
// + 🆕 YENİ HESAPLAR (20.08.2026)
//
// Neden burada: karakter 25. seviyeye kadar SEYAHAT EDEMEZ, yani yeni bir
// hesabın bulunduğu kasaba doğduğu kasabadır — "kim nerede" sorusunun
// doğrudan parçası. İnziva sekmesine konmadı; orası kullanıcı kuralı gereği
// yalnızca gerçekten inzivada olanlar içindir.
// Veri: hareket.json -> yeni_hesaplar / yeni_hesap_gruplari (town_module
// hesaplar, ekstra sayfa açılmaz).
// ---------------------------------------------------------
let yeniHesaplar = [];
let yeniHesapGruplari = [];
let yeniHesapAdlari = new Set();

function yeniHesaplariCiz() {
  yeniHesapAdlari = new Set(yeniHesaplar.map((h) => h.ad));

  // Gruplar — en şüpheli en üstte (veri zaten sıralı gelir).
  const kap = document.getElementById("yeni-hesap-gruplar");
  kap.innerHTML = yeniHesapGruplari.map((g) => {
    const rozet = g.degerlendirme === "Çok güçlü" || g.degerlendirme === "Güçlü"
      ? "skor-rozet skor-yuksek" : "skor-rozet";
    const uyeler = g.uyeler.map((u) => `<span class="kume-uye">${u}</span>`).join("");
    // "Buluşma" grupları asıl kanıttır; "aynı gün doğum" tek başına zayıftır.
    const tur = g.tur === "bulusma"
      ? `<span class="skor-rozet skor-yuksek">🤝 BULUŞMA</span>`
      : `<span class="skor-rozet">📅 AYNI GÜN</span>`;
    // Metindeki **vurgu** işaretlerini kalın yaz.
    const metin = (g.aciklama || "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    return `<div class="kume-karti"><div class="skor-satiri">` +
      `<span class="${rozet}">${g.degerlendirme}</span>${tur}` +
      `<span class="skor-rozet">${g.uyeler.length} HESAP</span>` +
      `</div><p>${metin}</p><div>${uyeler}</div></div>`;
  }).join("");

  const govde = document.getElementById("yeni-hesap-tablo-govde");
  govde.innerHTML = "";
  [...yeniHesaplar]
    .sort((a, b) => (a.ilk_gorulme < b.ilk_gorulme ? 1 : -1))
    .forEach((h) => {
      const satir = document.createElement("tr");
      // ⚠️ Yer değiştirmiş olmak KRİTİK: 25. seviyeye kadar seyahat yok,
      //    yani taşınabilmiş hesap artık buluşabilir. Vurgulanır.
      if (h.yer_degistirdi) satir.className = "sancak-onemli";
      const simdi = h.yer_degistirdi
        ? `<span class="konum-rozet">➜ ${h.kasaba}</span>`
        : `<span class="fark-esit">aynı yerde</span>`;
      const taze = h.taze ? "🆕 " : "";
      satir.innerHTML = `<td>${taze}${h.ad}</td>` +
        `<td><span class="konum-rozet">${h.ilk_kasaba}</span></td>` +
        `<td>${simdi}</td>` +
        `<td>${h.ilk_gorulme}</td>` +
        `<td>${h.gun_yasi} gün</td>` +
        `<td>${h.dogum_pr} → ${h.pr}</td>`;
      govde.appendChild(satir);
    });
  document.getElementById("yeni-hesap-yok").hidden = yeniHesaplar.length !== 0;
}

function sakinlerCiz() {
  const kasabalar = [...new Set(sakinlerListesi.map((s) => s.kasaba))]
    .sort((a, b) => a.localeCompare(b, "tr"));
  const secim = document.getElementById("sakinler-kasaba-filtre");
  kasabalar.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    secim.appendChild(opt);
  });

  const sayim = new Map();
  sakinlerListesi.forEach((s) => sayim.set(s.kasaba, (sayim.get(s.kasaba) || 0) + 1));
  // İkinci satır: bu sayının kaçı BİZİM hesabımız. Veri yoksa (eski
  // hareket.json) satır hiç basılmaz — sayfa eski hâlinde çalışır.
  const bizimSatir = (n) =>
    sakinlerBizimToplam ? `<span class="ozet-bizim">🤝 bizim: ${n || 0}</span>` : "";

  const yeniKart = yeniHesaplar.length
    ? `<div class="ozet-kart ozet-kart-supheli"><span class="ozet-etiket">🆕 Yeni hesap</span><span class="ozet-deger">${yeniHesaplar.length}</span></div>`
    : "";

  document.getElementById("sakinler-ozet").innerHTML =
    `<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">👥 Toplam</span><span class="ozet-deger">${sakinlerListesi.length}</span>${bizimSatir(sakinlerBizimToplam)}</div>` +
    yeniKart +
    [...sayim.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
      `<div class="ozet-kart"><span class="ozet-etiket">${k}</span><span class="ozet-deger">${n}</span>${bizimSatir(sakinlerBizim[k])}</div>`
    ).join("");

  yeniHesaplariCiz();
  sakinlerTabloCiz();
}

function sakinlerTabloCiz() {
  const arama = document.getElementById("sakinler-arama").value.trim().toLocaleLowerCase("tr-TR");
  const kasabaFiltre = document.getElementById("sakinler-kasaba-filtre").value;
  const sadeceYeni = document.getElementById("sakinler-yeni-filtre").checked;

  const filtreli = sakinlerListesi.filter((s) =>
    (!arama || s.karakter.toLocaleLowerCase("tr-TR").includes(arama)) &&
    (!kasabaFiltre || s.kasaba === kasabaFiltre) &&
    (!sadeceYeni || yeniHesapAdlari.has(s.karakter))
  );

  const govde = document.getElementById("sakinler-tablo-govde");
  govde.innerHTML = "";
  filtreli.forEach((s) => {
    const satir = document.createElement("tr");
    const yeniMi = yeniHesapAdlari.has(s.karakter);
    if (yeniMi) satir.className = "sancak-onemli";
    satir.innerHTML = `<td>${yeniMi ? "🆕 " : ""}${s.karakter}</td>` +
      `<td><span class="konum-rozet">${s.kasaba}</span></td>` +
      `<td>${s.pr >= 0 ? s.pr : "-"}</td>`;
    govde.appendChild(satir);
  });
  document.getElementById("sakinler-sonuc-yok").hidden = filtreli.length !== 0;
}

document.getElementById("sakinler-arama").addEventListener("input", sakinlerTabloCiz);
document.getElementById("sakinler-kasaba-filtre").addEventListener("change", sakinlerTabloCiz);
document.getElementById("sakinler-yeni-filtre").addEventListener("change", sakinlerTabloCiz);

function inzivaOzetCiz() {
  const say = (d) => hareketKayiplar.filter((k) => k.durum === d).length;
  document.getElementById("inziva-ozet").innerHTML =
    `<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">🚪 Şu an dışarıda</span><span class="ozet-deger">${hareketKayiplar.length}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">İnzivada</span><span class="ozet-deger">${say("İnzivada")}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">Ara nokta</span><span class="ozet-deger">${say("Ara Nokta")}</span></div>` +
    `<div class="ozet-kart"><span class="ozet-etiket">Kayıtlı dönüş</span><span class="ozet-deger">${inzivaDonusler.length}</span></div>` +
    `<div class="ozet-kart ozet-kart-supheli"><span class="ozet-etiket">🎯 Şüpheli çift</span><span class="ozet-deger">${multiCiftler.length}</span></div>`;
}

// Eşzamanlı inziva hareketleri. Hiçbir çift ELENMEZ (tek seferlik çakışmalar
// dahil). Skor ve değerlendirme SADECE BURADA (senin kararın için) gösterilir;
// admine giden dilekçede bunlar yer almaz.
function skorSinifi(degerlendirme) {
  if (degerlendirme === "Çok güçlü") return "skor-cokguclu";
  if (degerlendirme === "Güçlü") return "skor-guclu";
  if (degerlendirme === "Orta") return "skor-orta";
  return "skor-zayif";
}

function multiCiftleriCiz() {
  const kap = document.getElementById("multi-ciftler");
  if (!multiCiftler.length) {
    kap.innerHTML =
      `<p class="bos-durum">Henüz eşzamanlı bir giriş/çıkış kaydedilmedi — ` +
      `her inziva giriş/çıkışı kaydediliyor, veri biriktikçe burası dolacak.</p>`;
    return;
  }

  kap.innerHTML = multiCiftler.map((c, i) => {
    // Dönem satırları: artık SADECE inziva dönemleri (kasaba değişimi yok)
    const donemler = c.ortak_donemler.map((o) => {
      const giris = (o.giris_fark === 0 || o.giris_fark === undefined)
        ? `<strong>${o.giris}</strong>`
        : `${o.giris} / ${o.giris2} <span class="fark">(${o.giris_fark} gün fark)</span>`;
      const cikis = o.ayni_cikis
        ? `<strong>${o.cikis}</strong> <span class="tam-eslesme">aynı gün ✓</span>` +
          (o.ayni_donus_kasabasi ? ` <span class="tam-eslesme">— ${o.donus_kasaba}'da buluştular</span>` : "")
        : `<span class="fark">${o.cikis || "hâlâ inzivada"}</span>`;
      return `<li>İnzivaya giriş: ${giris} &nbsp;→&nbsp; çıkış: ${cikis}</li>`;
    }).join("");

    const rozetler =
      `<span class="skor-rozet ${skorSinifi(c.degerlendirme)}">${c.degerlendirme} · skor ${c.skor}</span>` +
      `<span class="skor-rozet">${c.eslesme_sayisi} kez birlikte inzivada</span>` +
      (c.tam_eslesme ? `<span class="skor-rozet skor-tam">${c.tam_eslesme} kez aynı gün çıkış</span>` : "") +
      (c.ayni_aile ? `<span class="skor-rozet skor-kirmizi">Aynı aile</span>` : "") +
      (c.ayni_kayit_donemi
        ? `<span class="skor-rozet skor-kirmizi">${c.kayit_fark_gun} gün arayla açılmış</span>`
        : "");

    const not = (c.gerekceler && c.gerekceler.length)
      ? `<p class="multi-uyari">💡 ${c.gerekceler.join(" · ")}</p>`
      : "";

    // Dilekçeye dahil etme kutusu. Varsayılan olarak "Orta" ve üstü
    // (skor >= 30) işaretli gelir — yoksa dilekçe tek seferlik rastgele
    // çakışmalarla dolup anlamsızlaşıyor. İstersen tek tıkla eklersin.
    const dikkateDeger = c.skor >= 30;
    const secim = dilekceVakasiVarMi(c)
      ? `<label class="cift-secim"><input type="checkbox" class="dilekce-sec" data-index="${i}"${dikkateDeger ? " checked" : ""}> Dilekçeye ekle</label>`
      : `<span class="cift-secim fark">(dilekçe listesinin dışında)</span>`;

    return `<div class="multi-grup multi-cift">` +
      `<div class="cift-baslik"><h4>${c.kisi1} ↔ ${c.kisi2}</h4>${secim}</div>` +
      `<div class="skor-satiri">${rozetler}</div>` +
      not +
      `<p class="cift-detay">Aile: ${c.aile1 || "-"} / ${c.aile2 || "-"} &nbsp;·&nbsp; ` +
      `Kayıt: ${c.kayit1 || "-"} / ${c.kayit2 || "-"}</p>` +
      `<ul class="donem-listesi">${donemler}</ul>` +
      `</div>`;
  }).join("");

  kap.querySelectorAll(".dilekce-sec").forEach((kutu) => {
    kutu.addEventListener("change", dilekceyiYenidenKur);
  });
}

// ---- Hazır şikâyet dilekçesi (seçilen vakalardan yeniden birleştirilir) ----
// Şablon TEK yerde (town_module.sikayet_dilekcesi_uret) tutulur; burada
// yalnızca giriş + seçili vaka blokları + kapanış birleştirilir.
function dilekceVakasiVarMi(c) {
  const vakalar = (inzivaDilekceParcalari && inzivaDilekceParcalari.vakalar) || [];
  return vakalar.some((v) => v.kisi1 === c.kisi1 && v.kisi2 === c.kisi2);
}

function dilekceyiYenidenKur() {
  const kutu = document.getElementById("dilekce-metin");
  const bilgi = document.getElementById("dilekce-vaka-sayisi");
  const parcalar = inzivaDilekceParcalari || {};
  const vakalar = parcalar.vakalar || [];

  if (!vakalar.length) {
    kutu.value = inzivaDilekce ||
      "Şikâyet edilecek eşzamanlı hareket kaydı henüz yok — dilekçe, ilk kayıt oluştuğunda otomatik hazırlanacak.";
    if (bilgi) bilgi.textContent = "";
    return;
  }

  const seciliCiftler = [...document.querySelectorAll(".dilekce-sec:checked")]
    .map((el) => multiCiftler[parseInt(el.dataset.index, 10)])
    .filter(Boolean);

  const secilenVakalar = vakalar.filter((v) =>
    seciliCiftler.some((c) => c.kisi1 === v.kisi1 && c.kisi2 === v.kisi2)
  );

  if (bilgi) {
    bilgi.textContent = `${secilenVakalar.length} / ${vakalar.length} vaka seçili`;
  }

  if (!secilenVakalar.length) {
    kutu.value = "Hiç vaka seçilmedi — aşağıdan en az bir çifti işaretle.";
    return;
  }

  const govde = secilenVakalar.map((v, i) =>
    `\nCASE ${i + 1} / CAS ${i + 1} :  ${v.kisi1}   &   ${v.kisi2}\n${v.govde}`
  ).join("\n");

  kutu.value = (parcalar.giris || "") + "\n" + govde + "\n" + (parcalar.kapanis || "");
}

function dilekceCiz() {
  const btn = document.getElementById("dilekce-kopyala");
  const durum = document.getElementById("dilekce-durum");
  const kutu = document.getElementById("dilekce-metin");

  dilekceyiYenidenKur();
  btn.disabled = !(inzivaDilekce || (inzivaDilekceParcalari && inzivaDilekceParcalari.vakalar));

  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(kutu.value);
      durum.textContent = "✅ Kopyalandı";
    } catch (e) {
      kutu.select();
      durum.textContent = "Metni seçtim — Ctrl+C ile kopyala";
    }
    setTimeout(() => (durum.textContent = ""), 4000);
  };
}

// Kişi GERÇEKTEN inzivada mı? (profil kontrolüyle doğrulanmış)
// Seyahat edenler, ara noktadakiler, başka krallığa gidenler MASUMDUR ve
// bu sekmeye hiç girmemelidir — onların yeri "Hareket" sekmesidir.
// Kullanıcı: "inzivada değilse bu inziva sekmesinde ne işi var? Zaten
// hareket edenlerde görüyorum, ne diye kafamı karıştırıyorsun?"
function inzivadaMi(durum) {
  const d = (durum || "").toLocaleLowerCase("tr-TR");
  return d.includes("inzivada") || d.includes("arafta");
}

// Tarihe göre grupla; 2+ kişilik gruplar multi şüphesidir.
function grupla(liste, tarihAlani) {
  const gruplar = new Map();
  liste.forEach((k) => {
    const t = k[tarihAlani] || "?";
    if (!gruplar.has(t)) gruplar.set(t, []);
    gruplar.get(t).push(k);
  });
  return [...gruplar.entries()]
    .filter(([, kisiler]) => kisiler.length > 1)
    .sort((a, b) => b[0].localeCompare(a[0]));
}

function multiGruplariCiz() {
  const kap = document.getElementById("multi-gruplar");
  const bloklar = [];

  const grupYaz = (baslik, gruplar, tarihEtiketi) => {
    gruplar.forEach(([tarih, kisiler]) => {
      // Aynı aileden olanları say
      const aileSayim = new Map();
      kisiler.forEach((k) => {
        if (k.aile) aileSayim.set(k.aile, (aileSayim.get(k.aile) || 0) + 1);
      });
      const ayniAile = [...aileSayim.entries()].filter(([, n]) => n > 1);

      const satirlar = kisiler
        .sort((a, b) => a.karakter.localeCompare(b.karakter, "tr"))
        .map((k) => {
          const aileVurgu = k.aile && aileSayim.get(k.aile) > 1 ? " multi-vurgu" : "";
          return `<tr><td>${k.karakter}</td>` +
            `<td><span class="${konumRozetSinifi(k.durum)}">${k.durum}</span></td>` +
            `<td class="${aileVurgu}">${k.aile || "-"}</td>` +
            `<td>${k.kayit_tarihi || "-"}</td>` +
            `<td>${k.son_kasaba || "-"}</td></tr>`;
        })
        .join("");

      // Kayıt tarihi yakınlığı: aynı ay içinde açılmış hesaplar da multi
      // göstergesidir. Normalize edilmiş "YYYY-AA" alanı kullanılır —
      // ham metnin son 7 karakteri Türkçe ay adları yüzünden yanlış
      // eşleşiyordu ("Nis-an 2012" ile "Hazir-an 2012" aynı sanılıyordu).
      const donemSayim = new Map();
      kisiler.forEach((k) => {
        const d = k.kayit_donemi || "";
        if (d) donemSayim.set(d, (donemSayim.get(d) || 0) + 1);
      });
      const ayniDonem = [...donemSayim.entries()].filter(([, n]) => n > 1);

      const uyarilar = [];
      if (ayniAile.length) {
        uyarilar.push(`‼️ Aynı aile: ${ayniAile.map(([a, n]) => `${a} (${n} kişi)`).join(", ")}`);
      }
      if (ayniDonem.length) {
        uyarilar.push(`📅 Aynı dönemde açılmış: ${ayniDonem.map(([d, n]) => `${d} (${n} hesap)`).join(", ")}`);
      }
      const uyari = uyarilar.length ? `<p class="multi-uyari">${uyarilar.join("<br>")}</p>` : "";

      bloklar.push(
        `<div class="multi-grup">` +
        `<h4>${baslik} <span class="multi-tarih">${tarihEtiketi}: ${tarih}</span> — ${kisiler.length} kişi</h4>` +
        uyari +
        `<div class="tablo-sarici"><table><thead><tr>` +
        `<th>Karakter</th><th>Durum</th><th>Aile</th><th>Kayıt tarihi</th><th>Son kasabası</th>` +
        `</tr></thead><tbody>${satirlar}</tbody></table></div></div>`
      );
    });
  };

  // SADECE gerçekten inzivada/arafta olanlar. Seyahat edenler elenir —
  // onlar masumdur ve zaten "Hareket" sekmesinde rotalarıyla görünürler.
  const inzivadakiler = hareketKayiplar.filter((k) => inzivadaMi(k.durum));
  const inzivadanDonenler = inzivaDonusler.filter((k) => inzivadaMi(k.durum));

  grupYaz("🔒 Aynı gün İNZİVAYA GİRENLER", grupla(inzivadakiler, "giris_tarihi"), "İnzivaya girdiler");
  grupYaz("🔓 Aynı gün İNZİVADAN ÇIKANLAR", grupla(inzivadanDonenler, "cikis_tarihi"), "Oyuna döndüler");

  const elenen = hareketKayiplar.length - inzivadakiler.length;
  const dipnot = elenen > 0
    ? `<p class="bos-durum" style="margin-top:12px">ℹ️ Ayrıca ${elenen} kişi kasabalarımızda görünmüyor ama ` +
      `<b>inzivada değil</b> (seyahatte / yolda / başka krallıkta). Seyahat masum kabul edildiği için ` +
      `buraya alınmadılar — nereye gittiklerini <b>Hareket</b> sekmesinden görebilirsin.</p>`
    : "";

  kap.innerHTML = (bloklar.length
    ? bloklar.join("")
    : `<p class="bos-durum">Aynı gün birlikte inzivaya giren/çıkan grup tespit edilmedi.</p>`) + dipnot;
}

function kayipTabloCiz() {
  const arama = document.getElementById("kayip-arama").value.trim().toLocaleLowerCase("tr-TR");
  const durumFiltre = document.getElementById("kayip-durum-filtre").value;

  const filtreli = hareketKayiplar.filter((k) => {
    const metin = `${k.karakter} ${k.aile || ""}`.toLocaleLowerCase("tr-TR");
    return (!arama || metin.includes(arama)) && (!durumFiltre || k.durum === durumFiltre);
  });

  const govde = document.getElementById("kayip-tablo-govde");
  govde.innerHTML = "";
  filtreli.forEach((k) => {
    const konumEki = k.profil_konum ? ` <span class="fark">(${k.profil_konum})</span>` : "";
    const satir = document.createElement("tr");
    satir.innerHTML =
      `<td>${k.karakter}</td>` +
      `<td><span class="${konumRozetSinifi(k.durum)}">${k.durum}</span>${konumEki}</td>` +
      `<td>${k.aile || "-"}</td>` +
      `<td>${k.kayit_tarihi || "-"}</td>` +
      `<td>${k.giris_tarihi || "-"}</td>` +
      `<td>${k.son_kasaba || "-"}</td>` +
      `<td>${k.son_giris || "-"}</td>`;
    govde.appendChild(satir);
  });
  document.getElementById("kayip-sonuc-yok").hidden = filtreli.length !== 0;
}

function donusTabloCiz() {
  const govde = document.getElementById("donus-tablo-govde");
  govde.innerHTML = "";
  inzivaDonusler.forEach((k) => {
    const satir = document.createElement("tr");
    satir.innerHTML =
      `<td>${k.karakter}</td>` +
      `<td><span class="${konumRozetSinifi(k.durum)}">${k.durum}</span></td>` +
      `<td>${k.aile || "-"}</td>` +
      `<td>${k.kayit_tarihi || "-"}</td>` +
      `<td>${k.giris_tarihi || "-"} → ${k.cikis_tarihi || "-"}</td>` +
      `<td>${k.kalinan_gun === "" || k.kalinan_gun === undefined ? "-" : k.kalinan_gun}</td>`;
    govde.appendChild(satir);
  });
  document.getElementById("donus-sonuc-yok").hidden = inzivaDonusler.length !== 0;
}

function inzivaCiz() {
  const durumlar = [...new Set(hareketKayiplar.map((k) => k.durum))].sort((a, b) => a.localeCompare(b, "tr"));
  const secim = document.getElementById("kayip-durum-filtre");
  durumlar.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    secim.appendChild(opt);
  });

  inzivaOzetCiz();
  oneCikanlariCiz();
  // Önce kartlar (seçim kutuları burada oluşur), SONRA dilekçe — dilekçe
  // metni seçili kutulardan üretildiği için sıra bu şekilde olmalı.
  multiCiftleriCiz();
  dilekceCiz();
  multiGruplariCiz();
  kayipTabloCiz();
  donusTabloCiz();
}

document.getElementById("kayip-arama").addEventListener("input", kayipTabloCiz);
document.getElementById("kayip-durum-filtre").addEventListener("change", kayipTabloCiz);

// ---------------------------------------------------------
// HARİTA + SEYAHAT SEKMESİ
// ---------------------------------------------------------
let dugumler = [];       // [{id, x, y, isim}]
let dugumMap = new Map(); // id -> dugum
let komsuluk = new Map(); // id -> [komşu id'ler]
let secilenNereden = null;
let secilenNereye = null;

async function haritaYukle() {
  try {
    const yanit = await fetch("harita_render.json?_=" + Date.now());
    const veri = await yanit.json();
    dugumler = veri.dugumler;
    dugumler.forEach((d) => dugumMap.set(d.id, d));

    komsuluk = new Map();
    veri.kenarlar.forEach(([a, b]) => {
      if (!komsuluk.has(a)) komsuluk.set(a, []);
      if (!komsuluk.has(b)) komsuluk.set(b, []);
      komsuluk.get(a).push(b);
      komsuluk.get(b).push(a);
    });

    haritaCiz(veri.kenarlar);
    sehirSecimleriniDoldur();
  } catch (e) {
    console.error("Harita verisi yüklenemedi:", e);
  }
}

function haritaCiz(kenarlar) {
  const svg = document.getElementById("harita-svg");
  if (!svg) return;   // eski SVG harita kaldırıldı (bkz. harita.js)
  svg.innerHTML = "";

  const ns = "http://www.w3.org/2000/svg";

  // Yollar
  const yolGrubu = document.createElementNS(ns, "g");
  yolGrubu.setAttribute("id", "yol-grubu");
  kenarlar.forEach(([a, b]) => {
    const da = dugumMap.get(a);
    const db = dugumMap.get(b);
    if (!da || !db) return;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", da.x);
    line.setAttribute("y1", da.y);
    line.setAttribute("x2", db.x);
    line.setAttribute("y2", db.y);
    line.setAttribute("class", "yol-cizgisi");
    yolGrubu.appendChild(line);
  });
  svg.appendChild(yolGrubu);

  // Rota vurgusu için ayrı, boş bir grup (üstte kalsın)
  const rotaGrubu = document.createElementNS(ns, "g");
  rotaGrubu.setAttribute("id", "rota-grubu");
  svg.appendChild(rotaGrubu);

  // Düğümler
  const dugumGrubu = document.createElementNS(ns, "g");
  dugumler.forEach((d) => {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", d.x);
    circle.setAttribute("cy", d.y);
    if (d.isim) {
      circle.setAttribute("r", 5);
      circle.setAttribute("class", "sehir-nokta");
      circle.setAttribute("data-id", d.id);
      circle.addEventListener("click", () => sehreTikla(d.id));

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", d.x + 7);
      label.setAttribute("y", d.y + 3);
      label.setAttribute("class", "sehir-etiket");
      label.textContent = d.isim;
      dugumGrubu.appendChild(label);
    } else {
      circle.setAttribute("r", 1.4);
      circle.setAttribute("class", "dugum-nokta");
    }
    dugumGrubu.appendChild(circle);
  });
  svg.appendChild(dugumGrubu);
}

function sehreTikla(id) {
  const nerdenSecim = document.getElementById("seyahat-nereden");
  const nereyeSecim = document.getElementById("seyahat-nereye");
  if (!nerdenSecim.value) {
    nerdenSecim.value = id;
  } else {
    nereyeSecim.value = id;
  }
}

function sehirSecimleriniDoldur() {
  const isimliler = dugumler
    .filter((d) => d.isim)
    .sort((a, b) => a.isim.localeCompare(b.isim, "tr"));

  const nerdenSecim = document.getElementById("seyahat-nereden");
  const nereyeSecim = document.getElementById("seyahat-nereye");

  isimliler.forEach((d) => {
    const opt1 = document.createElement("option");
    opt1.value = d.id;
    opt1.textContent = d.isim;
    nerdenSecim.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = d.id;
    opt2.textContent = d.isim;
    nereyeSecim.appendChild(opt2);
  });
}

// BFS ile en kısa yol (ağırlıksız graf) — travel_module.py'deki
// networkx shortest_path ile aynı mantık.
function enKisaYol(baslangic, hedef) {
  if (baslangic === hedef) return [baslangic];
  const ziyaretEdildi = new Set([baslangic]);
  const onceki = new Map();
  const kuyruk = [baslangic];

  while (kuyruk.length > 0) {
    const su = kuyruk.shift();
    const komsular = komsuluk.get(su) || [];
    for (const k of komsular) {
      if (ziyaretEdildi.has(k)) continue;
      ziyaretEdildi.add(k);
      onceki.set(k, su);
      if (k === hedef) {
        const yol = [hedef];
        let adim = hedef;
        while (onceki.has(adim)) {
          adim = onceki.get(adim);
          yol.unshift(adim);
        }
        return yol;
      }
      kuyruk.push(k);
    }
  }
  return null; // rota yok (bağlantısız parça)
}

// ⚠️ 27.08.2026: Harita sekmesi Leaflet tabanlı `harita.js`e taşındı;
//    bu düğme artık sayfada YOK. Korumasız `addEventListener` çağrısı
//    burada patlayıp AŞAĞIDAKİ TÜM sekmelerin yüklenmesini engelliyordu.
const _rotaBulBtn = document.getElementById("rota-bul-btn");
if (_rotaBulBtn) _rotaBulBtn.addEventListener("click", () => {
  const nereden = parseInt(document.getElementById("seyahat-nereden").value, 10);
  const nereye = parseInt(document.getElementById("seyahat-nereye").value, 10);
  const sonucEl = document.getElementById("rota-sonuc");
  const rotaGrubu = document.getElementById("rota-grubu");
  rotaGrubu.innerHTML = "";

  if (!nereden || !nereye) {
    sonucEl.textContent = "Önce iki şehir seç.";
    return;
  }
  if (nereden === nereye) {
    sonucEl.textContent = "Zaten oradasın.";
    return;
  }

  const yol = enKisaYol(nereden, nereye);
  if (!yol) {
    sonucEl.textContent = "Bu iki şehir arasında kara yolu bağlantısı yok (farklı ada/bölge olabilir).";
    return;
  }

  const mesafe = yol.length - 1; // adım sayısı
  const pasaMi = document.getElementById("pasa-paketli").checked;
  const adimHakki = pasaMi ? 3 : 2;
  const gun = Math.ceil(mesafe / adimHakki);

  const isimNereden = dugumMap.get(nereden).isim;
  const isimNereye = dugumMap.get(nereye).isim;
  sonucEl.textContent =
    `${isimNereden} → ${isimNereye}: ${mesafe} adım, ${gun} gün ` +
    `(${pasaMi ? "Paşa paketli, günde 3 adım" : "günde 2 adım"}).`;

  // Rotayı haritada çiz
  const ns = "http://www.w3.org/2000/svg";
  const points = yol.map((id) => {
    const d = dugumMap.get(id);
    return `${d.x},${d.y}`;
  }).join(" ");
  const polyline = document.createElementNS(ns, "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("class", "rota-cizgisi");
  rotaGrubu.appendChild(polyline);
});


// ---------------------------------------------------------
// ⚓ LİMAN ENVANTERİ SEKMESİ  (29.08.2026)
// Veri: liman.json (divan_liman.py Liman Şefi makamından okur ->
// Town_Reports/Liman_Envanteri_*.txt -> pazar_json_uret.liman_uret).
//
// Kullanıcı isteği: *"belediye ve liman envanteri aynı sekmede olsa bile
// AYRI GÖSTERİLMESİ lazım."* -> ayrı sekme, ayrı JSON, ayrı tablo.
//
// ⚠️ Belediye sekmesiyle aynı desen, ama kod KOPYALANMADI: aşağıdaki
//    `envanterSekmesiKur` GENEL bir kurucudur, yalnızca DOM önekini ve
//    JSON alan adlarını alır. Belediye bloğuna DOKUNULMADI (çalışan site
//    JS'inde bir hata TÜM sekmeleri düşürüyor - `rota-bul-btn` vakası);
//    ileride belediye de bu kurucuya taşınabilir.
// ---------------------------------------------------------
function envanterSekmesiKur(onek, jsonAdi, veriAnahtari, baslikAdi) {
  const G = (ek) => document.getElementById(onek + "-" + ek);
  let kayitlar = [];
  let satirlar = [];

  function suzulmus() {
    const arama = (G("arama").value || "").trim().toLocaleLowerCase("tr-TR");
    const urun = G("urun-filtre").value;
    const kasaba = G("kasaba-filtre").value;
    return satirlar.filter((s) => {
      if (arama && !s.isim.toLocaleLowerCase("tr-TR").includes(arama)) return false;
      if (urun && s.isim !== urun) return false;
      if (kasaba && s.kasaba !== kasaba) return false;
      return true;
    });
  }

  function sirala(liste) {
    // Akçe en üstte, gerisi adede göre büyükten küçüğe (belediye ile aynı).
    return [...liste].sort(
      (a, b) => (b.akceMi ? 1 : 0) - (a.akceMi ? 1 : 0) || b.adet - a.adet);
  }

  function ozetCiz() {
    G("ozet").innerHTML = kayitlar.map((b) =>
      `<div class="ozet-kart"><span class="ozet-etiket">${b.kasaba}</span>` +
      `<span class="ozet-deger">${akceFormat(b.akce)}</span>` +
      `<span class="ozet-alt">${(b.esyalar || []).length} çeşit · ${b.sancak}</span></div>`
    ).join("");
  }

  function tabloCiz() {
    const baslik = G("tablo-baslik");
    const govde = G("tablo-govde");
    const cokKasaba = new Set(kayitlar.map((b) => b.kasaba)).size > 1;
    govde.innerHTML = "";
    baslik.innerHTML = cokKasaba
      ? "<tr><th>Adet</th><th>Ürün</th><th>Liman</th></tr>"
      : "<tr><th>Adet</th><th>Ürün</th></tr>";
    const filtreli = suzulmus();
    sirala(filtreli).forEach((s) => {
      const tr = document.createElement("tr");
      const adet = s.akceMi ? akceFormat(s.adet) : s.adet;
      tr.innerHTML = cokKasaba
        ? `<td>${adet}</td><td>${s.isim}</td><td>${s.kasaba}</td>`
        : `<td>${adet}</td><td>${s.isim}</td>`;
      govde.appendChild(tr);
    });
    G("sonuc-yok").hidden = filtreli.length !== 0;
  }

  function kopyaMetni() {
    const tarih = G("rapor-tarihi").textContent;
    const kasaba = G("kasaba-filtre").value;
    const bas = (kasaba || baslikAdi) + " — Envanter (" + tarih + ")";
    const sat = sirala(suzulmus()).map((s) => {
      const adet = s.akceMi ? akceFormat(s.adet) : s.adet;
      return `${adet} ${s.isim}${kasaba ? "" : "  (" + s.kasaba + ")"}`;
    });
    return [bas, ...sat].join("\n");
  }

  async function yukle() {
    try {
      const yanit = await fetch(jsonAdi + "?_=" + Date.now());
      const veri = await yanit.json();
      kayitlar = veri[veriAnahtari] || [];
      G("rapor-tarihi").textContent = veri.rapor_tarihi || "bilinmiyor";

      satirlar = [];
      kayitlar.forEach((b) => {
        if (b.akce > 0) {
          satirlar.push({ isim: "Akçe", adet: b.akce, kasaba: b.kasaba, akceMi: true });
        }
        (b.esyalar || []).forEach((e) => {
          satirlar.push({ isim: e.isim, adet: e.adet, kasaba: b.kasaba, akceMi: false });
        });
      });

      const kSecim = G("kasaba-filtre");
      [...new Set(kayitlar.map((b) => b.kasaba))]
        .sort((a, b) => a.localeCompare(b, "tr"))
        .forEach((ad) => {
          const o = document.createElement("option");
          o.value = ad; o.textContent = ad; kSecim.appendChild(o);
        });

      const toplam = new Map();
      satirlar.forEach((s) => {
        if (s.akceMi) return;
        toplam.set(s.isim, (toplam.get(s.isim) || 0) + s.adet);
      });
      const uSecim = G("urun-filtre");
      [...toplam.keys()].sort((a, b) => a.localeCompare(b, "tr")).forEach((isim) => {
        const o = document.createElement("option");
        o.value = isim; o.textContent = `${isim} — ${toplam.get(isim)} adet`;
        uSecim.appendChild(o);
      });

      ozetCiz();
      tabloCiz();
    } catch (e) {
      // ⚠️ Henüz hiç okunmamışsa JSON YOK — site "bozuk" görünmesin.
      G("rapor-tarihi").textContent = "henüz veri yok";
      G("sonuc-yok").hidden = false;
      console.error(baslikAdi + " envanteri yüklenemedi:", e);
    }
  }

  // ⚠️ Panel HTML'i yoksa (eski index.html) hiçbir dinleyici bağlanmaz —
  //    aksi halde null'a addEventListener çağrılır ve TÜM site JS'i düşer.
  if (!G("arama")) return;
  G("arama").addEventListener("input", tabloCiz);
  G("urun-filtre").addEventListener("change", tabloCiz);
  G("kasaba-filtre").addEventListener("change", tabloCiz);
  G("kopyala").addEventListener("click", async () => {
    const durum = G("kopya-durum");
    const metin = kopyaMetni();
    try {
      await navigator.clipboard.writeText(metin);
      durum.textContent = "✅ kopyalandı";
    } catch (e) {
      const kutu = document.createElement("textarea");
      kutu.value = metin;
      document.body.appendChild(kutu);
      kutu.select();
      try { document.execCommand("copy"); durum.textContent = "✅ kopyalandı"; }
      catch (e2) { durum.textContent = "⚠️ kopyalanamadı"; }
      document.body.removeChild(kutu);
    }
    setTimeout(() => { durum.textContent = ""; }, 2500);
  });
  yukle();
}


// ---------------------------------------------------------
// ⛵ FİLO SEKMESİ  (29.08.2026)
// Veri: filo.json (filo_modul.py → Town_Reports/Liman_Gemileri_*.txt →
// pazar_json_uret.filo_uret). Ajanların rıhtımda gördüğü gemiler.
//
// ⚠️ "Mesaj at" düğmesi Emir sekmesine atlar (emir.js → emirMesajAc).
//    Site oyuna doğrudan mesaj GÖNDEREMEZ; zincir pazar emirleriyle aynı:
//    site metni üretir → Telegram → bot kuyruğa alır → karakter girince yollar.
// ---------------------------------------------------------
let filoKayitlari = [];
let filoSatirlari = [];

const FILO_SIMGE = { bizim: "🟢", dost: "🔵", yabanci: "🔴" };

function filoSuzulmus() {
  const arama = (document.getElementById("filo-arama").value || "")
    .trim().toLocaleLowerCase("tr-TR");
  const liman = document.getElementById("filo-liman-filtre").value;
  const taraf = document.getElementById("filo-taraf-filtre").value;
  const turEl = document.getElementById("filo-tur-filtre");
  const tur = turEl ? turEl.value : "";
  return filoSatirlari.filter((s) => {
    if (liman && s.liman !== liman) return false;
    if (taraf && s.taraf !== taraf) return false;
    // ⚠️ Türü BİLİNMEYEN gemi, tür seçiliyken listeye girmez — "Mavna
    //    seç, tüm mavnaları gör" beklentisi bozulmasın.
    if (tur && (s.tur || "") !== tur) return false;
    if (arama) {
      const yig = (s.armator + " " + s.gemi).toLocaleLowerCase("tr-TR");
      if (!yig.includes(arama)) return false;
    }
    return true;
  });
}

function filoOzetCiz() {
  // ⚠️ Bir TÜR seçiliyse kartlar o türü sayar — kullanıcı: *"mavna seçince
  //    tüm mavnaları göreyim, hangi şehirde kaç tane var."*
  const turEl = document.getElementById("filo-tur-filtre");
  const tur = turEl ? turEl.value : "";
  const kutu = document.getElementById("filo-ozet");
  if (tur) {
    const say = new Map();
    filoSatirlari.forEach((s) => {
      if ((s.tur || "") !== tur) return;
      say.set(s.liman, (say.get(s.liman) || 0) + 1);
    });
    if (!say.size) {
      kutu.innerHTML = `<div class="ozet-kart"><span class="ozet-etiket">` +
        `${tur}</span><span class="ozet-deger">0</span>` +
        `<span class="ozet-alt">hiçbir limanda yok</span></div>`;
      return;
    }
    kutu.innerHTML = [...say.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"))
      .map(([liman, n]) =>
        `<div class="ozet-kart"><span class="ozet-etiket">${liman}</span>` +
        `<span class="ozet-deger">${n} ${tur}</span>` +
        `<span class="ozet-alt">toplam ${say.size} limanda</span></div>`)
      .join("");
    return;
  }
  kutu.innerHTML = filoKayitlari.map((l) =>
    `<div class="ozet-kart"><span class="ozet-etiket">${l.liman}</span>` +
    `<span class="ozet-deger">${l.gemiler.length} gemi</span>` +
    `<span class="ozet-alt">🟢${l.sayim.bizim} 🔵${l.sayim.dost} 🔴${l.sayim.yabanci}</span></div>`
  ).join("");
}

function filoTabloCiz() {
  const govde = document.getElementById("filo-tablo-govde");
  govde.innerHTML = "";
  const filtreli = filoSuzulmus();
  filtreli.forEach((s) => {
    const tr = document.createElement("tr");
    const simge = FILO_SIMGE[s.taraf] || "";
    tr.innerHTML =
      `<td>${s.liman}</td>` +
      `<td>${simge} ${s.armator}</td>` +
      `<td>${s.gemi || "?"}${s.durum ? ' <span class="filo-durum">🛠️ ' + s.durum + "</span>" : ""}</td>` +
      `<td>${s.tur || ""}</td>` +
      `<td><button class="emir-mini-btn filo-mesaj-btn">✉️</button></td>`;
    // ⚠️ Dinleyici doğrudan bağlanır (innerHTML'e onclick GÖMÜLMEZ —
    //    gemi adları kullanıcı tarafından yazılıyor, kod kaçışı riski var).
    const btn = tr.querySelector(".filo-mesaj-btn");
    btn.title = s.armator + " adlı oyuncuya mesaj yaz";
    btn.addEventListener("click", () => {
      const sekme = document.querySelector('.tab-btn[data-tab="emir"]');
      if (sekme) sekme.click();
      if (typeof emirMesajAc === "function") emirMesajAc(s.armator, s.gemi);
    });
    govde.appendChild(tr);
  });
  document.getElementById("filo-sonuc-yok").hidden = filtreli.length !== 0;
}

async function filoYukle() {
  const t = document.getElementById("filo-rapor-tarihi");
  if (!t) return;                       // eski index.html — sessizce çık
  try {
    const yanit = await fetch("filo.json?_=" + Date.now());
    const veri = await yanit.json();
    filoKayitlari = veri.limanlar || [];
    t.textContent = veri.rapor_tarihi || "bilinmiyor";

    filoSatirlari = [];
    filoKayitlari.forEach((l) => {
      (l.gemiler || []).forEach((g) => {
        filoSatirlari.push({
          liman: l.liman, armator: g.armator, gemi: g.gemi,
          tur: g.tur, taraf: g.taraf, durum: g.durum || "",
        });
      });
    });

    const secim = document.getElementById("filo-liman-filtre");
    filoKayitlari.map((l) => l.liman)
      .sort((a, b) => a.localeCompare(b, "tr"))
      .forEach((ad) => {
        const o = document.createElement("option");
        o.value = ad; o.textContent = ad; secim.appendChild(o);
      });

    // ⚠️ Tür listesi VERİDEN üretilir (sabit liste tutulmaz): oyun yeni
    //    bir gemi türü çıkarırsa kendiliğinden görünür.
    const turSecim = document.getElementById("filo-tur-filtre");
    if (turSecim) {
      const turSay = new Map();
      filoSatirlari.forEach((s) => {
        if (!s.tur) return;
        turSay.set(s.tur, (turSay.get(s.tur) || 0) + 1);
      });
      [...turSay.keys()].sort((a, b) => a.localeCompare(b, "tr"))
        .forEach((ad) => {
          const o = document.createElement("option");
          o.value = ad;
          o.textContent = `${ad} — ${turSay.get(ad)} gemi`;
          turSecim.appendChild(o);
        });
    }

    filoOzetCiz();
    filoTabloCiz();
  } catch (e) {
    t.textContent = "henüz veri yok";
    document.getElementById("filo-sonuc-yok").hidden = false;
    console.error("Filo yüklenemedi:", e);
  }
}

["filo-arama", "filo-liman-filtre", "filo-taraf-filtre",
 "filo-tur-filtre"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener(id === "filo-arama" ? "input" : "change", () => {
      filoOzetCiz();      // tür seçilince kartlar da değişsin
      filoTabloCiz();
    });
  }
});

pazarYukle();
envanterYukle();
sancakYukle();
belediyeYukle();
envanterSekmesiKur("liman", "liman.json", "limanlar", "Liman");
filoYukle();
gelisimYukle();
hareketYukle();
haritaYukle();

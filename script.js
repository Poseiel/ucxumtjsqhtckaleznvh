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

    pazarTabloCiz();
  } catch (e) {
    document.getElementById("son-guncelleme-metni").textContent = "yüklenemedi";
    console.error("Pazar verisi yüklenemedi:", e);
  }
}

function pazarTabloCiz() {
  const arama = document.getElementById("pazar-arama").value.trim().toLocaleLowerCase("tr-TR");
  const kasabaFiltre = document.getElementById("pazar-kasaba-filtre").value;

  const filtreli = pazarVerisi.filter((u) => {
    const isimUyar = !arama || u.isim.toLocaleLowerCase("tr-TR").includes(arama);
    const kasabaUyar = !kasabaFiltre || u.kasaba === kasabaFiltre;
    return isimUyar && kasabaUyar;
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
  const baslik = document.getElementById("envanter-tablo-baslik");
  const govde = document.getElementById("envanter-tablo-govde");
  const toplamEl = document.getElementById("envanter-toplam");
  const sonucYok = document.getElementById("envanter-sonuc-yok");
  govde.innerHTML = "";
  toplamEl.innerHTML = "";

  // --- Arama YOKKEN: karakter listesi (kasaba filtresi uygulanır) ---
  if (!arama) {
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

  // --- Arama VARKEN: eşya görünümü (pazar mantığı) ---
  baslik.innerHTML = "<tr><th>Adet</th><th>Eşya</th><th>Karakter</th><th>Kasaba</th></tr>";
  const filtreli = envanterSatirlari.filter((s) => {
    const isimUyar = s.isim.toLocaleLowerCase("tr-TR").includes(arama);
    const kasabaUyar = !kasabaFiltre || s.kasaba === kasabaFiltre;
    return isimUyar && kasabaUyar;
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

// ---------------------------------------------------------
// GELİŞİM SEKMESİ
// Veri: gelisim.json (pazar_json_uret.py, botun her gün yazdığı
// Gelisim_Durumu_*.txt dosyalarının en güncel iki gününü karşılaştırır).
// Her stat hücresinde düne göre fark rozeti: ▲ yeşil artış, = sarı sabit,
// ▼ kırmızı düşüş. Başlık yapışkandır, sütuna tıklayınca sıralanır.
// ---------------------------------------------------------
let gelisimKarakterler = [];
let gelisimSiralama = { anahtar: "kuvvet", azalan: true }; // varsayılan: KP'ye göre

const GELISIM_SUTUNLAR = [
  { anahtar: "karakter", etiket: "Karakter", sayisal: false },
  { anahtar: "kasaba", etiket: "Kasaba", sayisal: false },
  { anahtar: "meslek", etiket: "Meslek", sayisal: false },
  { anahtar: "yol", etiket: "Yol", sayisal: false },
  { anahtar: "seviye", etiket: "Seviye", sayisal: true },
  { anahtar: "kuvvet", etiket: "Kuvvet", sayisal: true },
  { anahtar: "zeka", etiket: "Zeka", sayisal: true },
  { anahtar: "karizma", etiket: "Karizma", sayisal: true },
  { anahtar: "guven", etiket: "Güven", sayisal: true },
  { anahtar: "akce", etiket: "Akçe", sayisal: true, ondalik: true },
];

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
    if (sutun.sayisal) return (a[sutun.anahtar] - b[sutun.anahtar]) * yon;
    return String(a[sutun.anahtar]).localeCompare(String(b[sutun.anahtar]), "tr") * yon;
  }).forEach((k) => {
    const dun = k.dun;
    const hucreler = GELISIM_SUTUNLAR.map((s) => {
      if (!s.sayisal) return `<td class="gelisim-metin">${k[s.anahtar]}</td>`;
      const deger = s.ondalik ? akceFormat(k[s.anahtar]) : k[s.anahtar];
      const rozet = farkRozeti(k[s.anahtar], dun ? dun[s.anahtar] : null, s.ondalik);
      return `<td>${deger}${rozet}</td>`;
    }).join("");
    const satir = document.createElement("tr");
    satir.innerHTML = hucreler;
    govde.appendChild(satir);
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

const KASABA_DISI_ETIKETLER = ["Şehir Dışı", "İnzivada", "Arafta", "Öldü", "Ara Nokta", "Profil Yok", "Bilinmiyor"];

function konumRozetSinifi(konum) {
  if (konum === "İnzivada" || konum === "Arafta") return "konum-rozet konum-inziva";
  if (konum === "Öldü" || konum === "Profil Yok") return "konum-rozet konum-oldu";
  if (KASABA_DISI_ETIKETLER.includes(konum)) return "konum-rozet konum-disari";
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
  const disarida = hareketKayitlari.filter((k) => KASABA_DISI_ETIKETLER.includes(k.su_anki_konum)).length;

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

// Öne çıkan bulgular: ham tablo yerine okunabilir cümleler.
function oneCikanlariCiz() {
  const kap = document.getElementById("one-cikanlar");
  const dikkat = multiCiftler.filter((c) => c.skor >= 3);

  if (!dikkat.length && !multiKumeler.length) {
    kap.innerHTML =
      `<p class="bos-durum">Bugün dikkate değer bir bulgu yok. ` +
      `Kayıtlar tutulmaya devam ediyor — aynı hesaplar tekrar birlikte hareket ederse burada görünecek.</p>`;
    return;
  }

  let html = "";

  if (multiKumeler.length) {
    html += `<div class="bulgu-blok">` +
      `<h4>👥 Birlikte hareket eden gruplar</h4>` +
      multiKumeler.map((k) =>
        `<p class="bulgu-satir"><strong>${k.kisi_sayisi} hesap:</strong> ${k.aciklama.replace(/^[^:]*:\s*/, "")}</p>`
      ).join("") +
      `</div>`;
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
// ---------------------------------------------------------
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
  document.getElementById("sakinler-ozet").innerHTML =
    `<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">👥 Toplam</span><span class="ozet-deger">${sakinlerListesi.length}</span></div>` +
    [...sayim.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
      `<div class="ozet-kart"><span class="ozet-etiket">${k}</span><span class="ozet-deger">${n}</span></div>`
    ).join("");

  sakinlerTabloCiz();
}

function sakinlerTabloCiz() {
  const arama = document.getElementById("sakinler-arama").value.trim().toLocaleLowerCase("tr-TR");
  const kasabaFiltre = document.getElementById("sakinler-kasaba-filtre").value;

  const filtreli = sakinlerListesi.filter((s) =>
    (!arama || s.karakter.toLocaleLowerCase("tr-TR").includes(arama)) &&
    (!kasabaFiltre || s.kasaba === kasabaFiltre)
  );

  const govde = document.getElementById("sakinler-tablo-govde");
  govde.innerHTML = "";
  filtreli.forEach((s) => {
    const satir = document.createElement("tr");
    satir.innerHTML = `<td>${s.karakter}</td>` +
      `<td><span class="konum-rozet">${s.kasaba}</span></td>` +
      `<td>${s.pr >= 0 ? s.pr : "-"}</td>`;
    govde.appendChild(satir);
  });
  document.getElementById("sakinler-sonuc-yok").hidden = filtreli.length !== 0;
}

document.getElementById("sakinler-arama").addEventListener("input", sakinlerTabloCiz);
document.getElementById("sakinler-kasaba-filtre").addEventListener("change", sakinlerTabloCiz);

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
    const donemler = c.ortak_donemler.map((o) =>
      o.tam
        ? `<li><strong>${o.giris} → ${o.cikis}</strong> <span class="tam-eslesme">giriş ve çıkış aynı gün ✓</span></li>`
        : `<li>${o.giris} → <span class="fark">(çıkış eşleşmedi / hâlâ dışarıda)</span></li>`
    ).join("");

    const rozetler =
      `<span class="skor-rozet ${skorSinifi(c.degerlendirme)}">${c.degerlendirme} · skor ${c.skor}</span>` +
      `<span class="skor-rozet">${c.eslesme_sayisi} kez aynı gün kasabadan ayrıldı</span>` +
      (c.tam_eslesme ? `<span class="skor-rozet skor-tam">${c.tam_eslesme} kez aynı gün geri döndü</span>` : "") +
      (c.ayni_aile ? `<span class="skor-rozet skor-kirmizi">Aynı aile</span>` : "") +
      (c.ayni_kayit_donemi
        ? `<span class="skor-rozet skor-kirmizi">${c.kayit_fark_gun} gün arayla açılmış</span>`
        : "");

    const not = (c.tam_eslesme >= 2 && !c.ayni_aile)
      ? `<p class="multi-uyari">💡 Aile bağı yok ama ${c.tam_eslesme} kez birebir aynı tarihlerde girip çıkmışlar — bağ kurulmasın diye ayrı ailelere girmiş olabilirler.</p>`
      : "";

    // Dilekçeye dahil etme kutusu. Varsayılan olarak SADECE dikkate değer
    // vakalar işaretli gelir (tekrar eden eşzamanlılık, aynı aile veya yakın
    // kayıt tarihi). "Zayıf (tek gözlem)" olanlar işaretsiz gelir — yoksa
    // dilekçe, tek bir günün rastgele eşleşmeleriyle dolup anlamsızlaşıyor.
    // İstersen tek tıkla ekleyebilirsin.
    const dikkateDeger = c.skor >= 3;
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

  grupYaz("🔴 Birlikte ayrılanlar", grupla(hareketKayiplar, "giris_tarihi"), "Ayrılış");
  grupYaz("🟢 Birlikte dönenler", grupla(inzivaDonusler, "cikis_tarihi"), "Dönüş");

  kap.innerHTML = bloklar.length
    ? bloklar.join("")
    : `<p class="bos-durum">Aynı gün birlikte hareket eden grup tespit edilmedi.</p>`;
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

document.getElementById("rota-bul-btn").addEventListener("click", () => {
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

pazarYukle();
envanterYukle();
gelisimYukle();
hareketYukle();
haritaYukle();

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
haritaYukle();

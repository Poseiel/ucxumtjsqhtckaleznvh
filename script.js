// script.js
// Bu dosya tamamen orijinaldir; herhangi bir üçüncü taraf sitesinden kod
// alınmamıştır. Veriler (harita_render.json, pazar.json) kendi
// hesaplarımızdan/botumuzdan üretilir.

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
haritaYukle();

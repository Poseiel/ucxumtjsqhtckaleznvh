/* ==========================================================================
   🚢 DENİZ ROTASI SEKMESİ — 27.08.2026
   --------------------------------------------------------------------------
   Kare kare su/kara haritamızı çizer, iki liman seçince gemi rotasını
   hesaplayıp üzerine oklarla işaretler. Yaklaştırma (tekerlek) ve kaydırma
   (sürükleme) var.

   ⚠️⚠️ OYUNUN HARİTA GÖRSELİ KULLANILMAZ. Buradaki her şey `deniz.json`
        içindeki kendi verimizden ÇİZİLİR (kare kare su/kara + kasaba
        koordinatları). Sitenin altbilgisindeki söz burada da geçerlidir.

   Veri: docs/deniz.json  ← `deniz_haritasi_uret.py --site` üretir.
   Rota: botun kullandığı mantığın AYNISI (8 yön, kıyıdan uzak durma
         tercihi) — burada gözle doğrulanabilsin diye.
   ========================================================================== */

const DENIZ = {
  veri: null,
  su: null,            // Set("x,y")
  kanvas: null,
  ctx: null,
  olcek: 4,            // piksel / kare
  ox: 0,
  oy: 0,               // kaydırma (piksel)
  surukle: null,
  baslangic: null,     // {ad,x,y}
  bitis: null,
  rota: null,
  kiyi: null,          // Map("x,y" -> kıyıya uzaklık)
};

const DENIZ_KIYI_PAYI = 2;      // botla aynı: kıyıdan 2 kare uzak durmayı yeğle
const DENIZ_KIYI_BEDELI = 0.6;  // botla aynı

function denizAnahtar(x, y) { return x + "," + y; }

async function denizYukle() {
  if (DENIZ.veri) return true;
  try {
    const c = await fetch("deniz.json", { cache: "no-store" });
    if (!c.ok) throw new Error("deniz.json bulunamadı");
    DENIZ.veri = await c.json();
  } catch (e) {
    const d = document.getElementById("deniz-durum");
    if (d) d.textContent = "Harita verisi yüklenemedi: " + e.message;
    return false;
  }
  DENIZ.su = new Set();
  const su = DENIZ.veri.su || {};
  for (const y in su) {
    for (const x of su[y]) DENIZ.su.add(denizAnahtar(x, Number(y)));
  }
  DENIZ.kiyi = denizKiyiHesapla();
  denizLimanKutusuDoldur();
  return true;
}

/* Her su karesinin kıyıya uzaklığı (0..pay) — bot tarafındakiyle aynı fikir. */
function denizKiyiHesapla() {
  const uz = new Map();
  let kenar = [];
  for (const k of DENIZ.su) {
    const [x, y] = k.split(",").map(Number);
    let kiyida = false;
    for (let a = -1; a <= 1 && !kiyida; a++) {
      for (let b = -1; b <= 1; b++) {
        if ((a || b) && !DENIZ.su.has(denizAnahtar(x + a, y + b))) { kiyida = true; break; }
      }
    }
    if (kiyida) { uz.set(k, 0); kenar.push([x, y]); }
  }
  for (let d = 1; d <= DENIZ_KIYI_PAYI && kenar.length; d++) {
    const yeni = [];
    for (const [x, y] of kenar) {
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          if (!a && !b) continue;
          const k = denizAnahtar(x + a, y + b);
          if (DENIZ.su.has(k) && !uz.has(k)) { uz.set(k, d); yeni.push([x + a, y + b]); }
        }
      }
    }
    kenar = yeni;
  }
  return uz;
}

/* ---------- rota (botun mantığıyla aynı: Dijkstra + kıyı bedeli) ---------- */
function denizRotaBul(bas, hed) {
  const cikislar = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const k = denizAnahtar(bas.x + a, bas.y + b);
      if (DENIZ.su.has(k)) cikislar.push(k);
    }
  }
  const varislar = new Set();
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const k = denizAnahtar(hed.x + a, hed.y + b);
      if (DENIZ.su.has(k)) varislar.add(k);
    }
  }
  if (!cikislar.length || !varislar.size) return null;

  const maliyet = new Map(), onceki = new Map();
  const kuyruk = [];
  for (const k of cikislar) { maliyet.set(k, 0); kuyruk.push([0, k]); }
  let varis = null;
  while (kuyruk.length) {
    kuyruk.sort((p, q) => p[0] - q[0]);
    const [m, kare] = kuyruk.shift();
    if (m > (maliyet.get(kare) ?? Infinity)) continue;
    if (varislar.has(kare)) { varis = kare; break; }
    const [x, y] = kare.split(",").map(Number);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const k = denizAnahtar(x + a, y + b);
        if (!DENIZ.su.has(k)) continue;
        const ku = DENIZ.kiyi.get(k);
        const ek = (ku !== undefined && ku < DENIZ_KIYI_PAYI)
          ? DENIZ_KIYI_BEDELI * (DENIZ_KIYI_PAYI - ku) : 0;
        const yeni = m + 1 + ek;
        if (yeni < (maliyet.get(k) ?? Infinity)) {
          maliyet.set(k, yeni); onceki.set(k, kare); kuyruk.push([yeni, k]);
        }
      }
    }
  }
  if (!varis) return null;
  const yol = [];
  let k = varis;
  while (k !== undefined) { yol.push(k.split(",").map(Number)); k = onceki.get(k); }
  yol.reverse();
  return yol;
}

/* ---------- çizim ---------- */
function denizCiz() {
  const c = DENIZ.kanvas, ctx = DENIZ.ctx;
  if (!c || !ctx) return;
  const G = c.width, Y = c.height;
  ctx.clearRect(0, 0, G, Y);
  ctx.fillStyle = "#dfe6d8";                 // kara zemin
  ctx.fillRect(0, 0, G, Y);

  const o = DENIZ.olcek;
  const x0 = Math.floor(-DENIZ.ox / o), x1 = Math.ceil((G - DENIZ.ox) / o);
  const y0 = Math.floor(-DENIZ.oy / o), y1 = Math.ceil((Y - DENIZ.oy) / o);

  // su kareleri
  ctx.fillStyle = "#8fc4e8";
  for (const k of DENIZ.su) {
    const [x, y] = k.split(",").map(Number);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    ctx.fillRect(x * o + DENIZ.ox, y * o + DENIZ.oy, o, o);
  }

  // ızgara (yakınken)
  if (o >= 8) {
    ctx.strokeStyle = "rgba(0,0,0,.07)";
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x++) {
      ctx.beginPath();
      ctx.moveTo(x * o + DENIZ.ox, 0); ctx.lineTo(x * o + DENIZ.ox, Y); ctx.stroke();
    }
    for (let y = y0; y <= y1; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * o + DENIZ.oy); ctx.lineTo(G, y * o + DENIZ.oy); ctx.stroke();
    }
  }

  // limanlar
  for (const [ad, x, y, sev] of (DENIZ.veri.limanlar || [])) {
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const px = x * o + DENIZ.ox + o / 2, py = y * o + DENIZ.oy + o / 2;
    ctx.fillStyle = sev >= 4 ? "#b8471f" : "#7a4a12";
    ctx.beginPath(); ctx.arc(px, py, Math.max(2, o * 0.28), 0, 7); ctx.fill();
    if (o >= 10) {
      ctx.fillStyle = "#2b2b2b";
      ctx.font = Math.max(9, o * 0.7) + "px sans-serif";
      ctx.fillText(ad, px + o * 0.5, py - o * 0.4);
    }
  }

  // rota
  if (DENIZ.rota && DENIZ.rota.length > 1) {
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = Math.max(2, o * 0.35);
    ctx.lineJoin = "round";
    ctx.beginPath();
    DENIZ.rota.forEach(([x, y], i) => {
      const px = x * o + DENIZ.ox + o / 2, py = y * o + DENIZ.oy + o / 2;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    // her N karede bir yön oku
    const adim = o >= 10 ? 3 : (o >= 6 ? 5 : 9);
    ctx.fillStyle = "#7b241c";
    for (let i = adim; i < DENIZ.rota.length; i += adim) {
      const [ax, ay] = DENIZ.rota[i - 1], [bx, by] = DENIZ.rota[i];
      const px = bx * o + DENIZ.ox + o / 2, py = by * o + DENIZ.oy + o / 2;
      const aci = Math.atan2(by - ay, bx - ax);
      const r = Math.max(3, o * 0.45);
      ctx.beginPath();
      ctx.moveTo(px + r * Math.cos(aci), py + r * Math.sin(aci));
      ctx.lineTo(px + r * Math.cos(aci + 2.5), py + r * Math.sin(aci + 2.5));
      ctx.lineTo(px + r * Math.cos(aci - 2.5), py + r * Math.sin(aci - 2.5));
      ctx.closePath(); ctx.fill();
    }
  }

  // seçili uçlar
  [[DENIZ.baslangic, "#1e8449", "A"], [DENIZ.bitis, "#8e44ad", "B"]].forEach(
    ([n, renk, harf]) => {
      if (!n) return;
      const px = n.x * o + DENIZ.ox + o / 2, py = n.y * o + DENIZ.oy + o / 2;
      ctx.strokeStyle = renk; ctx.lineWidth = 3;
      ctx.strokeRect(n.x * o + DENIZ.ox, n.y * o + DENIZ.oy, o, o);
      ctx.fillStyle = renk;
      ctx.font = "bold " + Math.max(11, o) + "px sans-serif";
      ctx.fillText(harf, px + o * 0.6, py - o * 0.6);
    });
}

/* ---------- etkileşim ---------- */
function denizOdakla(n, olcek) {
  if (olcek) DENIZ.olcek = olcek;
  const c = DENIZ.kanvas;
  DENIZ.ox = c.width / 2 - n.x * DENIZ.olcek;
  DENIZ.oy = c.height / 2 - n.y * DENIZ.olcek;
  denizCiz();
}

function denizLimanKutusuDoldur() {
  const secenekler = (DENIZ.veri.limanlar || [])
    .map(([ad, x, y]) => `<option value="${ad}">${ad}</option>`).join("");
  ["deniz-bas", "deniz-bit"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">— liman seç —</option>' + secenekler;
  });
}

function denizLimanBul(ad) {
  const l = (DENIZ.veri.limanlar || []).find((k) => k[0] === ad);
  return l ? { ad: l[0], x: l[1], y: l[2] } : null;
}

function denizHesapla() {
  const durum = document.getElementById("deniz-durum");
  if (!DENIZ.baslangic || !DENIZ.bitis) {
    if (durum) durum.textContent = "İki liman seçin.";
    DENIZ.rota = null; denizCiz(); return;
  }
  const t0 = performance.now();
  DENIZ.rota = denizRotaBul(DENIZ.baslangic, DENIZ.bitis);
  const sure = Math.round(performance.now() - t0);
  if (!DENIZ.rota) {
    if (durum) durum.textContent =
      `${DENIZ.baslangic.ad} → ${DENIZ.bitis.ad}: deniz yolu BULUNAMADI.`;
  } else {
    const hamle = DENIZ.rota.length - 1;
    const gun = Math.ceil(hamle / 10);
    if (durum) durum.textContent =
      `${DENIZ.baslangic.ad} → ${DENIZ.bitis.ad}: ${hamle} hamle ` +
      `(mürettebat tamsa günde 10 hamle → ~${gun} gün) · ${sure} ms`;
  }
  denizCiz();
}

function denizKur() {
  const c = document.getElementById("deniz-kanvas");
  if (!c || c.dataset.kuruldu) return;
  c.dataset.kuruldu = "1";
  DENIZ.kanvas = c;
  DENIZ.ctx = c.getContext("2d");

  const boyutla = () => {
    c.width = c.clientWidth;
    c.height = c.clientHeight;
    denizCiz();
  };
  window.addEventListener("resize", boyutla);

  c.addEventListener("mousedown", (e) => {
    DENIZ.surukle = { x: e.clientX, y: e.clientY, ox: DENIZ.ox, oy: DENIZ.oy, hareket: 0 };
  });
  window.addEventListener("mouseup", () => { DENIZ.surukle = null; });
  window.addEventListener("mousemove", (e) => {
    if (!DENIZ.surukle) return;
    const dx = e.clientX - DENIZ.surukle.x, dy = e.clientY - DENIZ.surukle.y;
    DENIZ.surukle.hareket = Math.abs(dx) + Math.abs(dy);
    DENIZ.ox = DENIZ.surukle.ox + dx;
    DENIZ.oy = DENIZ.surukle.oy + dy;
    denizCiz();
  });
  c.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const kx = (mx - DENIZ.ox) / DENIZ.olcek, ky = (my - DENIZ.oy) / DENIZ.olcek;
    const yeni = Math.min(28, Math.max(1.5,
      DENIZ.olcek * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    DENIZ.olcek = yeni;
    DENIZ.ox = mx - kx * yeni;
    DENIZ.oy = my - ky * yeni;
    denizCiz();
  }, { passive: false });

  // Kareye tıklayınca en yakın limanı uç olarak seç
  c.addEventListener("click", (e) => {
    if (DENIZ.surukle && DENIZ.surukle.hareket > 4) return;
    const r = c.getBoundingClientRect();
    const kx = Math.floor((e.clientX - r.left - DENIZ.ox) / DENIZ.olcek);
    const ky = Math.floor((e.clientY - r.top - DENIZ.oy) / DENIZ.olcek);
    let en = null, enUz = 9;
    for (const [ad, x, y] of (DENIZ.veri.limanlar || [])) {
      const u = Math.max(Math.abs(x - kx), Math.abs(y - ky));
      if (u < enUz) { enUz = u; en = { ad, x, y }; }
    }
    if (!en) return;
    if (!DENIZ.baslangic || (DENIZ.baslangic && DENIZ.bitis)) {
      DENIZ.baslangic = en; DENIZ.bitis = null; DENIZ.rota = null;
      document.getElementById("deniz-bas").value = en.ad;
      document.getElementById("deniz-bit").value = "";
    } else {
      DENIZ.bitis = en;
      document.getElementById("deniz-bit").value = en.ad;
    }
    denizHesapla();
  });

  ["deniz-bas", "deniz-bit"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const n = denizLimanBul(el.value);
      if (id === "deniz-bas") DENIZ.baslangic = n; else DENIZ.bitis = n;
      if (n) denizOdakla(n, Math.max(DENIZ.olcek, 6));
      denizHesapla();
    });
  });

  const sifirla = document.getElementById("deniz-sifirla");
  if (sifirla) sifirla.addEventListener("click", () => {
    DENIZ.baslangic = DENIZ.bitis = DENIZ.rota = null;
    document.getElementById("deniz-bas").value = "";
    document.getElementById("deniz-bit").value = "";
    DENIZ.olcek = 4; DENIZ.ox = -55 * 4; DENIZ.oy = -20 * 4;
    denizHesapla();
  });

  boyutla();
}

/* Sekmeye ilk geçişte yükle (sayfa açılışını yavaşlatmasın). */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector('.tab-btn[data-tab="deniz"]');
  if (!btn) return;
  btn.addEventListener("click", async () => {
    denizKur();
    if (await denizYukle()) {
      if (!DENIZ.ox && !DENIZ.oy) { DENIZ.ox = -55 * DENIZ.olcek; DENIZ.oy = -20 * DENIZ.olcek; }
      denizCiz();
      const d = document.getElementById("deniz-durum");
      if (d && !DENIZ.rota) {
        d.textContent = `Harita hazır: ${DENIZ.su.size.toLocaleString("tr")} su karesi, ` +
          `${(DENIZ.veri.limanlar || []).length} liman. İki liman seçin ya da haritaya tıklayın.`;
      }
    }
  });
});

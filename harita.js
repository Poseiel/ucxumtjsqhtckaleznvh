/* ==========================================================================
   🗺️ HARİTA & ROTA — 27.08.2026
   --------------------------------------------------------------------------
   Tek sekmede KARA + DENİZ + KARA→DENİZ→KARA rotası. Oyunun gerçek harita
   kutucukları üzerinde, yaklaştırmalı/kaydırmalı (Leaflet).

   ⚠️ Kutucuklar bu depoya KOPYALANMAZ — tarayıcı doğrudan herkese açık
      `kmanev/RKMap` deposundan çeker (kralstvata.com'un yaptığının aynısı).
      Böylece sitemiz kimsenin dosyasını yeniden yayınlamaz ve depo şişmez
      (2143 kutucuk ≈ 700 MB).

   KOORDİNAT (sitenin kendi kodundan, tahmin değil):
       piksel_x = (oyun_X - 60) * 80 + 40
       piksel_y = (oyun_Y - 25) * 80 + 40      görsel 19200 × 21200

   GÜN HESABI (oyunun kendi formülü):
       kara:  jetonsuz ceil(adım/2) · jetonlu ("tanrılara ödeme") ceil(adım/3)
       deniz: mürettebat tamsa günde 10 hamle
   ========================================================================== */

const RK = {
  veri: null,
  map: null,
  rc: null,
  katman: [],          // çizilen rota parçaları
  bas: null,           // {id, x, y, ad}
  bit: null,
  su: null,            // Set("x,y")
  isaret: [],
};

window.RK = RK;   // panel.js adresle gelince harita boyutunu tazelemek için bakar
const RK_TILE = "https://raw.githubusercontent.com/kmanev/RKMap/master/{z}/{x}/{y}.png";
const RK_GORSEL = [19200, 21200];
const RK_KARE = 80, RK_DX = 60, RK_DY = 25;

/* Deniz: kıyıdan uzak durma tercihi (botla aynı) */
const RK_KIYI_PAYI = 2, RK_KIYI_BEDELI = 0.6;
/* Gün maliyetleri — tek bir "gün" birimine çevirip birlikte hesaplarız */
const RK_DENIZ_HAMLE_GUN = 1 / 10;     // günde 10 hamle
/* ⚠️ Gemiye binmek grupta değilsen ANIDIR (oyun rehberi + kullanıcı);
   inmek 1 gün sürer. Eskiden ikisi de 1 gün sayılıyordu ve limandan
   çıkarken olmayan bir "kara adımı" görünüyordu. */
const RK_BINIS_GUN = 0.05;             // pratikte anında
const RK_INIS_GUN = 1;                 // gemiden inmek 1 gün
/* Zorlanmış kare (aslında kara) — sadece limana girip çıkmak için. */
const RK_ZORLANMIS_BEDELI = 0.8;
/* 🌑 Derin (koyu) su — açık Atlantik'te oyun seyahate izin vermiyor
   (29.08.2026, Anıl ölçtü ve haritada kırmızıyla çizdi).

   ⚠️⚠️ BU SAYI `kaptan_modul.DERIN_BEDELI` İLE **AYNI OLMAK ZORUNDA.**
   Kullanıcı kuralı (29.08.2026): *"botun kendisi nasıl davranacaksa
   sitede öyle davransın."* Site, botun ne yapacağını ÖNCEDEN GÖRMEK için
   var; iki taraf farklı olursa site yanlış rota gösterir ve plan boşa
   gider.
   ⚠️ Bir tarafı değiştirirsen DİĞERİNİ DE değiştir:
        kaptan_modul.py  → DERIN_BEDELI
        docs/harita.js   → RK_DERIN_BEDELI
   ⚠️ Bedel bir TERCİHTİR, yasak değil (kullanıcı: *"meyilli ol,
      engelleme değil"*): başka yol yoksa derin sudan yine geçilir —
      o durumda rota metnine uyarı satırı düşer. */
const RK_DERIN_BEDELI = 3.0;
/* Yön değiştirme cezası — düz gitmeyi yeğlet (zikzak çözümü). */
const RK_DONUS_BEDELI = 0.004;

function rkAnahtar(x, y) { return x + "," + y; }
function rkPiksel(x, y) { return [(x - RK_DX) * RK_KARE + RK_KARE / 2,
                                  (y - RK_DY) * RK_KARE + RK_KARE / 2]; }

/* ---------------- ikili yığın (hızlı öncelik kuyruğu) ---------------- */
class RKYigin {
  constructor() { this.a = []; }
  get boy() { return this.a.length; }
  it(m, d) {
    const a = this.a; a.push([m, d]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  cek() {
    const a = this.a, ust = a[0], son = a.pop();
    if (a.length) {
      a[0] = son;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let k = i;
        if (l < a.length && a[l][0] < a[k][0]) k = l;
        if (r < a.length && a[r][0] < a[k][0]) k = r;
        if (k === i) break;
        [a[k], a[i]] = [a[i], a[k]]; i = k;
      }
    }
    return ust;
  }
}

/* ---------------- veri ---------------- */
async function rkYukle() {
  if (RK.veri) return true;
  const d = document.getElementById("rk-durum");
  try {
    const c = await fetch("deniz.json", { cache: "no-store" });
    if (!c.ok) throw new Error("deniz.json bulunamadı");
    RK.veri = await c.json();
  } catch (e) {
    if (d) d.textContent = "Harita verisi yüklenemedi: " + e.message;
    return false;
  }
  RK.su = new Set();
  for (const y in RK.veri.su) {
    for (const x of RK.veri.su[y]) RK.su.add(rkAnahtar(x, Number(y)));
  }
  // ⚠️ Gerçek suda OLMAYAN, yalnızca limana girip çıkmak için açılmış
  //    kareler. Bunlar PAHALI sayılır; yoksa rota onları kestirme diye
  //    kullanıp KARADAN geçiyordu (kullanıcının "Stirling çıkışı" ekran
  //    görüntüsündeki hata).
  RK.zorlanmis = new Set(RK.veri.zorlanmis || []);
  // 🌑 Derin (koyu) su kareleri — veri yoksa küme boş = eski davranış.
  RK.derin = new Set();
  for (const y in (RK.veri.derin || {})) {
    for (const x of RK.veri.derin[y]) RK.derin.add(rkAnahtar(x, Number(y)));
  }
  RK.limanSet = new Set(RK.veri.limanlar.map((l) => l[0]));
  rkKutulariDoldur();
  return true;
}

function rkKutulariDoldur() {
  const liste = [];
  for (const id in RK.veri.dugumler) {
    const [x, y, ad] = RK.veri.dugumler[id];
    if (ad) liste.push([ad, id]);
  }
  liste.sort((a, b) => a[0].localeCompare(b[0], "tr"));
  const html = '<option value="">— şehir seç —</option>' +
    liste.map(([ad, id]) => `<option value="${id}">${ad}</option>`).join("");
  ["rk-bas", "rk-bit"].forEach((i) => {
    const el = document.getElementById(i);
    if (el) el.innerHTML = html;
  });
}

/* ---------------- KARA rotası (adım sayısı) ---------------- */
function rkKaraMesafe(baslangicId) {
  const uz = new Map([[String(baslangicId), 0]]);
  const onc = new Map();
  let sira = [String(baslangicId)];
  while (sira.length) {
    const yeni = [];
    for (const n of sira) {
      for (const k of (RK.veri.komsu[n] || [])) {
        const s = String(k);
        if (!uz.has(s)) { uz.set(s, uz.get(n) + 1); onc.set(s, n); yeni.push(s); }
      }
    }
    sira = yeni;
  }
  return { uz, onc };
}

function rkKaraYol(onc, hedefId) {
  const yol = [];
  let k = String(hedefId);
  while (k !== undefined) { yol.push(k); k = onc.get(k); }
  return yol.reverse();
}

/* ---------------- DENİZ rotası (kare kare) ---------------- */
function rkDenizKiyi() {
  if (RK._kiyi) return RK._kiyi;
  const uz = new Map(); let kenar = [];
  for (const k of RK.su) {
    const [x, y] = k.split(",").map(Number);
    let kiyi = false;
    for (let a = -1; a <= 1 && !kiyi; a++)
      for (let b = -1; b <= 1; b++)
        if ((a || b) && !RK.su.has(rkAnahtar(x + a, y + b))) { kiyi = true; break; }
    if (kiyi) { uz.set(k, 0); kenar.push([x, y]); }
  }
  for (let d = 1; d <= RK_KIYI_PAYI && kenar.length; d++) {
    const y2 = [];
    for (const [x, y] of kenar)
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          if (!a && !b) continue;
          const k = rkAnahtar(x + a, y + b);
          if (RK.su.has(k) && !uz.has(k)) { uz.set(k, d); y2.push([x + a, y + b]); }
        }
    kenar = y2;
  }
  RK._kiyi = uz;
  return uz;
}

/* Hangi deniz karesinden hangi limana çıkılabilir — BİR KEZ hesaplanır.
   ⚠️ Bu olmadan birleşik rota her deniz karesinde 361 limanı tarıyordu
      (28.000 × 361 ≈ 10 milyon işlem) ve tarayıcı donuyordu. */
function rkLimanKomsulari() {
  if (RK._limanKomsu) return RK._limanKomsu;
  const m = new Map();
  for (const [lid] of RK.veri.limanlar) {
    const [lx, ly] = RK.veri.dugumler[lid];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const k = rkAnahtar(lx + a, ly + b);
        if (!RK.su.has(k)) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(lid);
      }
  }
  RK._limanKomsu = m;
  return m;
}

/* Limandan denize açılan kareler */
function rkLimanCikis(id) {
  const [x, y] = RK.veri.dugumler[id];
  const c = [];
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const k = rkAnahtar(x + a, y + b);
      if (RK.su.has(k)) c.push(k);
    }
  return c;
}

/* ---------------- BİRLEŞİK rota: kara + deniz + kara ---------------- */
/* Tek bir Dijkstra: düğümler "K<id>" (kara) ve "D x,y" (deniz kareleri).
   Maliyet birimi GÜN. Kara adımı 1/2 (jetonluysa 1/3) gün, deniz hamlesi
   1/10 gün, binme/inme 1'er gün.                                        */
function rkBirlesikRota(basId, bitId, jeton) {
  const karaAdimGun = jeton ? 1 / 3 : 1 / 2;
  const kiyi = rkDenizKiyi();
  const limanKomsu = rkLimanKomsulari();
  const uz = new Map(), onc = new Map();
  const y = new RKYigin();
  const bas = "K" + basId, hedefDugum = "K" + bitId;
  uz.set(bas, 0); y.it(0, bas);

  while (y.boy) {
    const [m, n] = y.cek();
    if (m > (uz.get(n) ?? Infinity)) continue;
    if (n === hedefDugum) break;

    if (n[0] === "K") {
      const id = n.slice(1);
      // kara komşuları
      for (const k of (RK.veri.komsu[id] || [])) {
        const s = "K" + k, yeni = m + karaAdimGun;
        if (yeni < (uz.get(s) ?? Infinity)) { uz.set(s, yeni); onc.set(s, n); y.it(yeni, s); }
      }
      // limansa gemiye bin
      if (RK.limanSet.has(Number(id))) {
        for (const k of rkLimanCikis(id)) {
          const s = "D" + k, yeni = m + RK_BINIS_GUN;   // yön yok = ilk hamle
          if (yeni < (uz.get(s) ?? Infinity)) { uz.set(s, yeni); onc.set(s, n); y.it(yeni, s); }
        }
      }
    } else {
      // "D<x>,<y>|<dx><dy>" — yön, zikzak cezası için durumda taşınır.
      const boru = n.indexOf("|");
      const kare = boru < 0 ? n.slice(1) : n.slice(1, boru);
      const yon = boru < 0 ? null : Number(n.slice(boru + 1));
      const [x, yy] = kare.split(",").map(Number);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          if (!a && !b) continue;
          const k = rkAnahtar(x + a, yy + b);
          if (!RK.su.has(k)) continue;
          const ku = kiyi.get(k);
          let ek = (ku !== undefined && ku < RK_KIYI_PAYI)
            ? RK_KIYI_BEDELI * (RK_KIYI_PAYI - ku) * RK_DENIZ_HAMLE_GUN : 0;
          // Zorlanmış kare = aslında kara. Sadece limana girip çıkmak için
          // kullanılsın diye ağır bedel.
          if (RK.zorlanmis.has(k)) ek += RK_ZORLANMIS_BEDELI;
          // 🌑 Derin (koyu) su — açık okyanusta oyun izin vermiyor.
          if (RK.derin.has(k)) ek += RK_DERIN_BEDELI * RK_DENIZ_HAMLE_GUN;
          // Yön değiştirmeye küçük ceza — eşit maliyetli yollar arasından
          // DÜZ olanı seçilsin (yoksa açık denizde zikzak çiziyordu).
          const yonKod = (a + 1) * 3 + (b + 1);      // 0..8, tek rakam
          if (yon !== null && yon !== yonKod) ek += RK_DONUS_BEDELI;
          const s = "D" + k + "|" + yonKod, yeni = m + RK_DENIZ_HAMLE_GUN + ek;
          if (yeni < (uz.get(s) ?? Infinity)) { uz.set(s, yeni); onc.set(s, n); y.it(yeni, s); }
        }
      // yakındaki limana karaya çık (önceden eşlenmiş listeden)
      for (const lid of (limanKomsu.get(kare) || [])) {
        const s = "K" + lid, yeni = m + RK_INIS_GUN;
        if (yeni < (uz.get(s) ?? Infinity)) { uz.set(s, yeni); onc.set(s, n); y.it(yeni, s); }
      }
    }
  }
  if (!uz.has(hedefDugum)) return null;
  const yol = [];
  let k = hedefDugum;
  while (k !== undefined) { yol.push(k); k = onc.get(k); }
  yol.reverse();
  return { yol, gun: uz.get(hedefDugum) };
}

/* ---------------- YALNIZ DENİZ rotası ----------------
   ⚠️ NEDEN AYRI BİR MOD: birleşik rota bazen iki liman arasını KARADAN
      yürüyor. Gemiyle seyahat ederken bu olmaz — gemiyi bir limanda
      bırakıp karadan gidersen onu geri alamayabilirsin (kullanıcı,
      27.08.2026). Bu mod hiç karaya çıkmaz, baştan sona denizdedir.
------------------------------------------------------ */
function rkDenizRota(basId, bitId) {
  if (!RK.limanSet.has(Number(basId)) || !RK.limanSet.has(Number(bitId)))
    return { hata: "İki uç da LİMAN olmalı (gemi yalnız limana yanaşır)." };
  const cikis = rkLimanCikis(basId);
  const varis = new Set(rkLimanCikis(bitId));
  if (!cikis.length || !varis.size)
    return { hata: "Limanlardan biri denize açılmıyor." };

  const kiyi = rkDenizKiyi();
  const uz = new Map(), onc = new Map();
  const y = new RKYigin();
  for (const k of cikis) {
    const s = "D" + k + "|9";
    uz.set(s, 0); y.it(0, s);
  }
  let son = null;
  while (y.boy) {
    const [m, n] = y.cek();
    if (m > (uz.get(n) ?? Infinity)) continue;
    const boru = n.indexOf("|");
    const kare = n.slice(1, boru);
    const yon = Number(n.slice(boru + 1));
    if (varis.has(kare)) { son = n; break; }
    const [x, yy] = kare.split(",").map(Number);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const k = rkAnahtar(x + a, yy + b);
        if (!RK.su.has(k)) continue;
        const ku = kiyi.get(k);
        let ek = (ku !== undefined && ku < RK_KIYI_PAYI)
          ? RK_KIYI_BEDELI * (RK_KIYI_PAYI - ku) * RK_DENIZ_HAMLE_GUN : 0;
        if (RK.zorlanmis.has(k)) ek += RK_ZORLANMIS_BEDELI;
        // 🌑 Derin (koyu) su — açık okyanusta oyun izin vermiyor.
        if (RK.derin.has(k)) ek += RK_DERIN_BEDELI * RK_DENIZ_HAMLE_GUN;
        const yonKod = (a + 1) * 3 + (b + 1);
        if (yon !== 9 && yon !== yonKod) ek += RK_DONUS_BEDELI;
        const s = "D" + k + "|" + yonKod, v = m + RK_DENIZ_HAMLE_GUN + ek;
        if (v < (uz.get(s) ?? Infinity)) { uz.set(s, v); onc.set(s, n); y.it(v, s); }
      }
  }
  if (!son) return { hata: "Bu iki liman arasında DENİZ yolu bulunamadı." };
  const yol = [];
  let k = son;
  while (k !== undefined) { yol.push(k); k = onc.get(k); }
  yol.reverse();
  return { yol };
}

/* ---------------- çizim ---------------- */
function rkTemizle() {
  RK.katman.forEach((k) => RK.map.removeLayer(k));
  RK.katman = [];
}

function rkParcalariCiz(yol) {
  // yolu KARA ve DENİZ parçalarına böl, ayrı renklerle çiz
  const parcalar = [];
  let simdi = null;
  for (const n of yol) {
    const tur = n[0] === "K" ? "kara" : "deniz";
    const ham = n[0] === "K" ? n.slice(1)
      : (n.indexOf("|") < 0 ? n.slice(1) : n.slice(1, n.indexOf("|")));
    const nokta = n[0] === "K"
      ? rkPiksel(RK.veri.dugumler[ham][0], RK.veri.dugumler[ham][1])
      : rkPiksel(...ham.split(",").map(Number));
    const ll = RK.rc.unproject(nokta);
    if (!simdi || simdi.tur !== tur) {
      if (simdi) { simdi.noktalar.push(ll); parcalar.push(simdi); }
      // Yeni parça, önceki parçanın bittiği noktadan başlar (ll zaten
      // ona eklendi) — bu yüzden burada ll'yi TEKRAR eklemiyoruz.
      simdi = { tur, noktalar: [ll] };
    } else simdi.noktalar.push(ll);
  }
  if (simdi) parcalar.push(simdi);

  for (const p of parcalar) {
    if (p.noktalar.length < 2) continue;
    const renk = p.tur === "kara" ? "#2b6cb0" : "#c0392b";
    RK.katman.push(L.polyline(p.noktalar, { color: renk, weight: 4 }).addTo(RK.map));
    if (window.L && L.polylineDecorator) {
      RK.katman.push(L.polylineDecorator(p.noktalar, {
        patterns: [{
          offset: 25, repeat: 60,
          symbol: L.Symbol.arrowHead({
            pixelSize: 13, pathOptions: { fillOpacity: 1, weight: 0, color: renk },
          }),
        }],
      }).addTo(RK.map));
    }
  }
}

function rkUcCiz() {
  [[RK.bas, "#1e8449"], [RK.bit, "#c0392b"]].forEach(([n, renk]) => {
    if (!n) return;
    const p0 = RK.rc.unproject([(n.x - RK_DX) * RK_KARE, (n.y - RK_DY) * RK_KARE]);
    const p1 = RK.rc.unproject([(n.x - RK_DX + 1) * RK_KARE, (n.y - RK_DY + 1) * RK_KARE]);
    RK.katman.push(L.rectangle([p0, p1], { color: renk, weight: 3, fill: false })
      .addTo(RK.map));
  });
}

function rkHesapla() {
  const d = document.getElementById("rk-durum");
  rkTemizle();
  if (!RK.bas || !RK.bit) {
    if (d) d.textContent = "İki şehir seçin (ya da haritaya tıklayın).";
    return;
  }
  rkUcCiz();
  const jeton = document.getElementById("rk-jeton").checked;

  // 1) yalnızca KARA
  const { uz, onc } = rkKaraMesafe(RK.bas.id);
  const karaAdim = uz.get(String(RK.bit.id));
  // 2) birleşik (kara + deniz)
  const t0 = performance.now();
  const bir = rkBirlesikRota(RK.bas.id, RK.bit.id, jeton);
  const ms = Math.round(performance.now() - t0);

  const mod = document.querySelector('input[name="rk-mod"]:checked').value;
  let metin = `${RK.bas.ad} → ${RK.bit.ad}: `;

  if (mod === "deniz") {
    const r = rkDenizRota(RK.bas.id, RK.bit.id);
    if (r.hata) {
      metin += r.hata;
    } else {
      rkParcalariCiz(r.yol);
      const hamle = r.yol.length - 1;
      const gun = Math.ceil(hamle / 10);
      metin += `${hamle} deniz hamlesi = ${gun} gün ` +
        `(mürettebat tam: günde 10) + 1 gün karaya çıkış = ${gun + 1} gün · ` +
        `${ms} ms · hiç karaya çıkılmaz`;
    }
  } else if (mod === "kara") {
    if (karaAdim === undefined) {
      metin += "kara yolu YOK (arada deniz var). 'Kara + Deniz' seçeneğini dene.";
    } else {
      rkParcalariCiz(rkKaraYol(onc, RK.bit.id).map((i) => "K" + i));
      metin += `${karaAdim} adım · ${Math.ceil(karaAdim / 2)} gün ` +
        `(Paşa paketli ${Math.ceil(karaAdim / 3)} gün)`;
    }
  } else {
    if (!bir) {
      metin += "hiçbir yolla ulaşılamıyor.";
    } else {
      rkParcalariCiz(bir.yol);
      const denizHamle = bir.yol.filter((n) => n[0] === "D").length;
      // ⚠️ Kara adımı = yalnızca KARA→KARA geçişleri. Eskiden "K düğümü
      //    sayısı - 1" deniyordu; limandan gemiye binmek de kara adımı
      //    sanılıyor ve her rotada "1 kara adımı" görünüyordu.
      let karaAdimB = 0, inis = 0;
      for (let i = 1; i < bir.yol.length; i++) {
        const o = bir.yol[i - 1][0], y = bir.yol[i][0];
        if (o === "K" && y === "K") karaAdimB++;
        if (o === "D" && y === "K") inis++;      // gemiden inmek 1 gün
      }
      // ⚠️⚠️ GÜN, ARAMA MALİYETİNDEN HESAPLANMAZ. Dijkstra'nın maliyetine
      //    kıyıdan uzak durma ve zikzak cezaları da giriyor; onlar sadece
      //    rotayı SEÇMEK için var, gerçek süre değil. (Ardencaple →
      //    Kirkcudbright 10 hamle = 1 gün yelken; eski hesap 4 gün diyordu.)
      const denizGun = Math.ceil(denizHamle / 10);
      const karaGun = Math.ceil(karaAdimB / (jeton ? 3 : 2));
      const toplam = denizGun + karaGun + inis;
      const parcalar = [];
      if (denizHamle) parcalar.push(
        `${denizHamle} deniz hamlesi = ${denizGun} gün (mürettebat tam: günde 10)`);
      if (karaAdimB) parcalar.push(`${karaAdimB} kara adımı = ${karaGun} gün`);
      if (inis) parcalar.push(`${inis} × karaya çıkış = ${inis} gün`);
      // ⚠️ Rota derin sudan geçiyorsa SÖYLE. Bedel bir tercih olduğu için
      //    başka yol yoksa oradan geçilebiliyor; kullanıcı bunu bilmeli
      //    (oyun açık Atlantik'te seyahate izin vermiyor).
      const derinAdim = bir.yol.filter(
        (n) => n[0] === "D" && RK.derin.has(n.slice(2))).length;
      metin += `${toplam} gün (${parcalar.join(" + ")})` +
        (karaAdim !== undefined
          ? ` · yalnız karadan ${Math.ceil(karaAdim / (jeton ? 3 : 2))} gün` : "") +
        (derinAdim
          ? ` · ⚠️ ${derinAdim} kare DERİN SUDAN geçiyor (oyun izin vermeyebilir)`
          : "") +
        ` · ${ms} ms`;
    }
  }
  if (d) d.textContent = metin;
}

/* ---------------- KARE IZGARASI ----------------
   Kullanıcı isteği: *"kutucuklarda olsun, deniz rotasında hangi kareye
   basacağımızı görürüz"* — bot da kare kare ilerliyor.
   Kademelendirme referans sitenin kendi kodundan alındı:
     büyük  : X'te 20, Y'de 25 karede bir (her zaman)
     orta   : 5 karede bir            (zoom >= 3)
     küçük  : her kare + koordinat etiketi (zoom >= 5)
------------------------------------------------- */
function rkIzgaraKur() {
  const u = (px, py) => RK.rc.unproject([px, py]);
  const G = RK_GORSEL[0], Y = RK_GORSEL[1];

  RK.izgaraBuyuk = L.layerGroup();
  for (let i = 0; i <= 240; i += 20)
    L.polyline([u(i * 80, 0), u(i * 80, Y)],
               { weight: 2, color: "yellow" }).addTo(RK.izgaraBuyuk);
  for (let i = 0; i <= 265; i += 25)
    L.polyline([u(0, i * 80), u(G, i * 80)],
               { weight: 2, color: "orange" }).addTo(RK.izgaraBuyuk);

  RK.izgaraOrta = L.layerGroup();
  for (let i = 0; i <= 240; i += 5)
    if (i % 20) L.polyline([u(i * 80, 0), u(i * 80, Y)],
                           { weight: 2, color: "yellow" }).addTo(RK.izgaraOrta);
  for (let i = 0; i < 265; i += 5)
    if (i % 25) L.polyline([u(0, i * 80), u(G, i * 80)],
                           { weight: 2, color: "orange" }).addTo(RK.izgaraOrta);

  RK.izgaraKucuk = L.layerGroup();
  for (let i = 0; i <= 240; i++)
    if (i % 5) L.polyline([u(i * 80, 0), u(i * 80, Y)],
                          { weight: 1, color: "yellow" }).addTo(RK.izgaraKucuk);
  for (let i = 0; i < 265; i++)
    if (i % 5) L.polyline([u(0, i * 80), u(G, i * 80)],
                          { weight: 1, color: "orange" }).addTo(RK.izgaraKucuk);
  // koordinat etiketleri (10 karede bir) — hangi kare olduğunu okuyabilelim
  for (let i = 0; i < 240; i += 10)
    for (let j = 5; j < 265; j += 10) {
      L.marker(u(i * 80 + 10, j * 80 + 100),
        { icon: L.divIcon({ className: "rk-koord-y", html: (RK_DX + i) }) })
        .addTo(RK.izgaraKucuk);
      L.marker(u(i * 80 + 100, j * 80 + 10),
        { icon: L.divIcon({ className: "rk-koord-o", html: (RK_DY + j) }) })
        .addTo(RK.izgaraKucuk);
    }

  RK.map.on("zoomend", rkIzgaraTazele);
}

/* Yakınlığa göre hangi kademe görünsün (referans siteyle aynı eşikler). */
function rkIzgaraTazele() {
  if (!RK.izgaraBuyuk) return;
  const acik = document.getElementById("rk-izgara");
  const z = RK.map.getZoom();
  const goster = (katman, sart) => {
    if (sart && !RK.map.hasLayer(katman)) RK.map.addLayer(katman);
    if (!sart && RK.map.hasLayer(katman)) RK.map.removeLayer(katman);
  };
  const ac = acik ? acik.checked : true;
  goster(RK.izgaraBuyuk, ac);
  goster(RK.izgaraOrta, ac && z >= 3);
  goster(RK.izgaraKucuk, ac && z >= 5);
}

/* ---------------- kurulum ---------------- */
function rkDugumSec(id) {
  const [x, y, ad] = RK.veri.dugumler[id];
  return { id: Number(id), x, y, ad: ad || ("Düğüm " + id) };
}

async function rkKur() {
  const kap = document.getElementById("rk-harita");
  if (!kap || kap.dataset.kuruldu) return;
  if (!window.L) {
    const d = document.getElementById("rk-durum");
    if (d) d.textContent = "Leaflet yüklenemedi (internet bağlantısı gerekli).";
    return;
  }
  kap.dataset.kuruldu = "1";
  if (!(await rkYukle())) return;

  RK.map = L.map("rk-harita", {
    zoomDelta: 0.25, zoomSnap: 0, bounceAtZoomLimits: false,
    wheelPxPerZoomLevel: 100,
  });
  RK.rc = new L.RasterCoords(RK.map, RK_GORSEL);
  L.tileLayer(RK_TILE, {
    tileSize: 512, noWrap: true, zoomOffset: -1,
    minNativeZoom: 1, maxNativeZoom: 7, minZoom: 1, maxZoom: 7,
    attribution: 'Harita kutucukları: <a href="https://github.com/kmanev/RKMap">kmanev/RKMap</a>',
  }).addTo(RK.map);
  RK.map.setView(RK.rc.unproject([10000, 15000]), 3);

  rkIzgaraKur();
  rkOrduKatmaniCiz();           // 🪖 ordular + ⚓ gemimiz (veri geldiyse)
  const orduTik = document.getElementById("rk-ordu");
  if (orduTik) orduTik.addEventListener("change", rkOrduKatmaniCiz);
  rkSeyahatKatmaniCiz();        // 🧭 seyahat rotaları (kırmızı oklar)
  const seyahatTik = document.getElementById("rk-seyahat");
  if (seyahatTik) seyahatTik.addEventListener("change", rkSeyahatKatmaniCiz);

  // Tam ekran düğmesi (eklenti yok — tarayıcının kendi Fullscreen API'si).
  const TamEkran = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const k = L.DomUtil.create("div", "leaflet-bar leaflet-control");
      const a = L.DomUtil.create("a", "rk-tamekran", k);
      a.href = "#"; a.title = "Tam ekran"; a.innerHTML = "⛶";
      L.DomEvent.on(a, "click", (e) => {
        L.DomEvent.stop(e);
        const kap = document.getElementById("rk-harita");
        if (document.fullscreenElement) document.exitFullscreen();
        else if (kap.requestFullscreen) kap.requestFullscreen();
        setTimeout(() => RK.map.invalidateSize(), 200);
      });
      return k;
    },
  });
  RK.map.addControl(new TamEkran());
  document.addEventListener("fullscreenchange",
    () => setTimeout(() => { if (RK.map) RK.map.invalidateSize(); }, 120));

  RK.map.on("click", (e) => {
    const p = RK.rc.project(e.latlng);
    const kx = Math.floor(p.x / RK_KARE) + RK_DX;
    const ky = Math.floor(p.y / RK_KARE) + RK_DY;
    let en = null, enUz = 3;
    for (const id in RK.veri.dugumler) {
      const [x, y, ad] = RK.veri.dugumler[id];
      if (!ad) continue;
      const u = Math.max(Math.abs(x - kx), Math.abs(y - ky));
      if (u < enUz) { enUz = u; en = id; }
    }
    if (!en) return;
    if (!RK.bas || (RK.bas && RK.bit)) {
      RK.bas = rkDugumSec(en); RK.bit = null;
      document.getElementById("rk-bas").value = en;
      document.getElementById("rk-bit").value = "";
    } else {
      RK.bit = rkDugumSec(en);
      document.getElementById("rk-bit").value = en;
    }
    rkHesapla();
  });

  ["rk-bas", "rk-bit"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
      const n = el.value ? rkDugumSec(el.value) : null;
      if (id === "rk-bas") RK.bas = n; else RK.bit = n;
      if (n) RK.map.setView(RK.rc.unproject(rkPiksel(n.x, n.y)),
                            Math.max(RK.map.getZoom(), 4));
      rkHesapla();
    });
  });
  document.getElementById("rk-jeton").addEventListener("change", rkHesapla);
  const izg = document.getElementById("rk-izgara");
  if (izg) izg.addEventListener("change", rkIzgaraTazele);
  rkIzgaraTazele();
  document.querySelectorAll('input[name="rk-mod"]').forEach(
    (r) => r.addEventListener("change", rkHesapla));
  document.getElementById("rk-temizle").addEventListener("click", () => {
    RK.bas = RK.bit = null;
    document.getElementById("rk-bas").value = "";
    document.getElementById("rk-bit").value = "";
    rkHesapla();
  });

  const d = document.getElementById("rk-durum");
  if (d) d.textContent =
    `Harita hazır: ${Object.keys(RK.veri.dugumler).length} nokta, ` +
    `${RK.veri.limanlar.length} liman, ${RK.su.size.toLocaleString("tr")} deniz karesi. ` +
    `İki şehir seç ya da haritaya tıkla.`;
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector('.tab-btn[data-tab="harita"]');
  if (!btn) return;
  btn.addEventListener("click", () => {
    rkKur();
    setTimeout(() => { if (RK.map) RK.map.invalidateSize(); }, 60);
  });
});


/* ==========================================================================
   🪖 ORDULAR + ⚓ GEMİMİZ — harita katmanı + Leaflet'siz liste (13.09.2026)
   --------------------------------------------------------------------------
   Kullanıcının ortağı: *"Gemi ve ordularımızın konumları harita rota
   üzerinde görünsün. Takip ettiğimiz düşman orduları da şehirde gözüksün.
   Şehir içi / şehir dışı konumları, alım modunda olup olmadıkları da."*

   Veri: docs/ordu.json (pazar_json_uret.ordu_uret) ← Town_Data/Armies_*.json
   + Kaptan_Durumu.json. Hesap adı JSON'a YAZILMAZ; gemi adı + konum var.

   ⚔️ [17.09.2026] "Alım modu" ARTIK TOPLANIYOR (kullanıcının gönderdiği
      canlı HTML ile): ordu asker alımını açtıysa ⚔️, danışman arıyorsa 🎖️
      rozeti çıkar. 17.09 ÖNCESİ kayıtlarda alan yok → "bilinmiyor".
   ⚠️ Leaflet yüklenemese de (internetsiz) altta LİSTE görünür — katman
      yalnızca görsel katmandır, bilgi kaybolmaz.
   ⚠️ Ordu şehrin İÇİNDEyse işaret karenin içine, DIŞINDAysa ("kapıya
      dayandı") karenin hemen dışına (sağ üst) konur — oyunun kendi
      ayrımıyla aynı iki durum.
   ========================================================================== */
RK.ordu = null;            // ordu.json içeriği
RK.orduKatman = null;      // L.layerGroup
RK.orduIsaretler = {};     // ordu adı → marker
RK.gemiIsaretler = {};     // gemi adı → marker
RK.orduBekleyen = "";      // adresle istenen ordu (harita kurulmadan geldiyse)

function rkKacis(m) {
  return String(m == null ? "" : m)
    .split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;")
    .split(String.fromCharCode(34)).join("&quot;");
}
function rkKucult(m) { return String(m || "").toLocaleLowerCase("tr-TR").trim(); }

/* Kasaba adından düğüm kimliği (deniz.json dugumler: id → [x, y, ad]). */
function rkDugumAdiyla(ad) {
  if (!RK.veri || !ad) return null;
  const a = rkKucult(ad);
  for (const id in RK.veri.dugumler) {
    if (rkKucult(RK.veri.dugumler[id][2]) === a) return id;
  }
  return null;
}

function rkOrduDegisimMetni(o) {
  if (o.degisim === "yeni") return "🆕 dün bu kasabada görünmüyordu";
  if (o.degisim === "tasindi") return "➡️ dün " + rkKacis(o.onceki_kasaba || "?") + " kasabasındaydı";
  if (o.degisim === "degisti") return "🔁 dün: " + rkKacis(o.onceki_durum || "?");
  return "= dün de aynı durumdaydı";
}

/* ⚔️🎖️ [17.09.2026] ALIM MODU ARTIK GERÇEK VERİ.
   Kullanıcının ortağı (16.09): *"şu an ordu takibi yaptığımız sistem alım
   modu ve asker alımlarını görüntüleyemiyor."* Haklıydı — "Başvur"/"Danış"
   birer `<input type="submit">` olduğu için `body.text`e girmiyordu.
   Kullanıcı 17.09'da o ekranın canlı HTML'ini gönderdi; `town_module`
   artık `#zoneTexte2`den okuyor (EKSTRA SAYFA AÇMADAN).
   ⚠️⚠️ ÜÇ DURUM AYRI: açık (true) · kapalı (false) · BİLİNMİYOR (null).
      Eski Armies_*.json dosyalarında alan YOK → null kalır ve "bilinmiyor"
      yazılır. `false` ile karıştırılmaz. */
function rkAlimModu(o) {
  const a = o.alim_modu, d = o.danisman;
  if ((a === null || a === undefined) && (d === null || d === undefined)) {
    return '<span class="emir-kucuk">bilinmiyor (17.09 öncesi kayıt)</span>';
  }
  const p = [];
  if (a) p.push('<span class="emir-etiket">⚔️ asker alıyor</span>');
  if (d) {
    p.push('<span class="emir-etiket">🎖️ danışman arıyor' +
           (o.danisman_puan ? " (" + o.danisman_puan + " puan)" : "") + "</span>");
  }
  return p.length ? p.join(" ") : '<span class="emir-kucuk">kapalı</span>';
}

function rkOrduPopup(o) {
  const disarida = o.durum === "Şehir Dışında";
  return '<div class="rk-popup"><b>🪖 ' + rkKacis(o.ad) + "</b><br>" +
    "👤 Komutan: " + rkKacis(o.komutan || "?") + "<br>" +
    "📍 " + rkKacis(o.kasaba) + " · " + (disarida ? "🟠 " : "🟢 ") + rkKacis(o.durum) +
    (o.ham_durum ? ' <span class="emir-kucuk">(' + rkKacis(o.ham_durum) + ")</span>" : "") + "<br>" +
    rkOrduDegisimMetni(o) + "<br>" +
    "🛒 Alım modu: " + rkAlimModu(o) +
    (o.danisman && o.danisman_maas ? '<br><span class="emir-kucuk">💰 Danışman maaşı: ' +
      rkKacis(o.danisman_maas) + " Akçe</span>" : "") + "</div>";
}

function rkGemiPopup(g) {
  return '<div class="rk-popup"><b>⛵ ' + rkKacis(g.gemi) + "</b>" +
    (g.gemi_turu ? " · " + rkKacis(g.gemi_turu) : "") + "<br>" +
    "📍 Kare " + g.x + ", " + g.y + (g.rihtimda ? " · rıhtımda" : " · denizde") + "<br>" +
    (g.hedef ? "🎯 Hedef: " + rkKacis(g.hedef) + "<br>" : "") +
    (g.hareket_puani !== null && g.hareket_puani !== undefined ? "🧭 Hareket puanı: " + g.hareket_puani + "<br>" : "") +
    (g.yelken ? "⛵ Yelken: " + rkKacis(g.yelken) + "<br>" : "") +
    '<span class="emir-kucuk">Kayıt: ' + rkKacis(g.tarih || "?") +
    " — kaptanlık bizde değilken kayıt tazelenmez</span></div>";
}

/* ==========================================================================
   🧭 SEYAHAT ROTALARI — HER HAMLEYE BİR KIRMIZI OK (17.09.2026)
   --------------------------------------------------------------------------
   Kullanıcı, birebir: *"Haritada hareket hâlindeki seyahat modu aktifleri
   ya da aynı grupta olanları da nerede olduklarını görebilir miyiz acaba?
   Harita üzerinden kalan günlerini ve nereden gideceklerini de görsek güzel
   olur; **kırmızı oklarla** filan, her hamleye bir kırmızı ok ve o hamle
   sonunda nerede olacağını göreceğimiz şekilde."*

   Veri: docs/seyahat.json (pazar_json_uret.seyahat_uret)
         ← ayarlar.json + Site_Ayarlari.json + harita.json + Gelisim_Durumu

   ⚠️ ROTA TAHMİNİDİR, kesin değil: bot her turda en kısa yolu YENİDEN
      hesaplıyor ve aynı uzunlukta birden çok yol olabilir. Günlük dilim
      botun kendi kuralıyla aynı: günde `adim_hakki` düğüm
      (3 jetonluysa, değilse 2 — `travel_module`).
   ⚠️ Karakter İKİ KASABA ARASINDAYSA oyun kasaba adı vermez → o hesabın
      rotası ÇİZİLMEZ, "beklemede" listesinde sebebiyle görünür. TAHMİN
      EDİLMEZ (kural 0).
   ========================================================================== */
RK.seyahat = null;            // seyahat.json içeriği
RK.seyahatKatman = null;      // L.layerGroup

async function rkSeyahatYukle() {
  try {
    const c = await fetch("seyahat.json", { cache: "no-store" });
    if (!c.ok) throw new Error("seyahat.json yok");
    RK.seyahat = await c.json();
  } catch (e) {
    RK.seyahat = null;
  }
  window.seyahatVerisi = RK.seyahat;          // panel.js kartları + arama
  if (typeof veriHazir === "function") veriHazir("seyahat");
  rkSeyahatListesiYaz();
  if (RK.map) rkSeyahatKatmaniCiz();
}

/* Gün numarasına göre renk: yaklaşan hamle koyu, uzak günler soluk. */
function rkGunRengi(gun) {
  const tonlar = ["#c0392b", "#d35400", "#e67e22", "#e8a33d", "#efc389"];
  return tonlar[Math.min(gun - 1, tonlar.length - 1)];
}

function rkSeyahatPopup(y, g) {
  const son = g ? g.varis : y.hedef;
  return '<div class="rk-popup"><b>🧭 ' + rkKacis(y.hesap) + "</b>" +
    (y.tur === "takip" ? ' <span class="emir-etiket">👥 ' + rkKacis(y.lider) +
      " takipçisi</span>" : "") + "<br>" +
    "📍 " + rkKacis(y.nereden) + " → 🎯 " + rkKacis(y.hedef) + "<br>" +
    (g ? "🔴 <b>" + g.gun + ". gün sonunda:</b> " + rkKacis(son) + "<br>" : "") +
    "🗓️ Kalan: <b>" + y.kalan_gun + " gün</b> · " + y.kalan_adim + " adım<br>" +
    '<span class="emir-kucuk">Günde ' + y.adim_hakki + " adım" +
    (y.jetonlu ? " (⚡ jetonlu)" : "") + " · tahmini rota</span></div>";
}

function rkSeyahatKatmaniCiz() {
  if (!RK.map || !RK.veri || !window.L) return;
  if (RK.seyahatKatman) { RK.map.removeLayer(RK.seyahatKatman); RK.seyahatKatman = null; }
  RK.seyahatKatman = L.layerGroup();
  const tik = document.getElementById("rk-seyahat");
  const acik = tik ? tik.checked : true;
  if (!RK.seyahat) return;

  (RK.seyahat.yolcular || []).forEach((y) => {
    // ⚠️ Rota düğüm KİMLİKLERİ ile geliyor; harita `RK.veri.dugumler`
    //    aynı kimlikleri kullanıyor (ikisi de harita.json'dan türüyor).
    const nokta = (id) => {
      const d = RK.veri.dugumler[id];
      return d ? RK.rc.unproject(rkPiksel(d[0], d[1])) : null;
    };
    const bas = nokta(y.nereden_id);
    if (!bas) return;                       // haritada olmayan düğüm

    let onceki = bas;
    (y.gunler || []).forEach((g) => {
      // 🔴 HER HAMLEYE BİR OK: o günün geçtiği düğümler tek çizgi,
      //    ucunda o gün nerede olunacağını söyleyen işaret.
      const ara = [onceki];
      (g.duraklar || []).forEach((d) => {
        const p = nokta(d.id);
        if (p) ara.push(p);
      });
      if (ara.length < 2) return;
      const renk = rkGunRengi(g.gun);
      L.polyline(ara, { color: renk, weight: 3, opacity: 0.9 })
        .bindPopup(rkSeyahatPopup(y, g)).addTo(RK.seyahatKatman);
      const varis = ara[ara.length - 1];
      const ikon = L.divIcon({
        className: "rk-seyahat-ikon",
        html: '<span style="border-color:' + renk + ';color:' + renk + '">➤ ' +
              g.gun + ". gün<br>" + rkKacis(g.varis || "?") + "</span>",
        iconAnchor: [0, 0],
      });
      L.marker(varis, { icon: ikon, title: y.hesap + " · " + g.gun + ". gün" })
        .bindPopup(rkSeyahatPopup(y, g)).addTo(RK.seyahatKatman);
      onceki = varis;
    });

    // 🧍 Hesabın ŞU ANKİ yeri
    const ikon = L.divIcon({
      className: "rk-seyahat-yolcu",
      html: (y.tur === "takip" ? "👥 " : "🧭 ") + rkKacis(y.hesap),
      iconAnchor: [0, 0],
    });
    L.marker(bas, { icon: ikon, title: y.hesap })
      .bindPopup(rkSeyahatPopup(y, null)).addTo(RK.seyahatKatman);
  });

  if (acik) RK.seyahatKatman.addTo(RK.map);
}

function rkSeyahatListesiYaz() {
  const kap = document.getElementById("rk-seyahat-liste");
  if (!kap) return;
  const v = RK.seyahat;
  if (!v) {
    kap.innerHTML = '<p class="bos-durum">seyahat.json yok — bot bir tur ' +
      "attıktan sonra dolar.</p>";
    return;
  }
  const yol = v.yolcular || [], bek = v.beklemede || [];
  let html = '<div class="envanter-ozet">' +
    '<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">🧭 Yolda</span><span class="ozet-deger">' +
      yol.length + "</span></div>" +
    '<div class="ozet-kart"><span class="ozet-etiket">👥 Grup takipçisi</span><span class="ozet-deger">' +
      yol.filter((y) => y.tur === "takip").length + "</span></div>" +
    '<div class="ozet-kart"><span class="ozet-etiket">⏳ En uzun yol</span><span class="ozet-deger">' +
      (yol.length ? Math.max.apply(null, yol.map((y) => y.kalan_gun)) + " gün" : "—") + "</span></div>" +
    '<div class="ozet-kart' + (bek.length ? " ozet-kart-supheli" : "") +
      '"><span class="ozet-etiket">❔ Çizilemeyen</span><span class="ozet-deger">' +
      bek.length + "</span></div></div>";

  html += '<div class="tablo-sarici"><table class="rk-ordu-tablo"><thead><tr>' +
    "<th>Hesap</th><th>Nerede</th><th>Hedef</th><th>Kalan</th>" +
    "<th>Gün gün nerede olacak</th></tr></thead><tbody>" +
    (yol.length ? yol.map((y) =>
      "<tr><td><b>" + rkKacis(y.hesap) + "</b>" +
      (y.tur === "takip" ? '<br><span class="emir-kucuk">👥 ' + rkKacis(y.lider) +
        " takipçisi</span>" : "") + "</td>" +
      "<td>" + rkKacis(y.nereden) + "</td><td>" + rkKacis(y.hedef) + "</td>" +
      "<td><b>" + y.kalan_gun + " gün</b><br>" +
      '<span class="emir-kucuk">' + y.kalan_adim + " adım · günde " +
      y.adim_hakki + "</span></td>" +
      '<td class="emir-kucuk">' + (y.gunler || []).map((g) =>
        '<span class="emir-etiket" style="border-color:' + rkGunRengi(g.gun) + '">' +
        g.gun + ". gün → " + rkKacis(g.varis || "?") + "</span>").join(" ") +
      "</td></tr>").join("")
     : '<tr><td colspan="5" class="bos-durum">Şu an yolda olan hesap yok.</td></tr>') +
    "</tbody></table></div>";

  if (bek.length) {
    // ⚠️ "Çizilemedi" ≠ "yolda değil". Sebebi AÇIKÇA yazılır ki kimse
    //    eksik veriyi "sorun yok" diye okumasın.
    html += '<p class="bolum-aciklama" style="margin-top:.6rem">❔ Rotası ' +
      "çizilemeyenler: " + bek.map((b) => "<b>" + rkKacis(b.hesap) + "</b> (" +
      rkKacis(b.sebep) + ")").join(" · ") + "</p>";
  }
  kap.innerHTML = html;
}

async function rkOrduYukle() {
  try {
    const c = await fetch("ordu.json", { cache: "no-store" });
    if (!c.ok) throw new Error("ordu.json yok");
    RK.ordu = await c.json();
  } catch (e) {
    RK.ordu = null;
  }
  window.orduVerisi = RK.ordu;                // panel.js kartları + arama
  if (typeof veriHazir === "function") veriHazir("ordu");
  rkOrduListesiYaz();
  if (RK.map) rkOrduKatmaniCiz();
}

function rkOrduKatmaniCiz() {
  if (!RK.map || !RK.veri || !window.L) return;
  if (RK.orduKatman) { RK.map.removeLayer(RK.orduKatman); RK.orduKatman = null; }
  RK.orduKatman = L.layerGroup();
  RK.orduIsaretler = {}; RK.gemiIsaretler = {};
  const tik = document.getElementById("rk-ordu");
  const acik = tik ? tik.checked : true;
  if (!RK.ordu) return;

  // 🪖 Ordular — aynı kasabada birden çok ordu alt alta dizilir.
  const sayac = {};
  (RK.ordu.ordular || []).forEach((o) => {
    const id = rkDugumAdiyla(o.kasaba);
    if (!id) return;                         // haritada olmayan kasaba (yabancı krallık)
    const [x, y] = RK.veri.dugumler[id];
    const n = sayac[o.kasaba] = (sayac[o.kasaba] || 0) + 1;
    const disarida = o.durum === "Şehir Dışında";
    const px = (x - RK_DX) * RK_KARE + (disarida ? RK_KARE + 4 : 4);
    const py = (y - RK_DY) * RK_KARE + (disarida ? -22 : 4) + (n - 1) * 24;
    const ikon = L.divIcon({
      className: "rk-ordu-ikon " + (disarida ? "rk-ordu-disi" : "rk-ordu-ici"),
      html: "🪖 " + rkKacis(o.ad), iconAnchor: [0, 0],
    });
    const m = L.marker(RK.rc.unproject([px, py]), { icon: ikon, title: o.ad })
      .bindPopup(rkOrduPopup(o));
    m.addTo(RK.orduKatman);
    RK.orduIsaretler[o.ad] = m;
  });

  // ⛵ Gemimiz — karenin ortası; hedef liman biliniyorsa kesikli çizgi.
  (RK.ordu.gemiler || []).forEach((g) => {
    const merkez = RK.rc.unproject(rkPiksel(g.x, g.y));
    const ikon = L.divIcon({ className: "rk-gemi-ikon", html: "⛵ " + rkKacis(g.gemi), iconAnchor: [0, 0] });
    const m = L.marker(merkez, { icon: ikon, title: g.gemi }).bindPopup(rkGemiPopup(g));
    m.addTo(RK.orduKatman);
    RK.gemiIsaretler[g.gemi] = m;
    const hid = rkDugumAdiyla(g.hedef);
    if (hid) {
      const [hx, hy] = RK.veri.dugumler[hid];
      L.polyline([merkez, RK.rc.unproject(rkPiksel(hx, hy))],
        { color: "#8e44ad", weight: 2, dashArray: "6 8", opacity: 0.8 }).addTo(RK.orduKatman);
    }
  });

  if (acik) RK.orduKatman.addTo(RK.map);
  if (RK.orduBekleyen) { const ad = RK.orduBekleyen; RK.orduBekleyen = ""; rkOrduGoster(ad); }
}

/* Listeden / adresten: o orduya (ya da gemiye) yaklaş, baloncuğunu aç. */
function rkOrduGoster(ad) {
  if (!RK.map || !RK.orduKatman) { RK.orduBekleyen = ad; return; }
  const m = RK.orduIsaretler[ad] || RK.gemiIsaretler[ad];
  if (!m) return;
  if (!RK.map.hasLayer(RK.orduKatman)) {
    const tik = document.getElementById("rk-ordu");
    if (tik) tik.checked = true;
    RK.orduKatman.addTo(RK.map);
  }
  RK.map.setView(m.getLatLng(), Math.max(RK.map.getZoom(), 5));
  m.openPopup();
  const kap = document.getElementById("rk-harita");
  if (kap && kap.scrollIntoView) kap.scrollIntoView({ block: "start", behavior: "smooth" });
}

/* Leaflet olsun olmasın görünen liste (bilgi haritaya bağlı kalmasın). */
function rkOrduListesiYaz() {
  const kap = document.getElementById("rk-ordu-liste");
  if (!kap) return;
  const v = RK.ordu;
  if (!v) {
    kap.innerHTML = '<p class="bos-durum">Ordu verisi henüz yok (ordu.json) — ajanlar kasabalarını ' +
      "taradıktan sonraki ilk yayında oluşur.</p>";
    return;
  }
  const ordular = v.ordular || [], gemiler = v.gemiler || [], ayrilan = v.ayrilanlar || [];
  const disarida = ordular.filter((o) => o.durum === "Şehir Dışında").length;
  let html = '<div class="envanter-ozet">' +
    '<div class="ozet-kart ozet-kart-toplam"><span class="ozet-etiket">🪖 Ordu</span><span class="ozet-deger">' + ordular.length + "</span>" +
    '<span class="ozet-alt">' + (v.rapor_tarihi || "") + "</span></div>" +
    '<div class="ozet-kart' + (disarida ? " ozet-kart-supheli" : "") + '"><span class="ozet-etiket">🟠 Şehir dışında (kapıda)</span><span class="ozet-deger">' + disarida + "</span></div>" +
    '<div class="ozet-kart"><span class="ozet-etiket">🟢 Şehir içinde</span><span class="ozet-deger">' + (ordular.length - disarida) + "</span></div>" +
    '<div class="ozet-kart"><span class="ozet-etiket">⛵ Gemimiz</span><span class="ozet-deger">' + gemiler.length + "</span></div></div>";

  const goster = (ad) => '<button type="button" class="emir-mini-btn rk-ordu-git" data-ad="' + rkKacis(ad) + '"' +
    (window.L ? "" : " disabled title=\"Harita yüklenemedi\"") + ">🗺️ Haritada</button>";

  html += '<div class="tablo-sarici"><table class="rk-ordu-tablo"><thead><tr>' +
    "<th>Ordu</th><th>Kasaba</th><th>Konum</th><th>Komutan</th><th>Düne göre</th><th>🛒 Alım modu</th><th></th></tr></thead><tbody>" +
    (ordular.length ? ordular.map((o) => {
      const d = o.durum === "Şehir Dışında";
      return "<tr" + (d ? ' class="rk-ordu-satir-disi"' : "") + "><td><b>" + rkKacis(o.ad) + "</b></td><td>" + rkKacis(o.kasaba) + "</td>" +
        '<td><span class="konum-rozet' + (d ? " konum-disari" : "") + '">' + (d ? "🟠 " : "🟢 ") + rkKacis(o.durum) + "</span></td>" +
        "<td>" + rkKacis(o.komutan) + "</td><td>" + rkOrduDegisimMetni(o) + "</td>" +
        "<td>" + rkAlimModu(o) + "</td>" +
        "<td>" + goster(o.ad) + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="bos-durum">Bugün kasabalarımızda ordu görülmedi.</td></tr>') +
    "</tbody></table></div>";

  if (ayrilan.length) {
    html += '<p class="bolum-aciklama" style="margin-top:.6rem">🚪 Dün vardı, bugün görünmeyen: ' +
      ayrilan.map((o) => "<b>" + rkKacis(o.ad) + "</b> (" + rkKacis(o.kasaba) + ")").join(" · ") + "</p>";
  }

  html += '<h4 class="hareket-alt-baslik">⛵ Gemimiz</h4>' +
    (gemiler.length ? '<div class="tablo-sarici"><table class="rk-ordu-tablo"><thead><tr>' +
      "<th>Gemi</th><th>Kare</th><th>Durum</th><th>Hedef</th><th>Hareket puanı</th><th>Kayıt</th><th></th></tr></thead><tbody>" +
      gemiler.map((g) => "<tr><td><b>" + rkKacis(g.gemi) + "</b>" + (g.gemi_turu ? ' <span class="emir-kucuk">' + rkKacis(g.gemi_turu) + "</span>" : "") + "</td>" +
        "<td>" + g.x + ", " + g.y + "</td><td>" + (g.rihtimda ? "⚓ rıhtımda" : "🌊 denizde") + "</td>" +
        "<td>" + rkKacis(g.hedef || "—") + "</td><td>" + (g.hareket_puani === null || g.hareket_puani === undefined ? "—" : g.hareket_puani) + "</td>" +
        '<td class="emir-kucuk">' + rkKacis(g.tarih || "?") + "</td><td>" + goster(g.gemi) + "</td></tr>").join("") +
      "</tbody></table></div>" +
      '<p class="bolum-aciklama">Kayıt tarihi eskiyse gemi o günden beri bizim kaptanlığımızda değildir — ' +
      "kaptanlık bizde değilken bot hamle yapmaz ve konum tazelenmez.</p>"
      : '<p class="bos-durum">Kaptan kaydı yok.</p>');

  kap.innerHTML = html;
  kap.querySelectorAll(".rk-ordu-git").forEach((b) => {
    b.addEventListener("click", () => {
      if (typeof rkKur === "function") rkKur();
      setTimeout(() => rkOrduGoster(b.dataset.ad), 150);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  rkOrduYukle();
  rkSeyahatYukle();          // 🧭 seyahat rotaları (kırmızı oklar)
  // panel.js: #harita/seyahat adresiyle gelince
  document.addEventListener("harita-alt", (e) => {
    const d = (e && e.detail) || {};
    if (d.alt !== "seyahat") return;
    if (typeof rkKur === "function") rkKur();
    const bolum = document.getElementById("rk-seyahat-bolum");
    if (bolum && bolum.scrollIntoView) {
      setTimeout(() => bolum.scrollIntoView({ block: "start", behavior: "smooth" }), 200);
    }
  });
  // panel.js: #harita/ordu[/<ad>] adresiyle gelince
  document.addEventListener("harita-alt", (e) => {
    const d = (e && e.detail) || {};
    if (d.alt !== "ordu") return;
    const bolum = document.getElementById("rk-ordu-bolum");
    if (d.deger) { RK.orduBekleyen = d.deger; if (RK.map && RK.orduKatman) rkOrduGoster(d.deger); }
    else if (bolum && bolum.scrollIntoView) setTimeout(() => bolum.scrollIntoView({ block: "start", behavior: "smooth" }), 200);
  });
});

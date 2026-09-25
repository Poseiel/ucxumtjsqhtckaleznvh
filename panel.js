// =========================================================================
// panel.js — 🏠 Başlangıç · 🧭 iki katlı gezinme · 🔍 genel arama ·
//            👤 hesap kartı · 📖 katlanabilir rehber      (13.09.2026)
// -------------------------------------------------------------------------
// NEDEN VAR: site 14 sekmeli tek bir çubuktu; "bilgi okuma" ile "bota iş
// verme" ayrılmıyordu ve en güçlü özellik (🖥️ Ayar / görev zinciri) Emir
// sekmesinin İÇİNDE bir düğme olarak kayboluyordu. Ortak "taşınma eksik"
// dedi — özellik vardı, dört seviye derindeydi.
//
// Bu dosya YENİ VERİ DOSYASI İSTEMEZ: script.js'in zaten yüklediği
// dizileri (pazarVerisi, envanterKarakterler, gelisimKarakterler, ...)
// okur. script.js her yükleme bitiminde `veri-hazir` olayı atar; burası
// onu dinleyip özet kartları yeniden çizer.
//
// ⚠️ Kural: mevcut sekme/düğme kimliklerine (`data-tab`, `id`) DOKUNULMAZ —
//    başka dosyalar ve testler onlara bakıyor. Burası yalnızca ÜSTÜNE
//    gezinme ve özet katmanı ekler.
// ⚠️ Adres çubuğu (#hash) yönlendirmesi: `#sekme[/alt[/değer]]`
//      #emir/ayar            → Emir sekmesi, Ayar formu
//      #emir/ayar/tasi       → + "hesabı taşı" hazır planı seçili
//      #envanter/kisi/aiegus → Envanter, karakter kutusuna "aiegus"
//      #rehber/gorev         → Rehber, görev zinciri bölümü açık
//      #hesap/Vamder         → hesap kartı açılır
// =========================================================================
(function () {
  "use strict";

  var NL = String.fromCharCode(10);

  function q(sec, kok) { return (kok || document).querySelector(sec); }
  function qa(sec, kok) { return Array.prototype.slice.call((kok || document).querySelectorAll(sec)); }
  function kacis(m) {
    return String(m == null ? "" : m)
      .split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;")
      .split(String.fromCharCode(34)).join("&quot;");
  }
  function kucult(m) { return String(m || "").toLocaleLowerCase("tr-TR").trim(); }
  function sayiFmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  }
  // Bir kutunun değerini yaz ve olayını tetikle (script.js/emir.js dinleyicileri çalışsın).
  function kutuyaYaz(id, deger, olay) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.value = deger;
    try {
      el.dispatchEvent(new Event(olay || "input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) { /* eski tarayıcı */ }
    return true;
  }

  // -----------------------------------------------------------------------
  // 1) GEZİNME — grup çubuğu + alt sekmeler + adres çubuğu
  // -----------------------------------------------------------------------
  var GRUP_VARSAYILAN = {
    baslangic: "baslangic", depo: "pazar", takip: "sakinler",
    deniz: "harita", emir: "emir", rehber: "rehber"
  };
  var _sonHash = "";

  function sekmeGrubu(tab) {
    var b = q('.tab-btn[data-tab="' + tab + '"]');
    return b ? (b.getAttribute("data-grup") || "") : "";
  }

  function grupGoster(grup) {
    qa(".grup-btn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-grup") === grup);
    });
    var gorunen = 0;
    qa(".tab-btn").forEach(function (b) {
      var ayni = b.getAttribute("data-grup") === grup;
      b.hidden = !ayni;
      if (ayni) gorunen++;
    });
    // Tek sekmeli grupta (Başlangıç, Rehber) alt çubuk boşuna yer kaplamasın.
    var bar = q("#tab-bar");
    if (bar) bar.classList.toggle("tek", gorunen <= 1);
  }

  // Sekmeyi aç: script.js'teki tıklama mantığıyla AYNI (active sınıfları),
  // artı grup + adres çubuğu. Her iki yol da aynı sonucu verir (idempotent).
  function sekmeAc(tab, hashYaz) {
    var btn = q('.tab-btn[data-tab="' + tab + '"]');
    var panel = document.getElementById("tab-" + tab);
    if (!btn || !panel) return false;
    qa(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    qa(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
    btn.classList.add("active");
    panel.classList.add("active");
    grupGoster(sekmeGrubu(tab));
    // Harita sekmesi Leaflet'i ilk açılışta kurar (harita.js düğme
    // tıklamasını dinliyor). Adresle gelince de kurulsun.
    if (tab === "harita" && typeof window.rkKur === "function") {
      try { window.rkKur(); } catch (e) { /* Leaflet yoksa kendi mesajını yazar */ }
      setTimeout(function () {
        if (window.RK && window.RK.map) { try { window.RK.map.invalidateSize(); } catch (e) {} }
      }, 80);
    }
    if (hashYaz !== false) hashYazma(tab);
    // Telefonda sekme değişince başa dön — yoksa kullanıcı önceki sekmenin
    // ortasında kalır ve "değişmedi" sanır.
    if (window.innerWidth < 700) {
      var main = q("main");
      // 🚨 [23.09.2026] Kocaman uyarı bandı (takip.js) main'in ÜSTÜNDE durur;
      //    görünüyorsa sekme değişince o da ekranda kalsın.
      var bant = q("#uyari-bandi");
      var hedef = (bant && !bant.hidden) ? bant : main;
      if (hedef) { try { hedef.scrollIntoView({ block: "start" }); } catch (e) {} }
    }
    return true;
  }

  function hashYazma(tab, alt, deger) {
    var h = "#" + tab + (alt ? "/" + alt : "") + (deger ? "/" + encodeURIComponent(deger) : "");
    if (location.hash === h) return;
    _sonHash = h;
    try { history.replaceState(null, "", h); } catch (e) { location.hash = h; }
  }

  // Hash'i uygula. Veri henüz yüklenmemiş olabilir; `veri-hazir`
  // geldikçe yeniden çağrılır (değer yazma işleri o zaman tutar).
  function hashUygula() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    var p = h.split("/");
    var tab = p[0], alt = p[1] || "", deger = "";
    try { deger = p.length > 2 ? decodeURIComponent(p.slice(2).join("/")) : ""; } catch (e) { deger = p.slice(2).join("/"); }

    if (tab === "hesap") { hesapKartiAc(alt ? decodeURIComponent(alt) : ""); return; }
    // 🚨 [23.09.2026] Paylaşılan izleme bağlantısı: #izle/ekle/a,b · #izle/ordu/<ad>
    //    (takip.js listeye ekler, sonra adresi #izleme yapar).
    if (tab === "izle") {
      sekmeAc("izleme", false);
      if (typeof window.takipHash === "function") { try { window.takipHash(alt, deger); } catch (e) { /* takip.js kendi hatasını yazar */ } }
      return;
    }
    if (!sekmeAc(tab, false)) return;

    if (tab === "emir" && alt) {
      var tb = q('.emir-tur-btn[data-tur="' + alt + '"]');
      if (tb && !tb.classList.contains("active")) tb.click();
      if (alt === "ayar" && deger) planSec(deger);
      if (alt === "hesapekle") { var he = q("#he-hesap"); if (he && !he.value) he.focus(); }
      // 🎨 [21.09.2026] `#emir/guven/renk` → renk tiki hazır gelsin.
      //    Başlangıç'taki "Bir oyuncuya renk attırmak" bağı buraya düşer.
      if (alt === "guven" && deger === "renk") {
        var gr = q("#gv-renk");
        if (gr && !gr.checked) { gr.checked = true; gr.dispatchEvent(new Event("change")); }
      }
    } else if (tab === "rehber" && alt) {
      rehberBolumAc(alt);
    } else if (tab === "envanter" && alt) {
      if (alt === "kisi") kutuyaYaz("envanter-karakter-arama", deger);
      else if (alt === "esya") {
        var sec = q("#envanter-esya-filtre");
        var var_mi = sec && qa("option", sec).some(function (o) { return o.value === deger; });
        if (var_mi) kutuyaYaz("envanter-esya-filtre", deger, "change");
        else kutuyaYaz("envanter-arama", deger);
      }
    } else if (tab === "pazar" && alt === "urun") {
      var ps = q("#pazar-urun-filtre");
      var pv = ps && qa("option", ps).some(function (o) { return o.value === deger; });
      if (pv) kutuyaYaz("pazar-urun-filtre", deger, "change"); else kutuyaYaz("pazar-arama", deger);
    } else if (tab === "sakinler" && alt === "ara") { kutuyaYaz("sakinler-arama", deger);
    } else if (tab === "hareket" && alt === "ara") { kutuyaYaz("hareket-arama", deger);
    } else if (tab === "inziva" && alt === "ara") { kutuyaYaz("kayip-arama", deger);
    } else if (tab === "ordu" && alt === "ara") { kutuyaYaz("ordu-hadise-ara", deger);   // ⚔️ takip.js süzer
    } else if (tab === "filo") {
      if (alt === "ara") kutuyaYaz("filo-arama", deger);
      if (alt === "taraf") kutuyaYaz("filo-taraf-filtre", deger, "change");
    } else if (tab === "gecmis" && alt) {
      // 📅 #gecmis/<YYYY-MM-DD> → takvimde o gün (takip.js).
      if (typeof window.takipGecmisGun === "function") { try { window.takipGecmisGun(alt); } catch (e) {} }
    } else if (tab === "harita" && alt) {
      // harita.js (ordu katmanı) kendi dinleyicisini kurar; olay olarak duyur.
      try { document.dispatchEvent(new CustomEvent("harita-alt", { detail: { alt: alt, deger: deger } })); } catch (e) {}
    }
  }

  function gezinmeKur() {
    qa(".grup-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-grup");
        // Grubun son açık sekmesi varsa ona, yoksa varsayılana git.
        var acik = q('.tab-btn.active[data-grup="' + g + '"]');
        sekmeAc(acik ? acik.getAttribute("data-tab") : (GRUP_VARSAYILAN[g] || g));
      });
    });
    // script.js her .tab-btn'e kendi tıklama dinleyicisini bağlamış; bizimki
    // belge düzeyinde ve SONRA çalışır — grubu ve adresi tamamlar.
    document.addEventListener("click", function (e) {
      var tb = e.target.closest ? e.target.closest(".tab-btn") : null;
      if (tb) { grupGoster(sekmeGrubu(tb.getAttribute("data-tab"))); hashYazma(tb.getAttribute("data-tab")); return; }
      var et = e.target.closest ? e.target.closest(".emir-tur-btn") : null;
      if (et) { hashYazma("emir", et.getAttribute("data-tur")); return; }
      // Sayfa içi bağlantılar (#emir/ayar gibi): yeniden yükleme yok.
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (a && a.getAttribute("href").length > 1) {
        var hedef = a.getAttribute("href");
        if (/^#[a-z]/.test(hedef) && (q('.tab-btn[data-tab="' + hedef.slice(1).split("/")[0] + '"]') ||
            hedef.indexOf("#hesap/") === 0 || hedef.indexOf("#izle/") === 0)) {
          e.preventDefault();
          if (location.hash === hedef) hashUygula();
          else location.hash = hedef;
        }
      }
    });
    window.addEventListener("hashchange", hashUygula);
    var basla = (location.hash || "").replace(/^#/, "").split("/")[0];
    if (basla && q('.tab-btn[data-tab="' + basla + '"]')) hashUygula();
    else if (basla === "hesap" || basla === "izle") { sekmeAc("baslangic", false); hashUygula(); }
    else sekmeAc("baslangic", false);
  }

  // -----------------------------------------------------------------------
  // 2) VERİYE ERİŞİM — script.js'in global dizileri (varsa)
  // -----------------------------------------------------------------------
  // ⚠️ script.js'in dizileri `let` ile tanımlı → `window[ad]` onları GÖRMEZ
  //    (ölçüldü: kartlar "—" kaldı). Dolaylı eval küresel sözcüksel
  //    kapsamı görür; ad listesi sabit (kullanıcı girdisi DEĞİL).
  function g(ad, varsayilan) {
    try {
      var v = (0, eval)("typeof " + ad + " === 'undefined' ? undefined : " + ad);
      return (v === undefined || v === null) ? varsayilan : v;
    } catch (e) { return varsayilan; }
  }
  function hesaplar() {
    // gelisim.json (105 hesap, roller dahil) + envanter.json (eşyalar, akçe)
    var harita = new Map();
    g("gelisimKarakterler", []).forEach(function (k) {
      if (k && k.karakter) harita.set(kucult(k.karakter), { ad: k.karakter, gelisim: k, envanter: null });
    });
    g("envanterKarakterler", []).forEach(function (k) {
      if (!k || !k.karakter) return;
      var a = kucult(k.karakter);
      if (!harita.has(a)) harita.set(a, { ad: k.karakter, gelisim: null, envanter: k });
      else harita.get(a).envanter = k;
    });
    return harita;
  }
  function hesapBul(ad) { return hesaplar().get(kucult(ad)) || null; }
  function bekleyenEmirler(ad) {
    var v = g("emirDurumVerisi", null);
    var liste = (v && v.bekleyen) || [];
    if (!ad) return liste;
    var a = kucult(ad);
    return liste.filter(function (e) { return kucult(e.hesap) === a; });
  }

  // -----------------------------------------------------------------------
  // 3) 🏠 BAŞLANGIÇ — özet kartlar, eylemler, tazelik, gelen mesajlar
  // -----------------------------------------------------------------------
  var EYLEMLER = [
    ["🚚", "Bir hesabı başka şehre taşımak", "#emir/ayar/tasi", "Hazır plan: her şeyi sat → yola çık → evi taşı → ev+tarla → atölye"],
    ["🛒", "Bir malı ucuza aldırmak", "#emir/al", "Önce Pazar'da fiyata bak, sonra alım emri"],
    ["💰", "Elimdeki malı satmak", "#emir/sat", "Hesabı seç, eşya listesi kendiliğinden gelir"],
    ["🖥️", "Hesaba ders / gemi / ases / inziva görevi vermek", "#emir/ayar", "Launcher'daki her ayar buradan"],
    ["➕", "Yeni hesap (multi) eklemek", "#emir/hesapekle", "Ad + şifre + takip modu"],
    ["📊", "Verdiğim emir ne oldu?", "#emirdurum", "Bekleyenler üstte, kapananlar altta"],
    ["🚫", "Yanlış emri geri almak", "#emirdurum", "Satırdaki 🚫 İptal düğmesi"],
    ["👤", "Tek bir hesabın her şeyini görmek", "#envanter", "Adı ara ya da adına tıkla → hesap kartı"],
    ["📍", "Bir kişiyi bulmak (kim nerede?)", "#sakinler", "7 kasabanın bugünkü tam listesi"],
    ["🚨", "Birini / bir orduyu izlemek", "#izleme", "Kasaba değiştirirse en üstte kocaman uyarı çıkar"],
    ["📅", "Geçmiş bir günde kim neredeydi?", "#gecmis", "Takvimden gün seç: nüfus, sakinler, ordular, raporlar"],
    // ⚔️ [25.09.2026] Ordu üyelerimiz + hadiseler / orduya katılma emri.
    ["⚔️", "Ordudaki hesaplarımız ne yaşadı?", "#ordu", "Lideri takip · enerji · kavga/ölüm kayıtları (son 30 gün)"],
    ["🪖", "Bir hesabı orduya sokmak", "#emir/ordukatil", "Ordu adı ya da komutanı ZORUNLU"],
    ["🔒", "Birinin multi olup olmadığına bakmak", "#inziva", "Tek ölçüt: aynı gün inzivaya giriş/çıkış"],
    ["⛵", "Limanımıza kim geldi?", "#filo/taraf/yabanci", "🔴 yabancı gemiler"],
    ["🗺️", "Rota ve kaç gün sürer?", "#harita", "İki şehir seç; kara + deniz hesaplanır"],
    ["🎖️", "Kaptan / ajan adayı seçmek", "#gelisim", "Renk, kayıt tarihi, statlar"],
    ["⛵", "Satılık gemi almak", "#emir/gemi", "Kaptan adı + azami fiyat ZORUNLU"],
    ["✉️", "Gemi sahibine oyun içi mesaj", "#filo", "Satırdaki ✉️ düğmesi"],
    ["📣", "Foruma cevap yazdırmak", "#emir/forum", "Başlığın linki + metin"],
    // 🎭 [21.09.2026] Profil / güven puanı / renk emirleri.
    ["🎭", "Bir hesabın oyun profilini yazdırmak", "#emir/profil", "Durum · RP metni · OOC · doğum · yaş"],
    ["🤝", "Bir oyuncuya güven puanı vermek", "#emir/guven", "⚠️ iz bırakır — multi analizi tam buna bakıyor"],
    ["🎨", "Bir oyuncuya renk attırmak", "#emir/guven/renk", "Bir üst RP derecesine geçirmeyi önerir"],
    ["⚓", "Limana bir gemiyi kabul etmek", "#emir/yanasma", "Liman şefi hesabı + armatör"],
    ["🪖", "Ordular ve gemimiz nerede?", "#harita/ordu", "Haritada katman + liste"],
    ["🧭", "Kim yolda, kaç gün kaldı?", "#harita/seyahat", "Haritada kırmızı oklar"]
  ];

  var _basZaman = null;
  function basYenileGecikmeli() {
    clearTimeout(_basZaman);
    _basZaman = setTimeout(basYenile, 150);
  }

  function kart(ikon, etiket, deger, alt, hedef, sinif) {
    return '<a class="bas-kart ' + (sinif || "") + '" href="' + hedef + '">' +
      '<span class="bas-kart-ikon">' + ikon + '</span>' +
      '<span class="bas-kart-govde"><span class="bas-kart-deger">' + deger + '</span>' +
      '<span class="bas-kart-etiket">' + etiket + '</span>' +
      (alt ? '<span class="bas-kart-alt">' + alt + '</span>' : "") + '</span></a>';
  }

  function basYenile() {
    var kap = q("#bas-kartlar");
    if (!kap) return;
    var k = [];

    var bek = bekleyenEmirler();
    var kritik = bek.filter(function (e) { return e.kalan_gun !== null && e.kalan_gun !== undefined && e.kalan_gun <= 3; }).length;
    k.push(kart("📨", "bekleyen emir", bek.length,
      bek.length ? (kritik ? kritik + " tanesinin süresi bitiyor" : "bot sırayla yapıyor") : "hepsi tamamlandı",
      "#emirdurum", bek.length ? "bas-kart-vurgu" : ""));

    var filo = g("filoSatirlari", []);
    var yab = filo.filter(function (s) { return s.taraf === "yabanci"; }).length;
    if (filo.length || q("#filo-rapor-tarihi"))
      k.push(kart("🔴", "yabancı gemi rıhtımda", filo.length ? yab : "—",
        filo.length ? (filo.length + " gemi · " + g("filoKayitlari", []).length + " liman") : "veri yok",
        "#filo/taraf/yabanci", yab ? "bas-kart-uyari" : ""));

    var kume = g("multiKumeler", []), cift = g("multiCiftler", []);
    k.push(kart("🚨", "multi şüphesi", kume.length ? kume.length + " grup" : (cift.length ? cift.length + " çift" : "0"),
      kume.length ? (cift.length + " şüpheli çift") : "dikkate değer bulgu yok",
      "#inziva", kume.length ? "bas-kart-uyari" : ""));

    var yeni = g("yeniHesaplar", []);
    var sak = g("sakinlerListesi", []);
    k.push(kart("🆕", "yeni açılmış hesap", yeni.length,
      sak.length ? (sak.length + " kişi 7 kasabada" + (g("sakinlerBizimToplam", 0) ? " · 🤝 bizim " + g("sakinlerBizimToplam", 0) : "")) : "veri yok",
      "#sakinler", yeni.length ? "bas-kart-uyari" : ""));

    var env = g("envanterKarakterler", []);
    var toplam = env.reduce(function (t, x) { return t + (Number(x.akce) || 0); }, 0);
    k.push(kart("💰", "toplam akçe", env.length ? sayiFmt(toplam) : "—",
      env.length ? (env.length + " hesabın çantası + evi") : "akşam gelir", "#envanter"));

    var pz = g("pazarVerisi", []);
    var kas = new Set(pz.map(function (u) { return u.kasaba; }));
    k.push(kart("🛒", "pazar ilanı", pz.length ? sayiFmt(pz.length) : "—",
      pz.length ? (kas.size + " kasaba") : "veri yok", "#pazar"));

    var gel = g("gelisimKarakterler", []);
    var sev6 = gel.filter(function (x) { return x.yol && x.yol !== "-" && x.yol !== ""; }).length;
    k.push(kart("📊", "hesap tabloda", gel.length || "—",
      gel.length ? ("🎓 yol seçmiş " + sev6) : "akşam gelir", "#gelisim"));

    var ordu = g("orduVerisi", null);
    if (ordu && ordu.ordular) {
      var disarida = ordu.ordular.filter(function (o) { return o.durum === "Şehir Dışında"; }).length;
      // ⚔️ [17.09.2026] Asker alımı artık toplanıyor — kartın alt satırında
      //    görünsün ki "ordu asker topluyor" bilgisi Başlangıç'ta fark edilsin.
      //    ⚠️ null = bilinmiyor (17.09 öncesi kayıt), sayıma GİRMEZ.
      var asker = ordu.ordular.filter(function (o) { return o.alim_modu === true; }).length;
      var alt = disarida ? disarida + " tanesi şehir kapısında" : "hepsi şehir içinde";
      if (asker) alt += " · ⚔️ " + asker + " tanesi asker alıyor";
      // [23.09.2026] `bakilamadi: true` = o kasabaya bugün bakılamadı, dünkü kayıt.
      var bakilamayan = ordu.ordular.filter(function (o) { return o.bakilamadi === true; }).length;
      if (bakilamayan) alt += " · " + bakilamayan + " tanesine bugün bakılamadı";
      k.push(kart("🪖", "takip edilen ordu", ordu.ordular.length, alt,
        "#harita/ordu", (disarida || asker) ? "bas-kart-uyari" : ""));
    }

    // 🧭 [17.09.2026] YOLDAKİ HESAPLAR. Kullanıcı: "hareket hâlindeki
    //    seyahat modu aktifleri ya da aynı grupta olanları da nerede
    //    olduklarını görebilir miyiz."
    var syh = g("seyahatVerisi", null);
    if (syh && syh.yolcular && syh.yolcular.length) {
      var enUzun = Math.max.apply(null, syh.yolcular.map(function (y) {
        return y.kalan_gun || 0;
      }));
      k.push(kart("🧭", "hesap yolda", syh.yolcular.length,
        "en uzak varış " + enUzun + " gün", "#harita/seyahat"));
    }

    // 🚨 İzleme & uyarı + 🛡️ ordu nöbeti (takip.js, 23.09.2026).
    //    takip.js yoksa ya da hata verirse kartlar hiç çıkmaz.
    var tk = null;
    try { tk = typeof window.takipOzet === "function" ? window.takipOzet() : null; } catch (e) { tk = null; }
    if (tk) {
      k.push(kart("🚨", "izlenen hesap / ordu" + (tk.uyari ? " · uyarı " + tk.uyari : ""), kacis(tk.izlenen),
        tk.uyari ? kacis(tk.uyari + " tanesi yer değiştirdi — bak!") : (tk.izlenen ? "değişiklik yok" : "İzleme sekmesinden ad ekle"),
        "#izleme", tk.uyari ? "bas-kart-uyari" : ""));
      if (tk.nobet) {
        k.push(kart("🛡️", "ordu nöbeti", kacis(tk.nobet.deger), kacis(tk.nobet.alt),
          "#izleme", tk.nobet.fark ? "bas-kart-vurgu" : ""));
      }
    }

    var msj = g("panelMesajlar", null);
    if (msj && msj.mesajlar && msj.mesajlar.length)
      k.push(kart("📩", "gelen oyun mesajı", msj.mesajlar.length, msj.rapor_tarihi || "", "#baslangic/mesajlar"));

    kap.innerHTML = k.join("");

    // Eylemler (bir kez)
    var ey = q("#bas-eylemler");
    if (ey && !ey.dataset.dolu) {
      ey.dataset.dolu = "1";
      ey.innerHTML = EYLEMLER.map(function (e) {
        return '<a class="bas-eylem" href="' + e[2] + '"><span class="bas-eylem-ikon">' + e[0] + '</span>' +
          '<span><b>' + kacis(e[1]) + '</b><span class="bas-eylem-alt">' + kacis(e[3]) + '</span></span></a>';
      }).join("");
    }
    tazelikYaz();
    mesajlariYaz();
  }

  // "Veriler ne kadar taze" — tarihler zaten sekmelerin üst satırında
  // yazıyor; oradan okunup gün farkı hesaplanır. Ekstra istek YOK.
  var TAZELIK = [
    ["🛒 Pazar", "son-guncelleme-metni", "#pazar", "sabah"],
    ["📍 Kim Nerede · Hareket · İnziva", "sakinler-tarih", "#sakinler", "sabah"],
    ["⛵ Filo", "filo-rapor-tarihi", "#filo", "sabah"],
    ["🏛️ Sancak Envanteri", "sancak-rapor-tarihi", "#sancak", "sabah"],
    ["🏘️ Belediye Envanteri", "belediye-rapor-tarihi", "#belediye", "sabah"],
    ["⚓ Liman Envanteri", "liman-rapor-tarihi", "#liman", "sabah"],
    ["🎒 Envanter", "envanter-rapor-tarihi", "#envanter", "akşam"],
    ["📊 Gelişim", "gelisim-tarih-notu", "#gelisim", "akşam"],
    ["🛡️ Ordu nöbeti · 🚨 İzleme", "izleme-nobet-tarih", "#izleme", "gün içinde 2,5 saatte bir"],
    ["📅 Geçmiş / Takvim", "gecmis-son-tarih", "#gecmis", "sabah"],
    // ⚔️ [25.09.2026] Sekme açılınca yüklenir — o zamana kadar "—" görünür.
    ["⚔️ Ordu (üyelerimiz + hadiseler)", "ordu-hadise-tarih", "#ordu", "akşam"],
    ["📨 Emir Durumu", "emirdurum-tarih", "#emirdurum", "emir işlenince"]
  ];
  function tarihCoz(metin) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(metin || "");
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(metin || "");
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function tazelikRozet(metin) {
    var t = tarihCoz(metin);
    if (!t) return "";
    var bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    var fark = Math.round((bugun - t) / 86400000);
    if (fark <= 0) return '<span class="taze taze-bugun">bugün</span>';
    if (fark === 1) return '<span class="taze taze-dun">dün</span>';
    return '<span class="taze taze-eski">' + fark + ' gün önce</span>';
  }
  function tazelikYaz() {
    var tb = q("#bas-tazelik tbody");
    if (!tb) return;
    tb.innerHTML = TAZELIK.map(function (s) {
      var el = document.getElementById(s[1]);
      var metin = el ? el.textContent.trim() : "";
      // Gelişim satırı "2026-09-11 → 2026-09-12" — son tarih geçerlidir.
      var parcalar = metin.split("→");
      var son = parcalar[parcalar.length - 1].trim();
      return "<tr><td>" + s[0] + "</td><td>" + kacis(son || "—") + " " + tazelikRozet(son) +
        '</td><td><a class="bas-link" href="' + s[2] + '">aç</a> <span class="emir-kucuk">· ' + s[3] + ' güncellenir</span></td></tr>';
    }).join("");
  }

  // 📩 Gelen oyun içi mesajlar — mesajlar.json ÜRETİLİYORDU ama sitede hiçbir
  // sekme okumuyordu (ölçüldü). Başlangıç'ta gösterilir.
  function mesajlariYukle() {
    fetch("mesajlar.json?_=" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) { if (v) { window.panelMesajlar = v; basYenileGecikmeli(); } })
      .catch(function () { /* dosya yoksa bölüm boş kalır */ });
  }
  function mesajlariYaz() {
    var kap = q("#bas-mesajlar");
    var v = g("panelMesajlar", null);
    if (!kap || !v || !v.mesajlar || !v.mesajlar.length) { if (kap) kap.innerHTML = ""; return; }
    kap.innerHTML = '<h3 class="hareket-alt-baslik" id="bas-mesajlar-baslik">📩 Hesaplarımıza gelen oyun içi mesajlar ' +
      '<span class="rehber-eski">(' + kacis(v.rapor_tarihi || "") + ')</span></h3>' +
      '<p class="bolum-aciklama">Bot okuyup Telegram\'a da düşürdü. Cevap yazmak için Telegram\'daki bildirime ' +
      '<b>Yanıtla</b> de ya da <a class="bas-link" href="#emir/mesaj">✉️ Mesaj emri</a> ver.</p>' +
      '<div class="mesaj-liste">' + v.mesajlar.map(function (m) {
        return '<div class="mesaj-kart"><div class="mesaj-ust"><b>' + kacis(m.gonderen || "?") + '</b> → ' +
          kacis(m.karakter || "") + ' <span class="emir-kucuk">' + kacis(m.tarih || "") + '</span></div>' +
          (m.konu ? '<div class="mesaj-konu">' + kacis(m.konu) + '</div>' : "") +
          '<div class="mesaj-metin">' + kacis(m.mesaj || "") + '</div>' +
          '<a class="emir-mini-btn mesaj-cevap" href="#emir/mesaj/' + encodeURIComponent(m.login || m.gonderen || "") + '">✉️ Cevap yaz</a></div>';
      }).join("") + "</div>";
  }

  // -----------------------------------------------------------------------
  // 4) 🔍 GENEL ARAMA — hesap · eşya · kişi · gemi · ordu
  // -----------------------------------------------------------------------
  var _aramaZaman = null;
  function aramaKur() {
    var kutu = q("#genel-arama"), sonuc = q("#genel-arama-sonuc");
    if (!kutu || !sonuc) return;
    kutu.addEventListener("input", function () {
      clearTimeout(_aramaZaman);
      _aramaZaman = setTimeout(function () { aramaYap(kutu.value, sonuc); }, 120);
    });
    kutu.addEventListener("focus", function () { if (kutu.value.trim()) aramaYap(kutu.value, sonuc); });
    kutu.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { sonuc.hidden = true; kutu.blur(); }
      if (e.key === "Enter") { var ilk = q("a", sonuc); if (ilk) ilk.click(); }
    });
    document.addEventListener("click", function (e) {
      if (!sonuc.contains(e.target) && e.target !== kutu) sonuc.hidden = true;
    });
    sonuc.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) { sonuc.hidden = true; kutu.value = ""; }
    });
  }

  function aramaYap(metin, sonuc) {
    var a = kucult(metin);
    if (a.length < 2) { sonuc.hidden = true; return; }
    var gruplar = [];
    var SINIR = 6;

    // Hesaplarımız
    var hs = [];
    hesaplar().forEach(function (h) { if (kucult(h.ad).indexOf(a) >= 0) hs.push(h); });
    if (hs.length) gruplar.push(["👤 Hesaplarımız", hs.slice(0, SINIR).map(function (h) {
      var kasaba = (h.gelisim && h.gelisim.kasaba) || (h.envanter && h.envanter.kasaba) || "";
      return '<a href="#hesap/' + encodeURIComponent(h.ad) + '">' + kacis(h.ad) +
        ' <span class="emir-kucuk">' + kacis(kasaba) + ' · hesap kartı</span></a>';
    }), hs.length]);

    // Eşyalar (envanter + pazar)
    var esya = new Map();
    g("envanterSatirlari", []).forEach(function (s) {
      if (!s.akceMi && kucult(s.isim).indexOf(a) >= 0) {
        var e = esya.get(s.isim) || { ad: s.isim, bizde: 0, kisi: new Set(), pazar: 0 };
        e.bizde += s.adet; e.kisi.add(s.karakter); esya.set(s.isim, e);
      }
    });
    g("pazarVerisi", []).forEach(function (u) {
      if (kucult(u.isim).indexOf(a) >= 0) {
        var e = esya.get(u.isim) || { ad: u.isim, bizde: 0, kisi: new Set(), pazar: 0 };
        e.pazar += u.adet || 0; esya.set(u.isim, e);
      }
    });
    var es = Array.from(esya.values()).sort(function (x, y) { return (y.bizde + y.pazar) - (x.bizde + x.pazar); });
    if (es.length) gruplar.push(["📦 Eşyalar", es.slice(0, SINIR).map(function (e) {
      var parca = [];
      if (e.bizde) parca.push('<a href="#envanter/esya/' + encodeURIComponent(e.ad) + '">bizde ' + e.bizde + ' (' + e.kisi.size + ' kişi)</a>');
      if (e.pazar) parca.push('<a href="#pazar/urun/' + encodeURIComponent(e.ad) + '">pazarda ' + e.pazar + '</a>');
      return '<span class="arama-esya"><b>' + kacis(e.ad) + '</b> · ' + parca.join(" · ") + '</span>';
    }), es.length]);

    // Kasabalardaki kişiler (yabancılar dahil)
    var bizimAdlar = hesaplar();
    var ks = g("sakinlerListesi", []).filter(function (s) {
      return kucult(s.karakter).indexOf(a) >= 0 && !bizimAdlar.has(kucult(s.karakter));
    });
    if (ks.length) gruplar.push(["📍 Kasabalardaki kişiler", ks.slice(0, SINIR).map(function (s) {
      return '<a href="#sakinler/ara/' + encodeURIComponent(s.karakter) + '">' + kacis(s.karakter) +
        ' <span class="emir-kucuk">' + kacis(s.kasaba) + ' · PR ' + (s.pr >= 0 ? s.pr : "-") + '</span></a>' +
        ' <a class="emir-kucuk" href="#hareket/ara/' + encodeURIComponent(s.karakter) + '">rotası</a>';
    }), ks.length]);
    // Dışarıda / inzivada olanlar
    var kayip = g("hareketKayiplar", []).filter(function (k) { return kucult(k.karakter).indexOf(a) >= 0; });
    if (kayip.length) gruplar.push(["🚪 Şu an dışarıda", kayip.slice(0, SINIR).map(function (k) {
      return '<a href="#inziva/ara/' + encodeURIComponent(k.karakter) + '">' + kacis(k.karakter) +
        ' <span class="emir-kucuk">' + kacis(k.durum || "") + (k.son_kasaba ? " · son: " + kacis(k.son_kasaba) : "") + '</span></a>';
    }), kayip.length]);

    // Gemiler
    var gm = g("filoSatirlari", []).filter(function (s) {
      return kucult(s.gemi + " " + s.armator).indexOf(a) >= 0;
    });
    if (gm.length) gruplar.push(["⛵ Rıhtımdaki gemiler", gm.slice(0, SINIR).map(function (s) {
      var simge = { bizim: "🟢", dost: "🔵", yabanci: "🔴" }[s.taraf] || "";
      return '<a href="#filo/ara/' + encodeURIComponent(s.gemi || s.armator) + '">' + simge + " " + kacis(s.gemi || "?") +
        ' <span class="emir-kucuk">' + kacis(s.armator) + " · " + kacis(s.liman) + '</span></a>';
    }), gm.length]);

    // Yoldakiler (seyahat.json — harita katmanı yüklediyse)
    var syh2 = g("seyahatVerisi", null);
    var ys = ((syh2 && syh2.yolcular) || []).filter(function (y) {
      return kucult(y.hesap + " " + y.nereden + " " + y.hedef).indexOf(a) >= 0;
    });
    if (ys.length) gruplar.push(["🧭 Yoldakiler", ys.slice(0, SINIR).map(function (y) {
      return '<a href="#harita/seyahat">' + kacis(y.hesap) +
        ' <span class="emir-kucuk">' + kacis(y.nereden) + " → " + kacis(y.hedef) +
        " · " + y.kalan_gun + " gün</span></a>";
    }), ys.length]);

    // Ordular (ordu.json — harita katmanı yüklediyse)
    var ordu = g("orduVerisi", null);
    var os = ((ordu && ordu.ordular) || []).filter(function (o) {
      return kucult(o.ad + " " + o.komutan + " " + o.kasaba).indexOf(a) >= 0;
    });
    if (os.length) gruplar.push(["🪖 Ordular", os.slice(0, SINIR).map(function (o) {
      return '<a href="#harita/ordu/' + encodeURIComponent(o.ad) + '">' + kacis(o.ad) +
        ' <span class="emir-kucuk">' + kacis(o.kasaba) + " · " + kacis(o.durum) +
        (o.alim_modu === true ? " · ⚔️ asker alıyor" : "") +
        (o.danisman === true ? " · 🎖️ danışman arıyor" : "") +
        (o.bakilamadi === true ? " · bugün bakılamadı (son bilinen)" : "") + '</span></a>';
    }), os.length]);

    // ⚔️ [25.09.2026] Ordu üyelerimiz + ordu hadiseleri (ordu_hadise.json —
    //    takip.js Ordu sekmesi İLK açılınca yükler; açılmadıysa grup çıkmaz).
    var oh = g("orduHadiseVerisi", null);
    if (oh) {
      var ohs = [];
      (oh.uyeler || []).forEach(function (u) {
        if (u && kucult((u.hesap || "") + " " + (u.ordu || "") + " " + (u.komutan || "")).indexOf(a) >= 0) {
          ohs.push('<a href="#ordu/ara/' + encodeURIComponent(u.hesap || "") + '">🪖 ' + kacis(u.hesap) +
            ' <span class="emir-kucuk">' + kacis(u.ordu || (u.uye === false ? "orduda değil" : "?")) +
            (u.komutan ? " · " + kacis(u.komutan) : "") + '</span></a>');
        }
      });
      (oh.gunler || []).forEach(function (gn) {
        ((gn && gn.hadiseler) || []).forEach(function (h) {
          if (h && kucult((h.metin || "") + " " + (h.hesap || "")).indexOf(a) >= 0) {
            ohs.push('<a href="#ordu/ara/' + encodeURIComponent(metin.trim()) + '">' + kacis(gn.tarih) + " " + kacis(h.saat || "") +
              " · " + kacis(h.hesap) + ' <span class="emir-kucuk">' + kacis(h.metin) + '</span></a>');
          }
        });
      });
      if (ohs.length) gruplar.push(["⚔️ Ordu (üyelerimiz + hadiseler)", ohs.slice(0, SINIR), ohs.length]);
    }

    if (!gruplar.length) {
      sonuc.innerHTML = '<p class="bos-durum">"' + kacis(metin) + '" bulunamadı. Hesap adı, eşya, kasabadaki bir kişi ya da gemi yaz.</p>';
    } else {
      sonuc.innerHTML = gruplar.map(function (gr) {
        return '<div class="arama-grup"><div class="arama-baslik">' + gr[0] +
          (gr[2] > gr[1].length ? ' <span class="emir-kucuk">(' + gr[2] + ' sonuçtan ilk ' + gr[1].length + ')</span>' : "") +
          '</div>' + gr[1].map(function (x) { return '<div class="arama-satir">' + x + "</div>"; }).join("") + "</div>";
      }).join("");
    }
    sonuc.hidden = false;
  }

  // -----------------------------------------------------------------------
  // 5) 👤 HESAP KARTI — tek pencerede hesabın her şeyi + hızlı emir
  // -----------------------------------------------------------------------
  function hesapKartiKur() {
    if (q("#hesap-karti-perde")) return;
    var perde = document.createElement("div");
    perde.id = "hesap-karti-perde";
    perde.className = "sat-perde";
    perde.hidden = true;
    perde.innerHTML = '<div class="sat-kutu hesap-karti" role="dialog" aria-labelledby="hesap-karti-baslik">' +
      '<button type="button" class="kart-kapat" id="hesap-karti-kapat" title="Kapat">✕</button>' +
      '<div id="hesap-karti-icerik"></div></div>';
    document.body.appendChild(perde);
    perde.addEventListener("click", function (e) { if (e.target === perde) hesapKartiKapat(); });
    q("#hesap-karti-kapat").addEventListener("click", hesapKartiKapat);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !perde.hidden) hesapKartiKapat(); });
    // Kart içindeki bağlantılar sekme açar → kart kapanır.
    perde.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[href^='#']") : null;
      if (a) hesapKartiKapat();
    });
  }
  function hesapKartiKapat() {
    var p = q("#hesap-karti-perde"); if (p) p.hidden = true;
    if ((location.hash || "").indexOf("#hesap/") === 0) {
      try { history.replaceState(null, "", _sonHash && _sonHash.indexOf("#hesap/") !== 0 ? _sonHash : "#baslangic"); } catch (e) {}
    }
  }

  function rozet(m) { return '<span class="gorev-rozet">' + kacis(m) + "</span>"; }

  function hesapKartiAc(ad) {
    hesapKartiKur();
    var h = hesapBul(ad);
    var kap = q("#hesap-karti-icerik"), perde = q("#hesap-karti-perde");
    if (!kap || !perde) return;
    if (!h) {
      kap.innerHTML = '<h3 id="hesap-karti-baslik">👤 ' + kacis(ad) + '</h3><p class="bos-durum">Bu ad hesaplarımız arasında yok ' +
        '(gelişim ve envanter raporlarında bulunamadı). Yabancı bir oyuncuysa ' +
        '<a class="bas-link" href="#sakinler/ara/' + encodeURIComponent(ad) + '">Kim Nerede</a> sekmesine bak.</p>';
      perde.hidden = false; return;
    }
    var gl = h.gelisim || {}, en = h.envanter || {};
    var kasaba = gl.kasaba || en.kasaba || "Bilinmiyor";
    var akce = (en.akce !== undefined ? en.akce : gl.akce);
    var roller = (gl.gorevler || []);
    var bilgi = [
      ["💰 Akçe", akce !== undefined && akce !== null ? Number(akce).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"],
      ["📈 Seviye", gl.seviye], ["⚒️ Meslek", gl.meslek], ["🛤️ Yol", gl.yol || "seçmemiş"],
      ["💪 Kuvvet · 🧠 Zeka · 💬 Karizma · 🤝 Güven", [gl.kuvvet, gl.zeka, gl.karizma, gl.guven].map(function (x) { return x === undefined ? "-" : x; }).join(" · ")],
      ["🎨 Renk", gl.renk], ["💎 Mücevher", gl.mucevher], ["🏡 Tarla", gl.mulk], ["👪 Aile", gl.aile],
      ["📅 Kayıt", gl.kayit_tarihi]
    ].filter(function (s) { return s[1] !== undefined && s[1] !== null && s[1] !== ""; });

    var esyalar = (en.esyalar || []).slice().sort(function (a, b) { return (b.adet || 0) - (a.adet || 0); });
    var emirler = bekleyenEmirler(h.ad);
    var dunAkce = gl.dun && gl.dun.akce !== undefined && gl.akce !== undefined ? (gl.akce - gl.dun.akce) : null;

    kap.innerHTML =
      '<h3 id="hesap-karti-baslik">👤 ' + kacis(h.ad) + ' <span class="konum-rozet">' + kacis(kasaba) + '</span></h3>' +
      (roller.length ? '<div class="kart-roller">' + roller.map(rozet).join(" ") + "</div>" : '<div class="kart-roller emir-kucuk">Aktif görev yok (normal tur)</div>') +
      '<div class="kart-eylemler">' +
        '<a class="emir-mini-btn" href="#emir/sat" data-doldur="sat-hesap">💰 Bu hesaptan sat</a>' +
        '<a class="emir-mini-btn" href="#emir/al" data-doldur="al-hesap">🛒 Bu hesaba aldır</a>' +
        '<a class="emir-mini-btn emir-tur-onemli" href="#emir/ayar" data-doldur="ay-hesap">🖥️ Ayar / görev ver</a>' +
        // 🎭 [21.09.2026] Profil yazma emri — hesap kartından tek tık.
        '<a class="emir-mini-btn" href="#emir/profil" data-doldur="pr-hesap">🎭 Profilini yaz</a>' +
        '<a class="emir-mini-btn" href="#envanter/kisi/' + encodeURIComponent(h.ad) + '">🎒 Tüm eşyaları</a>' +
      '</div>' +
      '<dl class="kart-bilgi">' + bilgi.map(function (s) {
        return "<dt>" + s[0] + "</dt><dd>" + kacis(s[1]) + "</dd>";
      }).join("") + "</dl>" +
      (dunAkce !== null && Math.abs(dunAkce) >= 0.01
        ? '<p class="emir-kucuk">Düne göre akçe: <span class="' + (dunAkce > 0 ? "fark-artis" : "fark-dusus") + '">' +
          (dunAkce > 0 ? "▲ +" : "▼ ") + dunAkce.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + "</span></p>" : "") +
      '<h4>📨 Bekleyen emirleri (' + emirler.length + ')</h4>' +
      (emirler.length
        ? '<ul class="kart-liste">' + emirler.map(function (e) {
            return "<li><b>" + kacis(e.kod) + "</b> " + kacis((typeof window.emirTurAdi === "function") ? window.emirTurAdi(e.tur) : e.tur) +
              " · " + kacis(e.urun || "") + (e.adet ? " x" + e.adet : "") +
              (e.kalan_gun !== null && e.kalan_gun !== undefined ? ' <span class="emir-kucuk">' + e.kalan_gun + " gün kaldı</span>" : "") + "</li>";
          }).join("") + "</ul>"
        : '<p class="emir-kucuk">Yok. <a class="bas-link" href="#emirdurum">Geçmişi Emir Durumu\'nda gör.</a></p>') +
      '<h4>🎒 Eşyaları <span class="emir-kucuk">(' + esyalar.length + " çeşit · çanta + ev toplamı" + (en.esyalar ? "" : " · envanter raporunda yok") + ")</span></h4>" +
      (esyalar.length
        ? '<div class="kart-esyalar">' + esyalar.slice(0, 24).map(function (e) {
            return '<a class="kart-esya" href="#envanter/esya/' + encodeURIComponent(e.isim) + '" title="Bu eşya kimlerde var?">' +
              "<b>" + e.adet + "</b> " + kacis(e.isim) + "</a>";
          }).join("") + (esyalar.length > 24 ? '<a class="kart-esya emir-kucuk" href="#envanter/kisi/' + encodeURIComponent(h.ad) + '">+' + (esyalar.length - 24) + " daha…</a>" : "") + "</div>"
        : '<p class="emir-kucuk">Eşya kaydı yok.</p>');

    // Hızlı eylem düğmeleri: sekmeyi aç + hesap kutusunu doldur.
    qa("[data-doldur]", kap).forEach(function (a) {
      a.addEventListener("click", function () {
        var id = a.getAttribute("data-doldur"), ad = h.ad;
        setTimeout(function () { kutuyaYaz(id, ad); }, 120);
      });
    });
    perde.hidden = false;
    hashYazma("hesap", h.ad);
  }
  window.hesapKartiAc = hesapKartiAc;

  // Envanter tablosundaki hesap adları tıklanabilir (karakter görünümünde
  // 1. sütun, eşya görünümünde 3. sütun — adı bilinen hesaplar sette).
  function tabloAdlariniBagla() {
    var govde = q("#envanter-tablo-govde");
    if (!govde) return;
    govde.addEventListener("click", function (e) {
      var td = e.target.closest ? e.target.closest("td") : null;
      if (!td) return;
      var ad = td.textContent.trim();
      if (ad && hesaplar().has(kucult(ad))) hesapKartiAc(ad);
    });
    // Görsel ipucu: hangi hücre tıklanabilir? (her çizimden sonra)
    var isaretle = function () {
      qa("tr", govde).forEach(function (tr) {
        qa("td", tr).forEach(function (td) {
          if (hesaplar().has(kucult(td.textContent))) td.classList.add("hesap-ad");
        });
      });
    };
    new MutationObserver(function () { clearTimeout(govde._z); govde._z = setTimeout(isaretle, 60); })
      .observe(govde, { childList: true });
  }

  // -----------------------------------------------------------------------
  // 6) 📖 REHBER — katlanabilir bölümler + içindekiler + derin bağlantı
  // -----------------------------------------------------------------------
  // Metin AYNEN korunur; yalnızca h3 bölümleri <details> içine alınır.
  var REHBER_ANAHTAR = [
    [/İKİ KEZ/i, "guncelleme"], [/Bilgi okuma/i, "sekmeler"], [/Bota iş verme/i, "emir"],
    [/Hemen yap/i, "hemen"], [/Emir Durumu/i, "durum"], [/Telegram’dan cevap|Telegram'dan cevap/i, "telegram"],
    [/Sık sorulan/i, "sss"], [/Hızlı başlangıç/i, "hizli"], [/Görev zinciri/i, "gorev"],
    [/Ayar emri/i, "ayar"], [/iptal etmek/i, "iptal"], [/Alışverişçi/i, "alisverisci"], [/Hızlı Maden/i, "hizlimod"]
  ];
  function anahtarBul(metin) {
    for (var i = 0; i < REHBER_ANAHTAR.length; i++) if (REHBER_ANAHTAR[i][0].test(metin)) return REHBER_ANAHTAR[i][1];
    return "b" + Math.abs(metin.split("").reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7));
  }

  function rehberKur() {
    var kok = q("#tab-rehber .rehber");
    if (!kok || kok.dataset.katlandi) return;
    kok.dataset.katlandi = "1";
    var cocuklar = Array.prototype.slice.call(kok.children);
    var toc = [];
    var mevcut = null;
    var acik = window.innerWidth >= 900;   // masaüstünde açık, telefonda katlı
    cocuklar.forEach(function (el) {
      if (el.tagName === "H3") {
        var anahtar = anahtarBul(el.textContent);
        var det = document.createElement("details");
        det.className = "rehber-bolum";
        det.id = "rehber-" + anahtar;
        det.open = acik;
        var sum = document.createElement("summary");
        sum.innerHTML = el.innerHTML;
        det.appendChild(sum);
        kok.insertBefore(det, el);
        el.remove();
        mevcut = det;
        toc.push([anahtar, sum.textContent.trim()]);
        return;
      }
      if (el.tagName === "H4" || el.tagName === "H5") {
        el.id = "rehber-" + anahtarBul(el.textContent);
      }
      if (mevcut) mevcut.appendChild(el);
    });
    // İçindekiler + aç/kapat
    var tocEl = document.createElement("div");
    tocEl.className = "rehber-toc";
    tocEl.innerHTML = '<div class="rehber-toc-baslik">İçindekiler <button type="button" class="emir-mini-btn" id="rehber-hepsi">' +
      (acik ? "Hepsini kapat" : "Hepsini aç") + "</button></div>" +
      toc.map(function (t) { return '<a href="#rehber/' + t[0] + '">' + kacis(t[1]) + "</a>"; }).join("");
    var ilkH2 = q("h2", kok);
    var ilkAciklama = ilkH2 && ilkH2.nextElementSibling && ilkH2.nextElementSibling.classList.contains("bolum-aciklama")
      ? ilkH2.nextElementSibling : ilkH2;
    if (ilkAciklama) ilkAciklama.insertAdjacentElement("afterend", tocEl); else kok.insertBefore(tocEl, kok.firstChild);
    q("#rehber-hepsi").addEventListener("click", function () {
      var hepsiAcik = qa("details.rehber-bolum", kok).every(function (d) { return d.open; });
      qa("details.rehber-bolum", kok).forEach(function (d) { d.open = !hepsiAcik; });
      this.textContent = hepsiAcik ? "Hepsini aç" : "Hepsini kapat";
    });
    // "Hızlı başlangıç" tablosundaki <b>Emir → 🖥️ Ayar</b> gibi yönlendirmeler
    // tıklanabilir olsun — rehber söylemesin, GÖTÜRSÜN.
    var HEDEF = [
      ["Emir → 🖥️ Ayar", "#emir/ayar"], ["Emir → 💰 Satış", "#emir/sat"], ["Emir → 🛒 Alım", "#emir/al"],
      ["Emir → ⛵ Gemi Al", "#emir/gemi"], ["Emir → 📣 Forum", "#emir/forum"], ["Emir → ⚓ Yanaşma", "#emir/yanasma"],
      ["📊 Emir Durumu", "#emirdurum"], ["Gelişim", "#gelisim"], ["İnziva", "#inziva"], ["⛵ Filo", "#filo"],
      ["Envanter", "#envanter"], ["Pazar", "#pazar"], ["Kim Nerede", "#sakinler"], ["Hareket", "#hareket"]
    ];
    qa("details#rehber-hizli td b, details#rehber-sss td b", kok).forEach(function (b) {
      var m = b.textContent.trim();
      for (var i = 0; i < HEDEF.length; i++) {
        if (m === HEDEF[i][0]) {
          var a = document.createElement("a"); a.href = HEDEF[i][1]; a.className = "bas-link";
          b.parentNode.insertBefore(a, b); a.appendChild(b); break;
        }
      }
    });
  }
  function rehberBolumAc(anahtar) {
    var el = document.getElementById("rehber-" + anahtar);
    if (!el) return;
    var det = el.tagName === "DETAILS" ? el : (el.closest ? el.closest("details") : null);
    if (det) det.open = true;
    setTimeout(function () { try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); } }, 60);
  }

  // Her sekmenin başına "bu sekme ne işe yarar" bağlantısı (rehbere gider).
  var SEKME_REHBER = {
    pazar: "sekmeler", envanter: "sekmeler", sancak: "sekmeler", belediye: "sekmeler", liman: "sekmeler",
    filo: "sekmeler", gelisim: "sekmeler", hareket: "sekmeler", inziva: "sekmeler", sakinler: "sekmeler",
    izleme: "sekmeler", gecmis: "sekmeler", ordu: "sekmeler",
    harita: "sekmeler", emir: "emir", emirdurum: "durum"
  };
  function yardimBaglantilariKur() {
    Object.keys(SEKME_REHBER).forEach(function (tab) {
      var panel = document.getElementById("tab-" + tab);
      if (!panel || q(".sekme-yardim", panel)) return;
      var a = document.createElement("a");
      a.className = "sekme-yardim";
      a.href = "#rehber/" + SEKME_REHBER[tab];
      a.textContent = "❓ Bu sekme ne işe yarar";
      panel.insertBefore(a, panel.firstChild);
    });
  }

  // -----------------------------------------------------------------------
  // 7) HAZIR PLAN (Ayar → görev zinciri) — emir.js'teki ayPlanUygula'yı çağırır
  // -----------------------------------------------------------------------
  function planSec(kod) {
    var sec = q("#ay-plan");
    if (!sec) return;
    var var_mi = qa("option", sec).some(function (o) { return o.value === kod; });
    if (!var_mi) return;
    sec.value = kod;
    try { sec.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  }

  // -----------------------------------------------------------------------
  // KURULUM
  // -----------------------------------------------------------------------
  function kur() {
    gezinmeKur();
    aramaKur();
    hesapKartiKur();
    tabloAdlariniBagla();
    rehberKur();
    yardimBaglantilariKur();
    mesajlariYukle();
    basYenile();
    document.addEventListener("veri-hazir", function () {
      basYenileGecikmeli();
      // Adresle gelinmiş bir değer (ör. #envanter/esya/X) veri gelmeden
      // yazılamamış olabilir — yeniden dene (idempotent).
      if (location.hash && location.hash.split("/").length > 2) hashUygula();
    });
    // Emniyet: veri-hazir olayı atılmayan eski script.js ile de kartlar dolsun.
    [1500, 4000, 9000].forEach(function (ms) { setTimeout(basYenile, ms); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kur);
  else kur();
})();

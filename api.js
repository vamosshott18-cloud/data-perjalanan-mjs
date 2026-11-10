// Penghubung ke Google Sheet lewat Apps Script. Data terakhir disimpan di perangkat supaya aplikasi langsung tampil,
// dan trip yang gagal terkirim (sinyal hilang) masuk antrean lalu dikirim ulang otomatis.
const API = (() => {
  const URL_API = (window.MJS_CONFIG || {}).api;
  const MODE_COBA = !URL_API;
  const DAFTAR_AWAL = {
    driver: ["Haikal", "Prima", "Reza", "Pak Nofri"],
    unit: ["APV", "Grandmax", "Innova", "Mobil Jenazah"],
    tempat: ["RS Awal Bros", "RS Awal Bros Yasmin", "RSUD", "RS Awal Bros Panam Pekanbaru", "RS Awal Bros Sudirman Pekanbaru", "Bumi Ayu"],
  };
  const ADMIN_SAJA = ["nilai", "perluCek", "waInfo"];                          // disembunyikan dari driver
  const ADMIN_TULIS = ["nilai", "perluCek", "waInfo", "status", "dikonfirmasi"]; // hanya admin yang boleh mengubah
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const salin = o => JSON.parse(JSON.stringify(o));

  // ---- mode coba: meniru server (PIN tim coba 111111, PIN admin coba 123456), semua di localStorage ----
  // langganan coba: tanggal di mj_coba_sampai (default 1 bulan dari hari ini), kunci developer coba "dev-coba"
  const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function langgananCoba() {
    let sampai = baca("mj_coba_sampai", null);
    if (!sampai) { const d = new Date(); d.setMonth(d.getMonth() + 1); sampai = d.toISOString().slice(0, 10); tulis("mj_coba_sampai", sampai); }
    const sisa = Math.round((new Date(sampai) - new Date(hariIni())) / 86400000);
    return { aktif: sisa >= 0, sampai, sisaHari: sisa, kontak: baca("mj_coba_kontak", "") };
  }
  function devCoba(q) {
    if (q.devKunci !== "dev-coba") return { galat: "dev_salah" };
    const lg = langgananCoba(), d = new Date(lg.aktif ? lg.sampai : hariIni());
    if (q.aksi === "devPerpanjang") { d.setMonth(d.getMonth() + (Number(q.bulan) || 1)); tulis("mj_coba_sampai", d.toISOString().slice(0, 10)); }
    if (q.aksi === "devAtur") tulis("mj_coba_sampai", q.sampai);
    if (q.aksi === "devKunci") { const k = new Date(hariIni()); k.setDate(k.getDate() - 1); tulis("mj_coba_sampai", k.toISOString().slice(0, 10)); }
    if (q.aksi === "devKontak") tulis("mj_coba_kontak", String(q.kontak || "").replace(/[^0-9]/g, ""));
    return { ok: true, langganan: langgananCoba(), hariIni: hariIni(), jumlahTrip: baca("mj_coba_trip", []).length, sheetUrl: "" };
  }
  // mode coba: pesan WA tidak benar-benar dikirim, hanya disimpan di mj_coba_wa_log
  function waCoba(r, admin, teks) {
    const w = baca("mj_coba_wa", { aktif: false, tujuan: "" });
    if (!w.aktif) return { ok: false, mati: true, pesan: "notifikasi WA belum diaktifkan" };
    if (!w.tujuan.trim()) return { ok: false, pesan: "nomor tujuan belum diisi" };
    const pesan = teks || `🚑 BOOKING BARU${admin ? " (admin)" : " — perlu konfirmasi"}\n${r.jenis} · ${r.tanggal}\n${r.jemput} → ${r.antar}\n${r.unit} · ${r.driver}`;
    tulis("mj_coba_wa_log", [...baca("mj_coba_wa_log", []), { ke: w.tujuan, pesan, waktu: new Date().toISOString() }].slice(-20));
    return { ok: true, pesan: "simulasi: tidak benar-benar dikirim (mode coba)" };
  }
  function layananCoba(q) {
    if (String(q.aksi).startsWith("dev")) return devCoba(q);
    const lgc = langgananCoba();
    if (!lgc.aktif) return { galat: "langganan_habis", sampai: lgc.sampai, kontak: lgc.kontak };
    const pinAdmin = baca("mj_coba_pin", "123456"), pinTim = baca("mj_coba_pin_tim", "111111");
    const admin = q.pin === pinAdmin, tim = admin || q.pinTim === pinTim || q.pinTim === pinAdmin;
    if (!tim) return { galat: "pin_tim" };
    if (["hapus", "daftar", "gantiPin", "gantiPinTim", "biayaTambah", "biayaHapus", "waAtur", "waTes", "konfirmasi"].includes(q.aksi) && !admin) return { galat: "pin_salah" };
    const trip = baca("mj_coba_trip", []), biaya = baca("mj_coba_biaya", []);
    const muat = () => {
      const daftar = baca("mj_coba_daftar", DAFTAR_AWAL), rows = baca("mj_coba_trip", []);
      const w = baca("mj_coba_wa", { aktif: false, provider: "fonnte", tujuan: "", token: "" });
      if (admin) return { ok: true, akses: true, rows, biaya: baca("mj_coba_biaya", []), daftar, sheetUrl: "", langganan: lgc,
        wa: { aktif: w.aktif, provider: w.provider, tujuan: w.tujuan, adaToken: !!w.token } };
      return { ok: true, akses: false, daftar, langganan: lgc, rows: rows.map(r => { const o = { ...r }; ADMIN_SAJA.forEach(k => delete o[k]); return o; }) };
    };
    if (q.aksi === "muat") return muat();
    if (q.aksi === "konfirmasi") {
      const i = trip.findIndex(x => x.id === q.id);
      if (i >= 0) { trip[i].status = "DIKONFIRMASI"; trip[i].dikonfirmasi = new Date().toISOString(); tulis("mj_coba_trip", trip); }
      return muat();
    }
    if (q.aksi === "waAtur") {
      const w = baca("mj_coba_wa", { aktif: false, provider: "fonnte", tujuan: "", token: "" });
      Object.assign(w, { aktif: !!q.wa.aktif, provider: q.wa.provider || w.provider, tujuan: q.wa.tujuan ?? w.tujuan });
      if (q.wa.token) w.token = q.wa.token; if (q.wa.hapusToken) w.token = "";
      tulis("mj_coba_wa", w); return muat();
    }
    if (q.aksi === "waTes") return { ok: true, waKirim: waCoba(null, true, "✅ Tes notifikasi") };
    let wa = null;
    if (q.aksi === "tambah") {
      let no = trip.reduce((m, r) => Math.max(m, r.no || 0), 0);
      const kenal = new Set(trip.map(r => r.id));
      q.rows.forEach(r => {
        if (!r || kenal.has(r.id)) return; kenal.add(r.id);
        const impor = admin && String(r.id).startsWith("lama-");
        if (!admin) ADMIN_TULIS.forEach(k => r[k] = "");
        r.no = ++no; r.dibuat = r.dibuat || new Date().toISOString(); r.diubah = "";
        if (!impor) { r.status = admin ? "DIKONFIRMASI" : "MENUNGGU"; r.dikonfirmasi = admin ? r.dibuat : ""; wa = waCoba(r, admin); r.waInfo = wa.ok ? "terkirim (simulasi)" : ""; }
        trip.push(r);
      });
      tulis("mj_coba_trip", trip); return { ...muat(), waKirim: wa };
    }
    if (q.aksi === "ubah") {
      const i = trip.findIndex(x => x.id === q.row.id);
      if (i < 0) return { galat: "data tidak ditemukan" };
      Object.keys(q.row).filter(k => !["id", "no", "dibuat", "diubah"].includes(k) && (admin || !ADMIN_TULIS.includes(k)))
        .forEach(k => trip[i][k] = q.row[k]);
      trip[i].diubah = new Date().toISOString();
      tulis("mj_coba_trip", trip); return muat();
    }
    if (q.aksi === "hapus") { tulis("mj_coba_trip", trip.filter(x => x.id !== q.id)); return muat(); }
    if (q.aksi === "biayaTambah") {
      const kenal = new Set(biaya.map(r => r.id));
      q.biaya.forEach(r => { if (!kenal.has(r.id)) { r.dibuat = r.dibuat || new Date().toISOString(); biaya.push(r); } });
      tulis("mj_coba_biaya", biaya); return muat();
    }
    if (q.aksi === "biayaHapus") { tulis("mj_coba_biaya", biaya.filter(x => x.id !== q.id)); return muat(); }
    if (q.aksi === "daftar") { tulis("mj_coba_daftar", q.daftar); return muat(); }
    if (q.aksi === "gantiPin" || q.aksi === "gantiPinTim") {
      if (!/^\d{6,8}$/.test(q.pinBaru || "")) return { galat: "PIN harus 6–8 angka" };
      if (q.pinBaru === (q.aksi === "gantiPin" ? pinTim : pinAdmin)) return { galat: "PIN tim & PIN admin harus beda" };
      tulis(q.aksi === "gantiPin" ? "mj_coba_pin" : "mj_coba_pin_tim", q.pinBaru); return { ok: true };
    }
    return { galat: "aksi tidak dikenal" };
  }

  async function kirim(isi) {
    isi.pin = localStorage.getItem("mj_pin") || "";
    isi.pinTim = localStorage.getItem("mj_pin_tim") || "";
    let j;
    if (MODE_COBA) j = layananCoba(salin(isi));
    else {
      const r = await fetch(URL_API, { method: "POST", body: JSON.stringify(isi) });   // tanpa header → tidak perlu preflight CORS
      j = await r.json();
    }
    if (j.galat) { const e = new Error(j.galat); e.kode = j.galat; e.data = j; throw e; }
    if (j.rows) simpanCache(j);
    return j;
  }
  function simpanCache(j) {
    tulis("mj_cache", { rows: j.rows, biaya: j.biaya || [], daftar: j.daftar, akses: !!j.akses, sheetUrl: j.sheetUrl || "", langganan: j.langganan || null, waktu: Date.now() });
  }

  const antre = () => baca("mj_antre", []);
  async function kirimAntrean() {
    const a = antre();
    if (!a.length) return null;
    const j = await kirim({ aksi: "tambah", rows: a });
    tulis("mj_antre", antre().filter(r => !a.some(x => x.id === r.id)));
    return j;
  }
  async function tambahRows(rows) {
    try { const j = await kirim({ aksi: "tambah", rows: [...antre(), ...rows] }); tulis("mj_antre", []); return j; }
    catch (e) {
      if (e.kode && e.kode !== "terkunci") throw e;                 // ditolak server (mis. PIN salah) → jangan diantre
      const ids = new Set(rows.map(r => r.id));
      tulis("mj_antre", [...antre().filter(x => !ids.has(x.id)), ...rows]);
      return { ok: true, antre: true };
    }
  }

  return {
    MODE_COBA,
    simpanan: () => baca("mj_cache", null),
    antre,
    async muat() { try { await kirimAntrean(); } catch (_) {} return kirim({ aksi: "muat" }); },
    tambah: row => tambahRows([row]),
    tambahBanyak: rows => kirim({ aksi: "tambah", rows }),
    ubah: row => kirim({ aksi: "ubah", row }),
    hapus: id => kirim({ aksi: "hapus", id }),
    biayaTambah: biaya => kirim({ aksi: "biayaTambah", biaya }),
    biayaHapus: id => kirim({ aksi: "biayaHapus", id }),
    daftar: daftar => kirim({ aksi: "daftar", daftar }),
    gantiPin: pinBaru => kirim({ aksi: "gantiPin", pinBaru }),
    gantiPinTim: pinBaru => kirim({ aksi: "gantiPinTim", pinBaru }),
    pasangPinTim: pin => { try { localStorage.setItem("mj_pin_tim", pin); } catch (_) {} },
    pasangPin: pin => { try { localStorage.setItem("mj_pin", pin); } catch (_) {} },
    lepasPin: () => { try { localStorage.removeItem("mj_pin"); localStorage.removeItem("mj_cache"); } catch (_) {} },
    keluar: () => { try { ["mj_pin_tim", "mj_pin", "mj_cache"].forEach(k => localStorage.removeItem(k)); } catch (_) {} },
    kirimAntrean,
    dev: async (aksi, devKunci, isi = {}) => {
      const q = { aksi, devKunci, ...isi };
      if (MODE_COBA) { const j = devCoba(q); if (j.galat) { const e = new Error(j.galat); e.kode = j.galat; throw e; } return j; }
      return fetch(URL_API, { method: "POST", body: JSON.stringify(q) }).then(r => r.json()).then(j => { if (j.galat) { const e = new Error(j.galat); e.kode = j.galat; throw e; } return j; });
    },
    konfirmasi: id => kirim({ aksi: "konfirmasi", id }),
    waAtur: wa => kirim({ aksi: "waAtur", wa }),
    waTes: () => kirim({ aksi: "waTes" }),
    hapusCache: () => { try { localStorage.removeItem("mj_cache"); } catch (_) {} },
  };
})();

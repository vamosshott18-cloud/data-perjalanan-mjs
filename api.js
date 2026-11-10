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
  const ADMIN_SAJA = ["nilai", "perluCek"];
  const baca = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const tulis = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const salin = o => JSON.parse(JSON.stringify(o));

  // ---- mode coba: meniru server (PIN tim coba 111111, PIN admin coba 123456), semua di localStorage ----
  function layananCoba(q) {
    const pinAdmin = baca("mj_coba_pin", "123456"), pinTim = baca("mj_coba_pin_tim", "111111");
    const admin = q.pin === pinAdmin, tim = admin || q.pinTim === pinTim || q.pinTim === pinAdmin;
    if (!tim) return { galat: "pin_tim" };
    if (["hapus", "daftar", "gantiPin", "gantiPinTim", "biayaTambah", "biayaHapus"].includes(q.aksi) && !admin) return { galat: "pin_salah" };
    const trip = baca("mj_coba_trip", []), biaya = baca("mj_coba_biaya", []);
    const muat = () => {
      const daftar = baca("mj_coba_daftar", DAFTAR_AWAL), rows = baca("mj_coba_trip", []);
      if (admin) return { ok: true, akses: true, rows, biaya: baca("mj_coba_biaya", []), daftar, sheetUrl: "" };
      return { ok: true, akses: false, daftar, rows: rows.map(r => { const o = { ...r }; ADMIN_SAJA.forEach(k => delete o[k]); return o; }) };
    };
    if (q.aksi === "muat") return muat();
    if (q.aksi === "tambah") {
      let no = trip.reduce((m, r) => Math.max(m, r.no || 0), 0);
      const kenal = new Set(trip.map(r => r.id));
      q.rows.forEach(r => {
        if (!r || kenal.has(r.id)) return; kenal.add(r.id);
        if (!admin) ADMIN_SAJA.forEach(k => r[k] = "");
        r.no = ++no; r.dibuat = r.dibuat || new Date().toISOString(); r.diubah = ""; trip.push(r);
      });
      tulis("mj_coba_trip", trip); return muat();
    }
    if (q.aksi === "ubah") {
      const i = trip.findIndex(x => x.id === q.row.id);
      if (i < 0) return { galat: "data tidak ditemukan" };
      Object.keys(q.row).filter(k => !["id", "no", "dibuat", "diubah"].includes(k) && (admin || !ADMIN_SAJA.includes(k)))
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
    if (j.galat) { const e = new Error(j.galat); e.kode = j.galat; throw e; }
    if (j.rows) simpanCache(j);
    return j;
  }
  function simpanCache(j) {
    tulis("mj_cache", { rows: j.rows, biaya: j.biaya || [], daftar: j.daftar, akses: !!j.akses, sheetUrl: j.sheetUrl || "", waktu: Date.now() });
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
  };
})();

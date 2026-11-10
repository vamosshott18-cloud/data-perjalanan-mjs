// Data Perjalanan — CV. Muda Jaya Sembada — penyimpan data (Google Apps Script + Google Sheet).
// Sheet "Trip"  : satu baris per perjalanan (diisi driver lewat aplikasi, nilai pembayaran diisi admin).
// Sheet "Biaya" : biaya bulanan di luar trip (gaji driver, setoran rujuk, DLL) — hanya admin.
// Sheet "Daftar": daftar driver, unit, dan tempat yang sering dipakai.
// Dua PIN di Script Properties (tidak pernah ditulis di kode ini):
//   PIN_TIM — semua driver: buka aplikasi, catat trip, lihat & ubah trip (tanpa nilai pembayaran).
//   PIN     — admin: nilai pembayaran, biaya bulanan, rekap & ekspor, hapus, pengaturan, ganti PIN.
// Tanpa PIN tim, server menolak semuanya. PIN salah 10× dalam 15 menit → semua cek PIN ditolak 15 menit.
const KOLOM = ["id", "no", "tanggal", "jenis", "jemput", "antar", "unit", "driver", "bayar", "nilai", "bbm", "tol", "alat", "lain",
  "komplain", "ketKomplain", "catatan", "perluCek", "dibuat", "diubah"];
const KOLOM_ADMIN_SAJA = ["nilai", "perluCek"];
const KOLOM_BIAYA = ["id", "bulan", "jenis", "ket", "nilai", "dibuat"];
const ANGKA = ["no", "nilai", "bbm", "tol", "alat", "lain"];
const DAFTAR_AWAL = {
  driver: ["Haikal", "Prima", "Reza", "Pak Nofri"],
  unit: ["APV", "Grandmax", "Innova", "Mobil Jenazah"],
  tempat: ["RS Awal Bros", "RS Awal Bros Yasmin", "RSUD", "RS Awal Bros Panam Pekanbaru", "RS Awal Bros Sudirman Pekanbaru", "Bumi Ayu"],
};

function doGet() { return ContentService.createTextOutput("Data Perjalanan CV. Muda Jaya Sembada: layanan data aktif"); }

const GAGAL_MAKS = 10, GAGAL_DETIK = 900;

function doPost(e) {
  let out;
  const kunci = LockService.getScriptLock();
  try {
    const q = JSON.parse(e.postData.contents);
    kunci.waitLock(25000);
    const prop = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
    const pinAdmin = prop.getProperty("PIN"), pinTim = prop.getProperty("PIN_TIM");
    const gagal = Number(cache.get("gagal") || 0);
    if (gagal >= GAGAL_MAKS) out = { galat: "terkunci" };
    else {
      const dikirimAdmin = String(q.pin || ""), dikirimTim = String(q.pinTim || "");
      const admin = !!pinAdmin && dikirimAdmin === pinAdmin;
      const tim = admin || (!!pinTim && (dikirimTim === pinTim || dikirimTim === pinAdmin));
      if ((dikirimAdmin && !admin) || (dikirimTim && !tim)) {
        cache.put("gagal", String(gagal + 1), GAGAL_DETIK);
        Utilities.sleep(1500);
      }
      const khususAdmin = ["hapus", "daftar", "gantiPin", "gantiPinTim", "biayaTambah", "biayaHapus"];
      if (!tim) out = { galat: "pin_tim" };
      else if (khususAdmin.indexOf(q.aksi) >= 0 && !admin) out = { galat: "pin_salah" };
      else if (q.aksi === "muat") out = muat(admin);
      else if (q.aksi === "tambah") { tambah(q.rows || [q.row], admin); out = muat(admin); }
      else if (q.aksi === "ubah") { out = ubah(q.row, admin); if (!out.galat) out = muat(admin); }
      else if (q.aksi === "hapus") { hapus(q.id); out = muat(admin); }
      else if (q.aksi === "biayaTambah") { biayaTambah(q.biaya || []); out = muat(admin); }
      else if (q.aksi === "biayaHapus") { biayaHapus(q.id); out = muat(admin); }
      else if (q.aksi === "daftar") { tulisDaftar(lembar("Daftar"), q.daftar); out = muat(admin); }
      else if (q.aksi === "gantiPin") out = gantiPin("PIN", q.pinBaru);
      else if (q.aksi === "gantiPinTim") out = gantiPin("PIN_TIM", q.pinBaru);
      else out = { galat: "aksi tidak dikenal" };
    }
  } catch (err) { out = { galat: String(err) }; }
  finally { try { kunci.releaseLock(); } catch (_) {} }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function buku() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create("Data Perjalanan MJS (data aplikasi)");
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  const t = ss.getSheets()[0].setName("Trip");
  t.getRange(1, 1, 1, KOLOM.length).setValues([KOLOM]).setFontWeight("bold");
  t.setFrozenRows(1);
  t.getRange("C:C").setNumberFormat("@");
  t.getRange("S:T").setNumberFormat("@");
  t.getRange("J:N").setNumberFormat("#,##0");
  const b = ss.insertSheet("Biaya");
  b.getRange(1, 1, 1, KOLOM_BIAYA.length).setValues([KOLOM_BIAYA]).setFontWeight("bold");
  b.setFrozenRows(1);
  b.getRange("B:B").setNumberFormat("@");
  b.getRange("E:E").setNumberFormat("#,##0");
  const d = ss.insertSheet("Daftar");
  d.getRange(1, 1, 1, 3).setValues([["driver", "unit", "tempat"]]).setFontWeight("bold");
  tulisDaftar(d, DAFTAR_AWAL);
  return ss;
}
const lembar = nama => buku().getSheetByName(nama);

function bacaDaftar() {
  const d = lembar("Daftar"), n = d.getLastRow();
  const v = n > 1 ? d.getRange(2, 1, n - 1, 3).getValues() : [];
  const kol = i => v.map(r => String(r[i]).trim()).filter(Boolean);
  return { driver: kol(0), unit: kol(1), tempat: kol(2) };
}
function tulisDaftar(d, daftar) {
  const a = daftar.driver || [], b = daftar.unit || [], c = daftar.tempat || [];
  const n = Math.max(a.length, b.length, c.length);
  if (d.getLastRow() > 1) d.getRange(2, 1, d.getLastRow() - 1, 3).clearContent();
  if (n) d.getRange(2, 1, n, 3).setValues(Array.from({ length: n }, (_, i) => [a[i] || "", b[i] || "", c[i] || ""]));
}

function baca(nama, kolom) {
  const s = lembar(nama), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, kolom.length).getValues().map(r => {
    const o = {};
    kolom.forEach((k, i) => o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], "Asia/Jakarta", k === "bulan" ? "yyyy-MM" : "yyyy-MM-dd") : r[i]);
    ANGKA.forEach(k => { if (k in o) o[k] = Number(o[k]) || 0; });
    return o;
  });
}

function muat(admin) {
  const trip = baca("Trip", KOLOM);
  if (admin) return { ok: true, akses: true, rows: trip, biaya: baca("Biaya", KOLOM_BIAYA), daftar: bacaDaftar(), sheetUrl: buku().getUrl() };
  // PIN tim: semua trip tanpa nilai pembayaran & catatan cek admin
  const rows = trip.map(r => { const o = {}; KOLOM.forEach(k => { if (KOLOM_ADMIN_SAJA.indexOf(k) < 0) o[k] = r[k]; }); return o; });
  return { ok: true, akses: false, rows: rows, daftar: bacaDaftar() };
}

function gantiPin(nama, baru) {
  baru = String(baru || "").trim();
  if (!/^\d{6,8}$/.test(baru)) return { galat: "PIN harus 6–8 angka" };
  const p = PropertiesService.getScriptProperties();
  if (baru === p.getProperty(nama === "PIN" ? "PIN_TIM" : "PIN")) return { galat: "PIN tim & PIN admin harus beda" };
  p.setProperty(nama, baru);
  return { ok: true };
}

function tambah(rows, admin) {
  const s = lembar("Trip"), ada = baca("Trip", KOLOM);
  let no = ada.reduce((m, r) => Math.max(m, r.no), 0);
  const kenal = new Set(ada.map(r => r.id)), baru = [];
  rows.forEach(r => {
    if (!r || !r.id || kenal.has(r.id)) return;                     // kiriman ulang dari antrean offline → abaikan
    kenal.add(r.id);
    if (!admin) KOLOM_ADMIN_SAJA.forEach(k => r[k] = "");
    r.no = ++no; r.dibuat = r.dibuat || new Date().toISOString(); r.diubah = "";
    baru.push(r);
  });
  if (baru.length) s.getRange(s.getLastRow() + 1, 1, baru.length, KOLOM.length).setValues(baru.map(r => KOLOM.map(k => r[k] ?? "")));
}

function cariBaris(nama, id) {
  const s = lembar(nama), n = s.getLastRow();
  if (n < 2) return -1;
  const i = s.getRange(2, 1, n - 1, 1).getValues().map(r => r[0]).indexOf(id);
  return i < 0 ? -1 : i + 2;
}
function ubah(row, admin) {
  const b = cariBaris("Trip", row.id);
  if (b < 0) return { galat: "data tidak ditemukan" };
  const s = lembar("Trip"), lama = s.getRange(b, 1, 1, KOLOM.length).getValues()[0];
  const baru = {}; KOLOM.forEach((k, i) => baru[k] = lama[i]);
  KOLOM.filter(k => ["id", "no", "dibuat", "diubah"].indexOf(k) < 0 && (admin || KOLOM_ADMIN_SAJA.indexOf(k) < 0))
    .forEach(k => { if (row[k] !== undefined) baru[k] = row[k]; });
  baru.diubah = new Date().toISOString();
  s.getRange(b, 1, 1, KOLOM.length).setValues([KOLOM.map(k => baru[k] ?? "")]);
  return { ok: true };
}
function hapus(id) { const b = cariBaris("Trip", id); if (b > 0) lembar("Trip").deleteRow(b); }

function biayaTambah(list) {
  const s = lembar("Biaya"), kenal = new Set(baca("Biaya", KOLOM_BIAYA).map(r => r.id));
  const baru = list.filter(r => r && r.id && !kenal.has(r.id)).map(r => { r.dibuat = r.dibuat || new Date().toISOString(); return r; });
  if (baru.length) s.getRange(s.getLastRow() + 1, 1, baru.length, KOLOM_BIAYA.length).setValues(baru.map(r => KOLOM_BIAYA.map(k => r[k] ?? "")));
}
function biayaHapus(id) { const b = cariBaris("Biaya", id); if (b > 0) lembar("Biaya").deleteRow(b); }

// Jalankan sekali dari editor untuk membuat Sheet & memberi izin.
function siapkan() { Logger.log(buku().getUrl()); }

// Jalankan sekali dari editor: buat PIN admin & PIN tim acak 6 angka (kalau belum ada) lalu tampilkan di log.
function buatPinAwal() {
  const p = PropertiesService.getScriptProperties(), acak = () => String(Math.floor(100000 + Math.random() * 900000));
  if (!p.getProperty("PIN")) p.setProperty("PIN", acak());
  while (!p.getProperty("PIN_TIM") || p.getProperty("PIN_TIM") === p.getProperty("PIN")) p.setProperty("PIN_TIM", acak());
  Logger.log("PIN admin: " + p.getProperty("PIN") + " | PIN tim: " + p.getProperty("PIN_TIM"));
}

// Data Perjalanan — CV. Muda Jaya Sembada. Layar: Catat (driver isi trip), Data (daftar per bulan), Rekap (admin).
const VERSI = "6";
const $ = s => document.querySelector(s);
const JENIS = ["Jenazah", "Pasien Kontrol", "Pasien Pulang", "Rujuk"];
const SINGKAT = { "Jenazah": "JNZ", "Pasien Kontrol": "KTR", "Pasien Pulang": "PLG", "Rujuk": "RJK" };
const BAYAR = ["CASH", "TRANSFER", "CSR"];
const JENIS_BIAYA = ["Gaji", "Rujuk", "DLL", "Lainnya"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const S = { rows: [], biaya: [], daftar: { driver: [], unit: [], tempat: [] }, akses: false, sheetUrl: "", langganan: null };
const F = { tanggal: "", jenis: "", unit: "", bayar: "CASH", komplain: "TIDAK" };
let langkah = 1, ubahId = null, bulanAktif = "", filterAktif = "semua", biayaJenis = "Gaji", balik = null;

// ---------- bantu ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const angka = s => Number(String(s ?? "").replace(/[^0-9]/g, "")) || 0;
const titik = n => (Number(n) || 0).toLocaleString("id-ID");
const rp = n => "Rp" + titik(n);
const jt = n => { const a = Math.abs(n); return (n < 0 ? "−" : "") + (a >= 1e6 ? (a / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt" : a >= 1e3 ? Math.round(a / 1e3) + " rb" : String(a)); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hariIni = () => iso(new Date());
const keTanggal = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const geser = (s, n) => { const d = keTanggal(s); d.setDate(d.getDate() + n); return iso(d); };
const tglPanjang = s => { if (!s) return "Tanpa tanggal"; const d = keTanggal(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const namaBulan = b => { const [y, m] = b.split("-").map(Number); return `${BULAN[m - 1]} ${y}`; };
const geserBulan = (b, n) => { const [y, m] = b.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const idBaru = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const lsBaca = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
const lsTulis = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const belumNilai = r => !Number(r.nilai) && r.bayar !== "CSR";
const kelasJenis = j => JENIS.includes(j) ? "j-" + j.replace(/\s+/g, "-") : "j-lain";
const singkatJenis = j => SINGKAT[j] || String(j || "—").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "—";

let tTimer;
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("tampil"); clearTimeout(tTimer); tTimer = setTimeout(() => el.classList.remove("tampil"), 2600); }
window.toast = toast;

function chips(el, list, pilih, klik, kelas = "chip") {
  el.innerHTML = list.map(v => `<button type="button" class="${kelas}${v === pilih ? " pilih" : ""}" data-v="${esc(v)}">${esc(v)}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => klik(b.dataset.v));
}
function seg(el, list, pilih, klik, label = v => v) {
  el.innerHTML = list.map(v => `<button type="button" class="${v === pilih ? "pilih" : ""}${v === "YA" ? " merah" : ""}" data-v="${esc(v)}">${esc(label(v))}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => klik(b.dataset.v));
}
function uangInput(el) {
  el.addEventListener("input", () => {
    const n = angka(el.value); el.value = n ? titik(n) : "";
    ringkas();
  });
}
const nilaiUang = id => angka($(id).value);
const isiUang = (id, n) => { $(id).value = Number(n) ? titik(n) : ""; };

// ---------- status ----------
function status(teks, kelas) { const el = $("#status"); el.textContent = teks; el.className = "status " + (kelas || ""); }
function statusDariAntrean(ok) {
  const n = API.antre().length;
  if (n) status(`${n} belum terkirim`, "antre");
  else if (ok === false) status("offline", "galat");
  else status(API.MODE_COBA ? "mode coba" : (S.akses ? "admin" : "tersambung"), "ok");
}

// ---------- muat data ----------
function pakai(j) {
  S.rows = (j.rows || []).map(r => ({ ...r, nilai: Number(r.nilai) || 0, bbm: Number(r.bbm) || 0, tol: Number(r.tol) || 0, alat: Number(r.alat) || 0, lain: Number(r.lain) || 0 }));
  S.biaya = (j.biaya || []).map(b => ({ ...b, nilai: Number(b.nilai) || 0 }));
  S.daftar = j.daftar || S.daftar;
  S.akses = !!j.akses; S.sheetUrl = j.sheetUrl || ""; S.langganan = j.langganan || S.langganan;
  gambarSemua(); gambarBanner();
}
// ---------- langganan: habis → semua layar dikunci sampai developer memperpanjang ----------
const tglIndo = s => { if (!s) return "-"; const [y, m, d] = s.split("-").map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };
function terkunci(data = {}) {
  API.hapusCache(); S.rows = []; S.biaya = [];
  lsTulis("mj_terkunci", JSON.stringify(data));
  $("#aplikasi").hidden = true; $("#layarMasuk").hidden = true; $("#layarKunci").hidden = false;
  $("#lapisAtur").classList.remove("tampil");
  $("#kunciPesan").textContent = data.sampai ? `Masa langganan berakhir pada ${tglIndo(data.sampai)}.` : "Aplikasi belum diaktifkan oleh developer.";
  const wa = String(data.kontak || "").replace(/^0/, "62");
  $("#kunciWa").hidden = !wa;
  if (wa) $("#kunciWa").href = `https://wa.me/${wa}?text=${encodeURIComponent("Halo, saya mau memperpanjang langganan aplikasi Data Perjalanan CV. Muda Jaya Sembada.")}`;
}
function bukaKunci() {
  try { localStorage.removeItem("mj_terkunci"); } catch (_) {}
  if (!$("#layarKunci").hidden) { $("#layarKunci").hidden = true; if (lsBaca("mj_pin_tim", "")) $("#aplikasi").hidden = false; else keLogin(); }
}
const cekKunci = e => { if (e && e.kode === "langganan_habis") { terkunci(e.data || {}); return true; } return false; };
function gambarBanner() {
  const lg = S.langganan, el = $("#bannerLangganan");
  if (!lg || !lg.sampai || lg.sisaHari > 7 || (!S.akses && lg.sisaHari > 3)) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="banner-lg">⏳ Langganan berakhir <b>${tglIndo(lg.sampai)}</b> (${lg.sisaHari === 0 ? "hari ini" : lg.sisaHari + " hari lagi"}). Setelah itu aplikasi terkunci — hubungi developer untuk memperpanjang.</div>`;
}
async function muat() {
  try { const j = await API.muat(); bukaKunci(); pakai(j); statusDariAntrean(true); }
  catch (e) {
    if (cekKunci(e)) return;
    if (e.kode === "pin_tim") { keLogin("PIN tidak dikenal. Minta PIN baru ke admin."); return; }
    if (e.kode === "pin_salah") { API.lepasPin(); toast("PIN admin salah"); return muat(); }
    if (e.kode === "terkunci") toast("Terlalu banyak PIN salah. Coba lagi 15 menit lagi.");
    statusDariAntrean(false);
  }
}
function keLogin(pesan) {
  API.keluar();
  $("#aplikasi").hidden = true; $("#layarMasuk").hidden = false;
  $("#pesanMasuk").textContent = pesan || (API.MODE_COBA ? "Mode coba — PIN tim 111111, PIN admin 123456." : "");
  $("#pinMasuk").value = ""; setTimeout(() => $("#pinMasuk").focus(), 50);
}
async function masuk() {
  const pin = $("#pinMasuk").value.trim();
  if (!/^\d{4,8}$/.test(pin)) { $("#pesanMasuk").textContent = "PIN berupa angka."; return; }
  $("#btnMasuk").disabled = true; $("#pesanMasuk").textContent = "Memeriksa…";
  API.pasangPinTim(pin);
  try {
    const j = await API.muat();
    $("#layarMasuk").hidden = true; $("#aplikasi").hidden = false;
    bukaKunci(); pakai(j); statusDariAntrean(true);
  } catch (e) {
    if (cekKunci(e)) { $("#btnMasuk").disabled = false; return; }
    API.keluar();
    $("#pesanMasuk").textContent = e.kode === "pin_tim" ? "PIN salah." : e.kode === "terkunci" ? "Terlalu banyak percobaan. Tunggu 15 menit." : "Tidak tersambung ke internet.";
  }
  $("#btnMasuk").disabled = false;
}

// ---------- layar ----------
function keLayar(id) {
  document.querySelectorAll(".layar").forEach(l => l.classList.toggle("aktif", l.id === id));
  document.querySelectorAll("nav.bawah button").forEach(b => b.classList.toggle("aktif", b.dataset.layar === id));
  window.scrollTo(0, 0);
  if (id === "lData") gambarData();
  if (id === "lRekap") gambarRekap();
}
function gambarSemua() { gambarForm(); gambarData(); gambarRekap(); gambarAtur(); }

// ---------- CATAT ----------
function sering(kolom, n = 4) {
  const hit = {};
  S.rows.forEach(r => { const v = (r[kolom] || "").trim(); if (v) hit[v] = (hit[v] || 0) + 1; });
  const urut = Object.keys(hit).sort((a, b) => hit[b] - hit[a]);
  return [...new Set([...(S.daftar.tempat || []).slice(0, 2), ...urut])].slice(0, n);
}
function gambarForm() {
  const driver = lsBaca("mj_driver", "");
  $("#namaDriver").textContent = driver || "Pilih nama";
  $("#avaDriver").textContent = driver ? driver.replace(/^Pak\s+/i, "")[0].toUpperCase() : "?";
  const daftarDriver = S.daftar.driver?.length ? S.daftar.driver : ["Haikal"];
  chips($("#pilihDriver"), daftarDriver, driver, v => { lsTulis("mj_driver", v); $("#pilihDriver").hidden = true; gambarForm(); });
  if (!driver) $("#pilihDriver").hidden = false;

  if (!F.tanggal) F.tanggal = hariIni();
  const t = F.tanggal, h = hariIni();
  $("#tglTeks").textContent = t === h ? "Hari ini" : t === geser(h, -1) ? "Kemarin" : tglPanjang(t);
  $("#tglSub").textContent = t === h || t === geser(h, -1) ? tglPanjang(t) : "";
  $("#tglInput").value = t;
  chips($("#jenisChips"), JENIS, F.jenis, v => { F.jenis = v; $("#jenisLain").value = ""; gambarForm(); if (lengkap(1)) setTimeout(() => keLangkah(2), 200); });
  if (document.activeElement !== $("#jenisLain")) $("#jenisLain").value = F.jenis && !JENIS.includes(F.jenis) ? F.jenis : "";
  $("#dlJenis").innerHTML = [...new Set(S.rows.map(r => r.jenis).filter(j => j && !JENIS.includes(j)))].map(v => `<option value="${esc(v)}">`).join("");

  chips($("#jemputChips"), sering("jemput"), $("#jemput").value, v => { $("#jemput").value = v; gambarForm(); if (lengkap(2)) setTimeout(() => keLangkah(3), 200); else $("#antar").focus(); }, "chip kecil");
  chips($("#antarChips"), sering("antar"), $("#antar").value, v => { $("#antar").value = v; gambarForm(); if (lengkap(2)) setTimeout(() => keLangkah(3), 200); }, "chip kecil");
  const semuaTempat = [...new Set([...(S.daftar.tempat || []), ...S.rows.flatMap(r => [r.jemput, r.antar])].filter(Boolean))].sort();
  $("#dlTempat").innerHTML = semuaTempat.map(v => `<option value="${esc(v)}">`).join("");

  const units = S.daftar.unit?.length ? S.daftar.unit : ["APV"];
  if (!F.unit) F.unit = lsBaca("mj_unit", units[0]);
  chips($("#unitChips"), units, F.unit, v => { F.unit = v; lsTulis("mj_unit", v); gambarForm(); });
  seg($("#bayarChips"), BAYAR, F.bayar, v => { F.bayar = v; gambarForm(); });
  seg($("#komplainChips"), ["TIDAK", "YA"], F.komplain, v => { F.komplain = v; gambarForm(); }, v => v === "YA" ? "Ada komplain" : "Tidak ada komplain");
  $("#ketKomplain").hidden = F.komplain !== "YA";

  $("#nilaiWrap").hidden = !S.akses;
  if (S.akses) {
    const antar = $("#antar").value.trim().toLowerCase();
    const lalu = antar && S.rows.filter(r => r.id !== ubahId && r.nilai && (r.antar || "").toLowerCase() === antar).sort((a, b) => (b.tanggal > a.tanggal ? 1 : -1))[0];
    const saran = [...new Set([lalu?.nilai, 150000, 200000, 1450000].filter(Boolean))];
    $("#nilaiCepat").innerHTML = saran.map(n => `<button type="button" class="chip kecil" data-n="${n}">${n === lalu?.nilai ? "Terakhir ke sini: " : ""}${rp(n)}</button>`).join("");
    $("#nilaiCepat").querySelectorAll("button").forEach(b => b.onclick = () => { isiUang("#nilai", b.dataset.n); ringkas(); });
  }
  $("#bbmCepat").innerHTML = [50000, 100000, 200000, 300000].map(n => `<button type="button" class="chip kecil" data-n="${n}">${jt(n)}</button>`).join("");
  $("#bbmCepat").querySelectorAll("button").forEach(b => b.onclick = () => { isiUang("#bbm", b.dataset.n); ringkas(); });

  $("#kartuUbah").hidden = !ubahId;
  $("#adminUbah").hidden = !(ubahId && S.akses);
  $("#simpan").textContent = ubahId ? "Simpan perubahan" : "Simpan trip";
  ringkas();
  gambarLangkah();
}
function ringkas() {
  const j = $("#jemput").value.trim(), a = $("#antar").value.trim();
  const biaya = ["#bbm", "#tol", "#alat", "#lain"].reduce((s, id) => s + nilaiUang(id), 0);
  const kurang = [!lsBaca("mj_driver", "") && "driver", !F.jenis && "jenis", !j && "titik jemput", !a && "titik antar"].filter(Boolean);
  const el = $("#ringkas");
  if (balik && !ubahId && !j && !a) {
    el.innerHTML = `Tersimpan ✓ <button type="button" class="chip kecil" id="btnBalik" style="margin-left:6px">↩ Catat baliknya (${esc(balik.antar)} → ${esc(balik.jemput)})</button>`;
    $("#btnBalik").onclick = () => {
      $("#jemput").value = balik.antar; $("#antar").value = balik.jemput;
      if (balik.jenis === "Pasien Kontrol") F.jenis = "Pasien Pulang";
      balik = null; gambarForm(); if (lengkap(1) && lengkap(2)) keLangkah(3);
    };
  } else if (langkah < 5 && !lengkap(langkah)) el.innerHTML = ["", lsBaca("mj_driver", "") ? "Ketuk jenis trip, atau ketik jenis lain lalu Lanjut" : "Pilih nama driver dulu",
      "Isi titik jemput & antar", "Pilih unit & pembayaran"][langkah];
  else if (langkah < 3) el.innerHTML = "";
  else if (kurang.length) el.innerHTML = `Belum diisi: <b>${kurang.join(", ")}</b>`;
  else el.innerHTML = `<b>${esc(F.jenis)}</b> · ${esc(j)} → ${esc(a)} · ${esc(F.unit)}${biaya ? ` · biaya ${rp(biaya)}` : ""}`;
  $("#simpan").disabled = kurang.length > 0;
  const btnLanjut = $("#lanjut");
  btnLanjut.disabled = !lengkap(langkah);
  btnLanjut.textContent = langkah === 4 && !biaya ? "Tidak ada biaya ›" : "Lanjut ›";
  if (langkah === 5) gambarRingkasan();
}
// ---------- langkah 1–5: selesaikan satu langkah dulu, baru pindah ----------
const NAMA_LANGKAH = ["Jenis", "Rute", "Unit", "Biaya", "Simpan"];
function lengkap(n) {
  if (n === 1) return !!lsBaca("mj_driver", "") && !!F.jenis;
  if (n === 2) return !!$("#jemput").value.trim() && !!$("#antar").value.trim();
  if (n === 3) return !!F.unit && !!F.bayar;
  return true;
}
const bolehKe = n => Array.from({ length: n - 1 }, (_, i) => i + 1).every(lengkap);
function keLangkah(n) {
  n = Math.max(1, Math.min(5, n));
  if (n > langkah && !bolehKe(n)) {
    const kurang = Array.from({ length: n - 1 }, (_, i) => i + 1).find(i => !lengkap(i));
    toast(kurang === 1 ? (lsBaca("mj_driver", "") ? "Pilih jenis trip dulu" : "Pilih nama driver dulu") : kurang === 2 ? "Isi titik jemput & antar dulu" : "Pilih unit dulu");
    return;
  }
  langkah = n; gambarLangkah(); ringkas();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (n === 2 && !$("#jemput").value) setTimeout(() => $("#jemput").focus(), 250);
}
function gambarLangkah() {
  document.querySelectorAll("#lCatat .langkah").forEach(el => el.classList.toggle("aktif", Number(el.dataset.l) === langkah));
  $("#progres").innerHTML = NAMA_LANGKAH.map((t, i) => {
    const n = i + 1, kls = n === langkah ? "aktif" : (n < langkah || (ubahId && lengkap(n))) ? "selesai" : "";
    return `<button type="button" class="${kls}" data-n="${n}" ${n !== langkah && !bolehKe(n) ? "disabled" : ""}><i></i>${n}. ${t}</button>`;
  }).join("");
  $("#progres").querySelectorAll("button").forEach(b => b.onclick = () => keLangkah(Number(b.dataset.n)));
  $("#kembali").hidden = langkah === 1;
  $("#lanjut").hidden = langkah === 5;
  $("#simpan").hidden = langkah !== 5;
}
function gambarRingkasan() {
  const r = bacaForm(), biaya = [["BBM", r.bbm], ["Tol", r.tol], ["Alat medis", r.alat], ["Lain", r.lain]].filter(x => x[1]);
  const baris = (t, v, n) => `<div class="rs-baris"><span>${t}</span><b>${v}${n ? `<button type="button" data-n="${n}">ubah</button>` : ""}</b></div>`;
  $("#ringkasan5").innerHTML = `<p class="label">Cek sebelum simpan</p>` +
    baris("Driver", esc(r.driver), 1) + baris("Tanggal", tglPanjang(r.tanggal), 1) + baris("Jenis", esc(r.jenis), 1) +
    baris("Rute", `${esc(r.jemput)} → ${esc(r.antar)}`, 2) + baris("Unit", `${esc(r.unit)} · ${esc(r.bayar)}`, 3) +
    (S.akses ? baris("Nilai", nilaiUang("#nilai") ? rp(nilaiUang("#nilai")) : "belum diisi", 3) : "") +
    baris("Biaya jalan", biaya.length ? biaya.map(([t, n]) => `${t} ${rp(n)}`).join(" · ") : "tidak ada", 4);
  $("#ringkasan5").querySelectorAll("button").forEach(b => b.onclick = () => keLangkah(Number(b.dataset.n)));
}

function bacaForm() {
  return {
    tanggal: F.tanggal, jenis: F.jenis, jemput: $("#jemput").value.trim(), antar: $("#antar").value.trim(),
    unit: F.unit, driver: lsBaca("mj_driver", ""), bayar: F.bayar,
    bbm: nilaiUang("#bbm"), tol: nilaiUang("#tol"), alat: nilaiUang("#alat"), lain: nilaiUang("#lain"),
    komplain: F.komplain, ketKomplain: F.komplain === "YA" ? $("#ketKomplain").value.trim() : "", catatan: $("#catatan").value.trim(),
  };
}
function kosongkanForm() {
  ubahId = null; F.jenis = ""; F.komplain = "TIDAK"; F.bayar = "CASH";
  ["#jenisLain", "#jemput", "#antar", "#bbm", "#tol", "#alat", "#lain", "#nilai", "#ketKomplain", "#catatan"].forEach(id => $(id).value = "");
  F.unit = lsBaca("mj_unit", F.unit);
}
async function simpan() {
  const row = bacaForm();
  if (S.akses) row.nilai = nilaiUang("#nilai");
  const tombol = $("#simpan"); tombol.disabled = true; tombol.textContent = "Menyimpan…";
  try {
    if (ubahId) {
      const j = await API.ubah({ id: ubahId, ...row }); pakai(j);
      toast("Perubahan tersimpan ✓"); kosongkanForm(); gambarForm(); keLayar("lData");
    } else {
      row.id = idBaru(); row.dibuat = new Date().toISOString();
      const j = await API.tambah(row);
      if (j.antre) { toast("Tersimpan di HP — dikirim otomatis saat ada sinyal"); statusDariAntrean(); }
      else { pakai(j); toast("Trip tersimpan ✓"); statusDariAntrean(true); }
      balik = { jemput: row.jemput, antar: row.antar, jenis: row.jenis };
      const tgl = F.tanggal; kosongkanForm(); F.tanggal = tgl; langkah = 1; gambarForm(); window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (e) { if (!cekKunci(e)) toast(e.kode === "pin_salah" ? "Butuh PIN admin" : "Gagal: " + e.message); }
  tombol.disabled = false; ringkas(); $("#simpan").textContent = ubahId ? "Simpan perubahan" : "Simpan trip";
}
function bukaUbah(r) {
  ubahId = r.id; balik = null;
  F.tanggal = r.tanggal || hariIni(); F.jenis = r.jenis; F.unit = r.unit; F.bayar = r.bayar || "CASH"; F.komplain = r.komplain === "YA" ? "YA" : "TIDAK";
  $("#jemput").value = r.jemput || ""; $("#antar").value = r.antar || "";
  isiUang("#bbm", r.bbm); isiUang("#tol", r.tol); isiUang("#alat", r.alat); isiUang("#lain", r.lain); isiUang("#nilai", r.nilai);
  $("#ketKomplain").value = r.ketKomplain || ""; $("#catatan").value = r.catatan || "";
  $("#judulUbah").textContent = `Mengubah trip #${r.no || "baru"} · ${tglPanjang(r.tanggal)}`;
  $("#cekUbah").hidden = !(S.akses && r.perluCek); $("#cekUbah").textContent = r.perluCek ? "⚠ Perlu dicek: " + r.perluCek : "";
  $("#btnSudahCek").hidden = !r.perluCek;
  if (r.driver && r.driver !== lsBaca("mj_driver", "")) $("#namaDriver").textContent = r.driver;
  langkah = 1; keLayar("lCatat"); gambarForm();
  if (r.driver) { $("#namaDriver").textContent = r.driver; }
}

// ---------- DATA ----------
const diBulan = b => S.rows.filter(r => (r.tanggal || "").startsWith(b));
function gambarData() {
  $("#bTeks").textContent = namaBulan(bulanAktif);
  const semua = diBulan(bulanAktif);
  const opsi = [["semua", `Semua (${semua.length})`]];
  if (S.akses) {
    opsi.push(["nilai", `Belum ada nilai (${semua.filter(belumNilai).length})`]);
    opsi.push(["cek", `Perlu cek (${semua.filter(r => r.perluCek).length})`]);
  }
  const driver = lsBaca("mj_driver", "");
  if (driver && !S.akses) opsi.push(["saya", `Trip saya (${semua.filter(r => r.driver === driver).length})`]);
  [...new Set([...JENIS, ...semua.map(r => r.jenis).filter(Boolean)])].forEach(j => { const n = semua.filter(r => r.jenis === j).length; if (n) opsi.push([j, `${j} (${n})`]); });
  if (semua.some(r => r.komplain === "YA")) opsi.push(["komplain", "Komplain"]);
  if (!opsi.some(o => o[0] === filterAktif)) filterAktif = "semua";
  $("#filterData").innerHTML = opsi.map(([k, t]) => `<button class="chip kecil${k === filterAktif ? " pilih" : ""}" data-k="${esc(k)}">${esc(t)}</button>`).join("");
  $("#filterData").querySelectorAll("button").forEach(b => b.onclick = () => { filterAktif = b.dataset.k; gambarData(); });

  const q = $("#cari").value.trim().toLowerCase();
  let list = semua.filter(r =>
    filterAktif === "semua" ? true : filterAktif === "nilai" ? belumNilai(r) : filterAktif === "cek" ? !!r.perluCek :
    filterAktif === "saya" ? r.driver === driver : filterAktif === "komplain" ? r.komplain === "YA" : r.jenis === filterAktif);
  if (q) list = list.filter(r => [r.jemput, r.antar, r.unit, r.driver, r.catatan, r.ketKomplain, r.jenis, r.bayar].join(" ").toLowerCase().includes(q));
  const antre = API.antre().filter(r => (r.tanggal || "").startsWith(bulanAktif));

  const nNilai = semua.filter(belumNilai).length;
  $("#infoData").innerHTML = S.akses && nNilai && filterAktif !== "nilai"
    ? `<div class="peringatan">⚠ ${nNilai} trip bulan ini belum ada nilai pembayaran.<button class="tombol garis kecil" id="keNilai">Isi sekarang</button></div>` : "";
  if ($("#keNilai")) $("#keNilai").onclick = () => { filterAktif = "nilai"; gambarData(); };

  if (!list.length && !antre.length) { $("#daftarTrip").innerHTML = `<div class="kosong">Belum ada trip di ${namaBulan(bulanAktif)}${filterAktif !== "semua" || q ? " untuk filter ini" : ""}.</div>`; return; }
  const grup = {};
  [...antre.map(r => ({ ...r, _antre: true })), ...list].forEach(r => (grup[r.tanggal] ||= []).push(r));
  $("#daftarTrip").innerHTML = Object.keys(grup).sort().reverse().map(t => {
    const isi = grup[t].sort((a, b) => (b.no || 1e9) - (a.no || 1e9));
    const tot = S.akses ? isi.reduce((s, r) => s + (r.nilai || 0), 0) : 0;
    return `<div class="hari"><b>${tglPanjang(t)}</b><span>${isi.length} trip${S.akses && tot ? " · " + rp(tot) : ""}</span></div>` + isi.map(r => {
      const tanda = (r.perluCek && S.akses ? `<span class="tanda cek">CEK</span>` : "") + (r.komplain === "YA" ? `<span class="tanda komplain">KOMPLAIN</span>` : "") + (r._antre ? `<span class="tanda cek">BELUM TERKIRIM</span>` : "");
      const kanan = S.akses
        ? (belumNilai(r) ? `<span class="kosong-n">isi nilai</span>` : rp(r.nilai)) + `<small>${esc(r.bayar || "")}</small>`
        : (r.bbm ? `BBM ${jt(r.bbm)}` : "") + `<small>${esc(r.bayar || "")}</small>`;
      return `<button class="item${r._antre ? " antre" : ""}" data-id="${esc(r.id)}">
        <span class="jenis ${kelasJenis(r.jenis)}">${esc(singkatJenis(r.jenis))}</span>
        <span class="tengah"><b>${esc(r.jemput)} → ${esc(r.antar)}</b><span>${esc(r.jenis)} · ${esc(r.unit)} · ${esc(r.driver)}${tanda}</span></span>
        <span class="kanan-i">${kanan}</span></button>`;
    }).join("");
  }).join("");
  $("#daftarTrip").querySelectorAll(".item").forEach(b => b.onclick = () => {
    const r = S.rows.find(x => x.id === b.dataset.id);
    if (r) bukaUbah(r); else toast("Trip ini masih menunggu sinyal untuk dikirim");
  });
}

// ---------- REKAP ----------
function hitung(b) {
  const rows = diBulan(b), biaya = S.biaya.filter(x => x.bulan === b);
  const jum = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const h = { bulan: b, judul: namaBulan(b), rows, biaya, trip: rows.length, pemasukan: jum("nilai"), bbm: jum("bbm"), tol: jum("tol"), alat: jum("alat"), lain: jum("lain"),
    biayaBulan: biaya.reduce((s, x) => s + x.nilai, 0), tanpaNilai: rows.filter(belumNilai).length, perluCek: rows.filter(r => r.perluCek).length };
  h.biayaTrip = h.bbm + h.tol + h.alat + h.lain;
  h.keluar = h.biayaTrip + h.biayaBulan;
  h.sisa = h.pemasukan - h.keluar;
  const per = k => { const o = {}; rows.forEach(r => { const v = r[k] || "—"; o[v] ||= { nama: v, trip: 0, nilai: 0, bbm: 0 }; o[v].trip++; o[v].nilai += r.nilai || 0; o[v].bbm += r.bbm || 0; }); return Object.values(o).sort((a, c) => c.nilai - a.nilai || c.trip - a.trip); };
  h.perJenis = per("jenis"); h.perBayar = per("bayar"); h.perUnit = per("unit"); h.perDriver = per("driver");
  return h;
}
function gambarRekap() {
  $("#rekapKunci").hidden = S.akses; $("#rekapIsi").hidden = !S.akses;
  if (!S.akses) return;
  const h = hitung(bulanAktif);
  $("#rTeks").textContent = h.judul;
  $("#angkaRekap").innerHTML = `
    <div><b>${h.trip}</b><span>trip</span></div>
    <div><b>${jt(h.pemasukan)}</b><span>pemasukan</span></div>
    <div><b>${jt(h.keluar)}</b><span>pengeluaran</span></div>
    <div class="sisa"><b>${jt(h.sisa)}</b><span>sisa</span></div>`;
  $("#peringRekap").innerHTML = h.tanpaNilai || h.perluCek
    ? `<div class="peringatan">⚠ ${[h.tanpaNilai && `${h.tanpaNilai} trip belum ada nilai`, h.perluCek && `${h.perluCek} perlu dicek`].filter(Boolean).join(" · ")} — angka belum final.<button class="tombol garis kecil" id="keData">Lihat</button></div>` : "";
  if ($("#keData")) $("#keData").onclick = () => { filterAktif = h.tanpaNilai ? "nilai" : "cek"; keLayar("lData"); };

  const baris = (t, n, kelas = "") => `<tr class="${kelas}"><td>${t}</td><td class="n">${n}</td></tr>`;
  $("#tabelHitung").innerHTML =
    baris(`<b>Pemasukan</b> <span class="catatan-kecil">(${h.trip} trip)</span>`, `<b>${rp(h.pemasukan)}</b>`) +
    `<tr class="grup"><td colspan="2">Biaya jalan</td></tr>` +
    [["BBM", h.bbm], ["Tol", h.tol], ["Alat medis", h.alat], ["Pengeluaran lain", h.lain]].map(([t, n]) => baris(t, n ? "−" + rp(n) : "–", n ? "min" : "")).join("") +
    `<tr class="grup"><td colspan="2">Biaya bulanan</td></tr>` +
    (h.biaya.length ? h.biaya.map(x => baris(esc(x.ket || x.jenis), "−" + rp(x.nilai), "min")).join("") : baris(`<span class="catatan-kecil">Belum ada — tambah di bawah</span>`, "–")) +
    `<tr class="total"><td>Sisa</td><td class="n">${rp(h.sisa)}</td></tr>`;

  $("#tabelBiaya").innerHTML = h.biaya.length
    ? `<tr><th>Biaya</th><th class="n">Nilai</th><th></th></tr>` + h.biaya.map(x => `<tr><td><b>${esc(x.jenis)}</b> <span class="catatan-kecil">${esc(x.ket || "")}</span></td><td class="n">${rp(x.nilai)}</td><td class="hapus-b"><button data-id="${esc(x.id)}" aria-label="Hapus">✕</button></td></tr>`).join("")
    : `<tr><td class="catatan-kecil">Belum ada biaya bulanan untuk ${h.judul}.</td></tr>`;
  $("#tabelBiaya").querySelectorAll("button").forEach(b => b.onclick = async () => {
    if (!confirm("Hapus biaya ini?")) return;
    try { pakai(await API.biayaHapus(b.dataset.id)); toast("Biaya dihapus"); } catch (e) { toast("Gagal: " + e.message); }
  });
  chips($("#biayaJenis"), JENIS_BIAYA, biayaJenis, v => { biayaJenis = v; gambarRekap(); }, "chip kecil");

  gambarGrafik();
  const tabel = (judul, arr) => `<div class="sub">${judul}</div><table class="rekap"><tr><th>${judul}</th><th class="n">Trip</th><th class="n">Pemasukan</th></tr>` +
    arr.map(x => `<tr><td>${esc(x.nama)}</td><td class="n">${x.trip}</td><td class="n">${rp(x.nilai)}</td></tr>`).join("") + `</table>`;
  $("#tabelPer").innerHTML = tabel("Jenis", h.perJenis) + tabel("Pembayaran", h.perBayar) + tabel("Unit", h.perUnit) + tabel("Driver", h.perDriver);
}
function gambarGrafik() {
  const bulan = Array.from({ length: 6 }, (_, i) => geserBulan(bulanAktif, i - 5)).map(hitung);
  const W = 340, H = 190, kiri = 4, bawah = 22, atas = 18;
  const maks = Math.max(1, ...bulan.map(b => Math.max(b.pemasukan, b.sisa))), min = Math.min(0, ...bulan.map(b => b.sisa));
  const skala = (H - bawah - atas) / (maks - min), y0 = atas + maks * skala;
  const lebar = (W - kiri * 2) / 6, bw = lebar * 0.3;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pemasukan dan sisa 6 bulan">`;
  s += `<line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#d5d8e3"/>`;
  bulan.forEach((b, i) => {
    const x = kiri + i * lebar + lebar / 2;
    const hp = b.pemasukan * skala, hs = Math.abs(b.sisa) * skala;
    s += `<rect x="${x - bw - 2}" y="${y0 - hp}" width="${bw}" height="${Math.max(hp, 0.5)}" rx="4" fill="#1b1e3d"><title>${b.judul}: pemasukan ${rp(b.pemasukan)}</title></rect>`;
    s += `<rect x="${x + 2}" y="${b.sisa >= 0 ? y0 - hs : y0}" width="${bw}" height="${Math.max(hs, 0.5)}" rx="4" fill="#ec151d"><title>${b.judul}: sisa ${rp(b.sisa)}</title></rect>`;
    if (b.pemasukan) s += `<text x="${x - bw / 2 - 2}" y="${y0 - hp - 5}" font-size="10" text-anchor="middle" fill="#15172b">${jt(b.pemasukan)}</text>`;
    s += `<text x="${x}" y="${H - 8}" font-size="12" text-anchor="middle" fill="${b.bulan === bulanAktif ? "#ec151d" : "#676a80"}" font-weight="${b.bulan === bulanAktif ? 700 : 400}">${BULAN[Number(b.bulan.slice(5)) - 1].slice(0, 3)}</text>`;
  });
  $("#grafik").innerHTML = s + "</svg>";
}
async function tambahBiaya() {
  const nilai = nilaiUang("#biayaNilai");
  if (!nilai) { toast("Isi nilai biayanya"); return; }
  const b = { id: idBaru(), bulan: bulanAktif, jenis: biayaJenis, ket: $("#biayaKet").value.trim() || biayaJenis, nilai };
  try { pakai(await API.biayaTambah([b])); $("#biayaKet").value = ""; $("#biayaNilai").value = ""; toast("Biaya ditambahkan ✓"); }
  catch (e) { toast("Gagal: " + e.message); }
}

// ---------- PENGATURAN ----------
function gambarAtur() {
  $("#infoAkses").innerHTML = API.MODE_COBA ? "<b>Mode coba</b> — data hanya tersimpan di perangkat ini." :
    S.akses ? "Kamu masuk sebagai <b>admin</b>: bisa isi nilai pembayaran, biaya bulanan, rekap &amp; ekspor." : "Kamu masuk sebagai <b>tim/driver</b>. Admin bisa masuk dengan PIN admin.";
  $("#formAdmin").hidden = S.akses; $("#btnKeluarAdmin").hidden = !S.akses; $("#aturAdmin").hidden = !S.akses;
  if (S.akses && !$("#lapisAtur").classList.contains("tampil")) {
    $("#dDriver").value = (S.daftar.driver || []).join("\n");
    $("#dUnit").value = (S.daftar.unit || []).join("\n");
    $("#dTempat").value = (S.daftar.tempat || []).join("\n");
  }
  $("#versi").textContent = `Versi ${VERSI}${API.MODE_COBA ? " · mode coba" : ""}`;
  if (S.akses && S.langganan?.sampai) $("#infoAkses").innerHTML += `<br>Langganan aktif sampai <b>${tglIndo(S.langganan.sampai)}</b> (${S.langganan.sisaHari} hari lagi).`;
}
async function masukAdmin(pin) {
  if (!/^\d{4,8}$/.test(pin)) { toast("PIN berupa angka"); return; }
  API.pasangPin(pin);
  try { const j = await API.muat(); if (!j.akses) throw Object.assign(new Error("pin_salah"), { kode: "pin_salah" }); pakai(j); toast("Mode admin aktif"); statusDariAntrean(true); }
  catch (e) { if (cekKunci(e)) return; API.lepasPin(); toast(e.kode === "terkunci" ? "Terlalu banyak percobaan. Tunggu 15 menit." : "PIN admin salah"); muat(); }
}
async function impor(file) {
  const info = $("#infoImpor");
  try {
    const d = JSON.parse(await file.text());
    const trip = (d.trip || []).filter(r => r.id && r.tanggal);
    if (!trip.length) throw new Error("file tidak berisi trip");
    for (let i = 0; i < trip.length; i += 40) {
      info.textContent = `Mengirim ${Math.min(i + 40, trip.length)} / ${trip.length} trip…`;
      pakai(await API.tambahBanyak(trip.slice(i, i + 40)));
    }
    if ((d.biaya || []).length) pakai(await API.biayaTambah(d.biaya));
    info.textContent = `Selesai: ${trip.length} trip${d.biaya?.length ? ` + ${d.biaya.length} biaya` : ""} diimpor (yang sudah ada dilewati).`;
    toast("Impor selesai ✓");
  } catch (e) { info.textContent = "Gagal impor: " + e.message; }
}

// ---------- anti-salin: blok salin/potong/klik kanan/seret di luar kolom isian ----------
function pasangAntiSalin() {
  const bolehDiSalin = t => t && t.closest && t.closest("input, textarea, select, [contenteditable]");
  ["copy", "cut", "contextmenu", "dragstart", "selectstart"].forEach(ev => document.addEventListener(ev, e => {
    if (bolehDiSalin(e.target)) return;
    e.preventDefault();
    if (ev === "copy" || ev === "cut") toast("Data aplikasi tidak bisa disalin");
  }, true));
  document.addEventListener("keydown", e => {                                        // Ctrl/Cmd + A, C, S, P, U di luar kolom isian
    if (!(e.ctrlKey || e.metaKey) || bolehDiSalin(e.target)) return;
    if (["a", "c", "s", "p", "u"].includes(e.key.toLowerCase())) { e.preventDefault(); if (e.key.toLowerCase() === "p") toast("Gunakan menu Ekspor (admin) untuk laporan"); }
  }, true);
}

// ---------- pasang ----------
function pasang() {
  pasangAntiSalin();
  bulanAktif = hariIni().slice(0, 7);
  document.querySelectorAll("nav.bawah button").forEach(b => b.onclick = () => keLayar(b.dataset.layar));
  $("#btnMasuk").onclick = masuk;
  $("#pinMasuk").onkeydown = e => { if (e.key === "Enter") masuk(); };
  $("#gantiDriver").onclick = () => { $("#pilihDriver").hidden = !$("#pilihDriver").hidden; };
  $("#tglKurang").onclick = () => { F.tanggal = geser(F.tanggal, -1); gambarForm(); };
  $("#tglTambah").onclick = () => { F.tanggal = geser(F.tanggal, 1); gambarForm(); };
  $("#tglInput").onchange = e => { if (e.target.value) { F.tanggal = e.target.value; gambarForm(); } };
  $("#tukar").onclick = () => { const a = $("#jemput").value; $("#jemput").value = $("#antar").value; $("#antar").value = a; gambarForm(); };
  $("#jenisLain").addEventListener("input", e => {
    const v = e.target.value.trim(); F.jenis = v;
    $("#jenisChips").querySelectorAll("button").forEach(b => b.classList.toggle("pilih", b.dataset.v === v));
    ringkas();
  });
  $("#jenisLain").addEventListener("keydown", e => { if (e.key === "Enter" && lengkap(1)) { e.target.blur(); keLangkah(2); } });
  ["#jemput", "#antar"].forEach(id => { $(id).addEventListener("input", ringkas); $(id).addEventListener("change", gambarForm); });
  ["#nilai", "#bbm", "#tol", "#alat", "#lain", "#biayaNilai"].forEach(id => uangInput($(id)));
  $("#simpan").onclick = simpan;
  $("#lanjut").onclick = () => keLangkah(langkah + 1);
  $("#kembali").onclick = () => keLangkah(langkah - 1);
  $("#batalUbah").onclick = () => { kosongkanForm(); F.tanggal = hariIni(); langkah = 1; gambarForm(); keLayar("lData"); };
  $("#btnHapus").onclick = async () => {
    if (!confirm("Hapus trip ini? Tidak bisa dibatalkan.")) return;
    try { pakai(await API.hapus(ubahId)); toast("Trip dihapus"); kosongkanForm(); gambarForm(); keLayar("lData"); } catch (e) { toast("Gagal: " + e.message); }
  };
  $("#btnSudahCek").onclick = async () => {
    try { pakai(await API.ubah({ id: ubahId, perluCek: "" })); toast("Ditandai sudah dicek ✓"); $("#cekUbah").hidden = true; $("#btnSudahCek").hidden = true; } catch (e) { toast("Gagal: " + e.message); }
  };
  $("#bKurang").onclick = $("#rKurang").onclick = () => { bulanAktif = geserBulan(bulanAktif, -1); gambarData(); gambarRekap(); };
  $("#bTambah").onclick = $("#rTambah").onclick = () => { bulanAktif = geserBulan(bulanAktif, 1); gambarData(); gambarRekap(); };
  $("#cari").oninput = gambarData;
  $("#biayaSimpan").onclick = tambahBiaya;
  $("#btnAdminRekap").onclick = () => masukAdmin($("#pinAdminRekap").value.trim()).then(() => $("#pinAdminRekap").value = "");
  $("#btnAtur").onclick = () => { gambarAtur(); $("#lapisAtur").classList.add("tampil"); };
  $("#tutupAtur").onclick = () => $("#lapisAtur").classList.remove("tampil");
  $("#lapisAtur").onclick = e => { if (e.target.id === "lapisAtur") $("#lapisAtur").classList.remove("tampil"); };
  $("#btnAdmin").onclick = () => masukAdmin($("#pinAdmin").value.trim()).then(() => { $("#pinAdmin").value = ""; gambarAtur(); });
  $("#btnKeluarAdmin").onclick = () => { API.lepasPin(); S.akses = false; muat().then(gambarAtur); toast("Keluar dari mode admin"); };
  $("#simpanDaftar").onclick = async () => {
    const baris = id => [...new Set($(id).value.split("\n").map(s => s.trim()).filter(Boolean))];
    try { pakai(await API.daftar({ driver: baris("#dDriver"), unit: baris("#dUnit"), tempat: baris("#dTempat") })); toast("Daftar tersimpan ✓"); } catch (e) { toast("Gagal: " + e.message); }
  };
  const gantiPin = async (fn, id) => {
    const p = $(id).value.trim();
    try { await fn(p); if (fn === API.gantiPin) API.pasangPin(p); $(id).value = ""; toast("PIN diganti ✓"); } catch (e) { toast(e.message); }
  };
  $("#btnPinTim").onclick = () => gantiPin(API.gantiPinTim, "#pinTimBaru");
  $("#btnPinAdmin").onclick = () => gantiPin(API.gantiPin, "#pinAdminBaru");
  $("#fileImpor").onchange = e => { if (e.target.files[0]) impor(e.target.files[0]); };
  $("#btnSegarkan").onclick = () => { muat(); toast("Memuat ulang…"); };
  $("#btnKeluar").onclick = () => { if (confirm("Keluar? PIN harus dimasukkan lagi di HP ini.")) { $("#lapisAtur").classList.remove("tampil"); keLogin(); } };
  $("#ePdf").onclick = () => EKSPOR.pdf(hitung(bulanAktif)).catch(e => toast(e.message));
  $("#eXlsx").onclick = () => EKSPOR.xlsx(hitung(bulanAktif)).catch(e => toast(e.message));
  $("#eWa").onclick = () => EKSPOR.wa(hitung(bulanAktif));
  $("#eSheet").onclick = () => S.sheetUrl ? window.open(S.sheetUrl, "_blank") : toast(API.MODE_COBA ? "Mode coba belum tersambung ke Google Sheet" : "Link sheet belum tersedia");
  window.addEventListener("online", muat);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#aplikasi").hidden) muat(); });

  $("#kunciCek").onclick = async () => {
    $("#kunciCek").disabled = true; $("#kunciCek").textContent = "Memeriksa…";
    if (lsBaca("mj_pin_tim", "")) await muat();
    else { try { await API.muat(); } catch (e) { if (!cekKunci(e)) { bukaKunci(); keLogin(); } } }
    $("#kunciCek").disabled = false; $("#kunciCek").textContent = "Cek lagi";
  };
  const kunciLama = lsBaca("mj_terkunci", "");
  if (kunciLama) { try { terkunci(JSON.parse(kunciLama)); } catch (_) { terkunci(); } $("#kunciCek").click(); return; }
  if (!lsBaca("mj_pin_tim", "")) { keLogin(); return; }
  $("#aplikasi").hidden = false;
  const c = API.simpanan(); if (c) pakai(c); else gambarSemua();
  statusDariAntrean(); muat();
}
pasang();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const adaLama = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => document.addEventListener("visibilitychange", () => { if (!document.hidden) r.update(); })).catch(() => {});
  let sudah = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (adaLama && !sudah) { sudah = true; location.reload(); } });
}

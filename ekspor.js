// Ekspor laporan bulanan: PDF, Excel, teks WhatsApp. Pustaka PDF/Excel baru diunduh saat tombol ditekan.
const EKSPOR = (() => {
  const PUSTAKA = {
    pdf: ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"],
    xlsx: ["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"],
  };
  const dimuat = {};
  const skrip = src => dimuat[src] ||= new Promise((ok, gagal) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok;
    s.onerror = () => { delete dimuat[src]; gagal(new Error("Butuh internet untuk ekspor ini")); };
    document.head.appendChild(s);
  });
  const muatPustaka = async k => { for (const s of PUSTAKA[k]) await skrip(s); };
  const rpx = n => "Rp" + (Number(n) || 0).toLocaleString("id-ID");
  const tglx = s => s ? s.split("-").reverse().join("/") : "";
  const namaFile = (d, ext) => `Laporan_Perjalanan_MJS_${d.judul}`.replace(/[^\w\-]+/g, "_") + "." + ext;
  const dicetak = () => new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hp = () => matchMedia("(pointer: coarse)").matches;
  const urut = d => [...d.rows].sort((a, b) => (a.tanggal > b.tanggal ? 1 : a.tanggal < b.tanggal ? -1 : (a.no || 0) - (b.no || 0)));

  async function simpan(blob, nama) {
    const file = new File([blob], nama, { type: blob.type });
    if (hp() && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nama }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast(`${nama} tersimpan di Unduhan`);
  }
  const gambar = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const barisHitung = d => [
    ["Pemasukan (" + d.trip + " trip)", rpx(d.pemasukan)],
    ["Hak driver", "-" + rpx(d.hak)], ["Fee informan", "-" + rpx(d.fee)],
    ["BBM", "-" + rpx(d.bbm)], ["Tol", "-" + rpx(d.tol)], ["Alat medis", "-" + rpx(d.alat)], ["Pengeluaran lain", "-" + rpx(d.lain)],
    ...d.biaya.map(x => [`${x.jenis}${x.ket && x.ket !== x.jenis ? " - " + x.ket : ""}`, "-" + rpx(x.nilai)]),
    ["SISA", rpx(d.sisa)],
  ];

  // ---------- PDF ----------
  async function pdf(d) {
    toast("Membuat PDF…");
    await muatPustaka("pdf");
    const doc = new jspdf.jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), lg = await gambar("logo.png");
    doc.setFillColor(27, 30, 61); doc.rect(0, 0, W, 30, "F");
    doc.setFillColor(236, 21, 29); doc.rect(0, 30, W, 1.4, "F");
    if (lg) { doc.setFillColor(255, 255, 255); doc.roundedRect(12, 6, 18, 18, 2.5, 2.5, "F"); doc.addImage(lg, "PNG", 13.5, 10, 15, 15 * lg.height / lg.width); }
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Laporan Data Perjalanan", 35, 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`CV. Muda Jaya Sembada  |  ${d.judul}`, 35, 21);
    doc.setFontSize(8); doc.setTextColor(180); doc.text(`Dicetak ${dicetak()}`, W - 12, 21, { align: "right" });

    const kotak = [[String(d.trip), "trip"], [rpx(d.pemasukan), "pemasukan"], [rpx(d.keluar), "pengeluaran"], [rpx(d.sisa), "sisa"]];
    const kw = (W - 24 - 9) / 4;
    kotak.forEach(([n, t], i) => {
      const x = 12 + i * (kw + 3);
      if (i === 3) doc.setFillColor(253, 236, 235); else doc.setFillColor(236, 238, 247);
      doc.roundedRect(x, 37, kw, 17, 2, 2, "F");
      doc.setTextColor(i === 3 ? 236 : 27, i === 3 ? 21 : 30, i === 3 ? 29 : 61); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(n, x + 4, 46);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(100); doc.text(t, x + 4, 51);
    });
    let y = 60;
    if (d.tanpaNilai || d.perluCek) {
      doc.setFontSize(8.5); doc.setTextColor(150, 100, 0);
      doc.text(`Catatan: ${[d.tanpaNilai && d.tanpaNilai + " trip belum ada nilai pembayaran", d.perluCek && d.perluCek + " trip perlu dicek"].filter(Boolean).join(", ")}.`, 12, y);
      y += 5;
    }
    const gaya = { styles: { fontSize: 8.5, cellPadding: 1.8, textColor: 20 }, headStyles: { fillColor: [27, 30, 61], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 246, 250] }, margin: { left: 12, right: 12 } };
    const judul = (t, yy) => { doc.setTextColor(27, 30, 61); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(t, 12, yy); };

    judul("Perhitungan", y + 4);
    const hit = barisHitung(d);
    doc.autoTable({ ...gaya, startY: y + 6, head: [["Uraian", "Nilai"]], body: hit, tableWidth: 110,
      columnStyles: { 1: { halign: "right" } },
      didParseCell: c => { if (c.section === "body" && c.row.index === hit.length - 1) { c.cell.styles.fontStyle = "bold"; c.cell.styles.fillColor = [253, 236, 235]; } } });
    const ringkasPer = (t, arr, yy) => { judul(t, yy); doc.autoTable({ ...gaya, startY: yy + 2, head: [[t, "Trip", "Pemasukan"]], body: arr.map(x => [x.nama, x.trip, rpx(x.nilai)]), tableWidth: (W - 30) / 2, columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }, margin: { left: t === "Pembayaran" || t === "Unit" ? 12 + (W - 30) / 2 + 6 : 12 } }); return doc.lastAutoTable.finalY; };
    y = doc.lastAutoTable.finalY + 8;
    const a = ringkasPer("Jenis", d.perJenis, y), b = ringkasPer("Pembayaran", d.perBayar, y);
    y = Math.max(a, b) + 8;

    doc.addPage();
    judul(`Rincian trip — ${d.judul}`, 16);
    doc.autoTable({ ...gaya, startY: 19, styles: { ...gaya.styles, fontSize: 7.5 },
      head: [["No", "Tanggal", "Jenis", "Jemput", "Antar", "Unit", "Driver", "Bayar", "Nilai", "Hak drv", "Fee", "BBM", "Tol", "Lain"]],
      body: urut(d).map((r, i) => [i + 1, tglx(r.tanggal), r.jenis, r.jemput, r.antar, r.unit, r.driver, r.bayar, r.nilai ? rpx(r.nilai) : "-", r.hakDriver ? rpx(r.hakDriver) : "", r.fee ? rpx(r.fee) : "", r.bbm ? rpx(r.bbm) : "", r.tol ? rpx(r.tol) : "", (r.alat || 0) + (r.lain || 0) ? rpx((r.alat || 0) + (r.lain || 0)) : ""]),
      columnStyles: { 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" }, 13: { halign: "right" } } });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Halaman ${i} dari ${n}`, W - 12, 290, { align: "right" });
      doc.text("RAHASIA - hanya untuk internal CV. Muda Jaya Sembada. Dilarang disebarkan.", 12, 290);
    }
    doc.setProperties({ title: `Laporan Perjalanan ${d.judul}`, author: "CV. Muda Jaya Sembada", subject: "Rahasia - internal", creator: "Data Perjalanan MJS" });
    await simpan(doc.output("blob"), namaFile(d, "pdf"));
  }

  // ---------- Excel ----------
  async function xlsx(d) {
    toast("Membuat Excel…");
    await muatPustaka("xlsx");
    const wb = XLSX.utils.book_new();
    const kolom = ["No", "Tanggal", "Jenis", "Titik jemput", "Titik antar", "Unit", "Driver", "Pembayaran", "Nilai order", "Hak driver", "Fee informan", "BBM", "Tol", "Alat medis", "Pengeluaran lain", "Komplain", "Ket. komplain", "Catatan", "Perlu cek"];
    const isi = urut(d).map((r, i) => [i + 1, tglx(r.tanggal), r.jenis, r.jemput, r.antar, r.unit, r.driver, r.bayar, r.nilai || 0, r.hakDriver || 0, r.fee || 0, r.bbm || 0, r.tol || 0, r.alat || 0, r.lain || 0, r.komplain, r.ketKomplain || "", r.catatan || "", r.perluCek || ""]);
    const n = isi.length + 1;
    const ws = XLSX.utils.aoa_to_sheet([kolom, ...isi]);
    if (isi.length) XLSX.utils.sheet_add_aoa(ws, [["", "TOTAL", "", "", "", "", "", "", { f: `SUM(I2:I${n})` }, { f: `SUM(J2:J${n})` }, { f: `SUM(K2:K${n})` }, { f: `SUM(L2:L${n})` }, { f: `SUM(M2:M${n})` }, { f: `SUM(N2:N${n})` }, { f: `SUM(O2:O${n})` }]], { origin: n });
    ws["!autofilter"] = { ref: `A1:S${n}` };
    ws["!cols"] = [5, 11, 14, 26, 26, 10, 10, 11, 12, 12, 12, 11, 11, 11, 12, 9, 22, 30, 30].map(w => ({ wch: w }));
    for (let r = 2; r <= n + 1; r++) ["I", "J", "K", "L", "M", "N", "O"].forEach(c => { if (ws[c + r]) ws[c + r].z = "#,##0"; });
    XLSX.utils.book_append_sheet(wb, ws, "Rincian");
    const rek = XLSX.utils.aoa_to_sheet([["Laporan Data Perjalanan — CV. Muda Jaya Sembada"], [d.judul], [], ["Uraian", "Nilai"],
      [`Pemasukan (${d.trip} trip)`, d.pemasukan], ["Hak driver", -d.hak], ["Fee informan", -d.fee], ["BBM", -d.bbm], ["Tol", -d.tol], ["Alat medis", -d.alat], ["Pengeluaran lain", -d.lain],
      ...d.biaya.map(x => [`${x.jenis}${x.ket && x.ket !== x.jenis ? " - " + x.ket : ""}`, -x.nilai]), ["SISA", d.sisa], [],
      ["Jenis", "Trip", "Pemasukan"], ...d.perJenis.map(x => [x.nama, x.trip, x.nilai]), [],
      ["Pembayaran", "Trip", "Pemasukan"], ...d.perBayar.map(x => [x.nama, x.trip, x.nilai]), [],
      ["Unit", "Trip", "Pemasukan"], ...d.perUnit.map(x => [x.nama, x.trip, x.nilai])]);
    rek["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];
    Object.keys(rek).forEach(k => { if (/^[BC]\d+$/.test(k) && typeof rek[k].v === "number") rek[k].z = "#,##0"; });
    XLSX.utils.book_append_sheet(wb, rek, "Rekap");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await simpan(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), namaFile(d, "xlsx"));
  }

  // ---------- WhatsApp ----------
  async function wa(d) {
    const t = [`*Laporan Perjalanan — ${d.judul}*`, `CV. Muda Jaya Sembada`, ``,
      `Trip: ${d.trip}`, ...d.perJenis.map(x => `• ${x.nama}: ${x.trip}`), ``,
      `Pemasukan: ${rpx(d.pemasukan)}`, `Hak driver: -${rpx(d.hak)}`, ...(d.fee ? [`Fee informan: -${rpx(d.fee)}`] : []), `BBM: -${rpx(d.bbm)}`, `Tol: -${rpx(d.tol)}`,
      ...(d.alat ? [`Alat medis: -${rpx(d.alat)}`] : []), ...(d.lain ? [`Lain-lain: -${rpx(d.lain)}`] : []),
      ...d.biaya.map(x => `${x.ket || x.jenis}: -${rpx(x.nilai)}`), `*Sisa: ${rpx(d.sisa)}*`,
      ...(d.tanpaNilai ? [``, `_${d.tanpaNilai} trip belum ada nilai pembayaran_`] : [])].join("\n");
    if (hp() && navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(t); toast("Teks laporan disalin — tempel di WhatsApp"); }
    catch (_) { window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank"); }
  }
  return { pdf, xlsx, wa };
})();

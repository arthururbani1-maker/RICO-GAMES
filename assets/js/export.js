/* ============ RICO GAMES ERP — Exportação (XLSX nativo + PDF) ============
   Gera .xlsx real (ZIP "store" + OOXML) sem nenhuma biblioteca externa — funciona 100% offline. */
const Exporter = (function () {

  /* ---------- ZIP (modo store / sem compressão) ---------- */
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  const enc = s => new TextEncoder().encode(s);
  function u16(a, v) { a.push(v & 255, (v >>> 8) & 255); }
  function u32(a, v) { a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }

  function zip(files) {
    const parts = [], central = []; let offset = 0;
    files.forEach(f => {
      const name = enc(f.name), data = (f.data instanceof Uint8Array) ? f.data : enc(f.data);
      const crc = crc32(data), size = data.length;
      const lh = [];
      u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0); u16(lh, 0); u16(lh, 0); u16(lh, 0);
      u32(lh, crc); u32(lh, size); u32(lh, size); u16(lh, name.length); u16(lh, 0);
      const lhB = new Uint8Array(lh);
      parts.push(lhB, name, data);
      const cd = [];
      u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0);
      u32(cd, crc); u32(cd, size); u32(cd, size); u16(cd, name.length); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0); u32(cd, 0); u32(cd, offset);
      central.push({ head: new Uint8Array(cd), name });
      offset += lhB.length + name.length + size;
    });
    const cdParts = []; let cdSize = 0;
    central.forEach(c => { cdParts.push(c.head, c.name); cdSize += c.head.length + c.name.length; });
    const end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, cdSize); u32(end, offset); u16(end, 0);
    const all = [...parts, ...cdParts, new Uint8Array(end)];
    const total = all.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total); let p = 0;
    all.forEach(a => { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---------- XLSX ---------- */
  const xmlEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function colRef(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  function sheetXML(aoa) {
    let rows = '';
    aoa.forEach((row, r) => {
      let cells = '';
      row.forEach((val, c) => {
        const ref = colRef(c) + (r + 1);
        if (typeof val === 'number' && isFinite(val)) cells += `<c r="${ref}"><v>${val}</v></c>`;
        else cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
      });
      rows += `<row r="${r + 1}">${cells}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  }

  function buildXlsx(sheetName, aoa) {
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXML(aoa) }
    ];
    return zip(files);
  }

  function download(filename, data, mime) {
    const blob = new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  return {
    xlsx(filename, sheetName, aoa) {
      try { download(filename, buildXlsx(sheetName || 'Planilha', aoa), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); Toast.ok('Excel exportado.'); }
      catch (e) { console.error(e); Toast.err('Falha ao gerar Excel.'); }
    },
    /* PDF via janela de impressão (usuário escolhe "Salvar como PDF") */
    pdf(title, innerHtml) {
      const w = window.open('', '_blank');
      if (!w) return Toast.err('Permita pop-ups para exportar PDF.');
      w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
        <style>
          *{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          body{margin:28px;color:#16202e}
          h1{font-size:20px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin-bottom:18px}
          .brand{display:flex;align-items:center;gap:10px;margin-bottom:16px;border-bottom:3px solid #43c925;padding-bottom:12px}
          .shield{width:34px;height:40px;background:#222831;border-radius:10px 10px 13px 13px/10px 10px 22px 22px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800}
          .kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
          .k{flex:1;min-width:130px;border:1px solid #e2e7ee;border-radius:8px;padding:10px 12px}
          .k .l{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px} .k .v{font-size:16px;font-weight:700;margin-top:3px}
          table{width:100%;border-collapse:collapse;font-size:11px} th{background:#f1f4f8;text-align:left;padding:7px 8px;border-bottom:2px solid #e2e7ee} td{padding:6px 8px;border-bottom:1px solid #eef1f5} .num{text-align:right}
          @media print{.noprint{display:none}}
        </style></head><body>
        <div class="brand"><div class="shield">R</div><div><h1>Rico Games</h1><div class="sub">${title}</div></div></div>
        ${innerHtml}
        <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
        </body></html>`);
      w.document.close();
    }
  };
})();

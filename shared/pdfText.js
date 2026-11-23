/**
 * Turns a pdf.js document into plain text lines (items on the same row are joined,
 * table cells separated by "  |  ", lines starting in the right half prefixed ">> ").
 * Works in the browser and in Node.
 */
export async function pdfToText(doc) {
  const pages = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const width = (page.view && page.view[2]) || 600;
    const rows = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, w: it.width || 0, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      // text that starts in the right half is marked ">> " so two-column tables keep their column
      let line = r.items[0].x > width * 0.45 ? '>> ' : ''; let end = null;
      for (const it of r.items) {
        if (end !== null) line += it.x - end > 18 ? '  |  ' : (it.x - end > 1 ? ' ' : '');
        line += it.s; end = it.x + it.w;
      }
      return line.replace(/\s+/g, ' ').replace(/ \| /g, '  |  ').trim();
    }).join('\n'));
  }
  return pages.join('\n\n');
}

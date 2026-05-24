// PDF writer for the read-only viewer modals. Wraps `jspdf` +
// `jspdf-autotable` behind a narrow surface. `jspdf` is ~160 KB
// minified so the import is lazy — only fetched when the user
// actually picks PDF from the Save-as menu. Numbers are
// pre-stringified by the caller via `formatBalance` / `formatNumber`
// so this module stays locale-pure.

export const PDF_MIME_TYPE = "application/pdf";

export type PdfTableArgs = {
  title: string;
  headers: readonly string[];
  // 2-D string array (no header row). Numbers should be pre-formatted
  // strings — see the rationale on the module comment.
  rows: readonly (readonly string[])[];
};

export async function buildHistoryPdf(args: PdfTableArgs): Promise<Uint8Array> {
  const { title, headers, rows } = args;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 40, 36);

  autoTable(doc, {
    head: [Array.from(headers)],
    body: rows.map((r) => Array.from(r)),
    startY: 56,
    margin: { left: 40, right: 40 },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 4,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [40, 44, 52],
      textColor: [220, 223, 228],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [245, 246, 248] },
    didDrawPage: () => {
      const page = (
        doc.internal as unknown as { getNumberOfPages(): number }
      ).getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `${page}`,
        pageWidth - 40,
        doc.internal.pageSize.getHeight() - 16,
        { align: "right" },
      );
    },
  });

  const buf = doc.output("arraybuffer");
  return new Uint8Array(buf);
}

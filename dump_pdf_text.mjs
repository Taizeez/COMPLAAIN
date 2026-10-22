import fs from 'fs';

// Mock browser globals for MuPDF engine
globalThis.window = globalThis;
globalThis.document = { getElementById: () => ({ addEventListener: () => {} }) };

const mupdfMod = await import('./js/vendor/mupdf-engine.js');
const mupdf = mupdfMod.default || mupdfMod;

const pdfBytes = fs.readFileSync('test_agreement.pdf');
const doc = mupdf.Document.openDocument(new Uint8Array(pdfBytes), 'application/pdf');
console.log('Page count:', doc.countPages());

for (let i = 0; i < doc.countPages(); i++) {
  const page = doc.loadPage(i);
  const st = page.toStructuredText('preserve-whitespace');
  console.log(`\n=== PAGE ${i + 1} TEXT ===`);
  console.log(st.asText());
  page.destroy();
}
doc.destroy();

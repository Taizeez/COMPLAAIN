import fs from 'fs';

globalThis.window = globalThis;
globalThis.document = { getElementById: () => ({ addEventListener: () => {} }) };

const mupdfMod = await import('./js/vendor/mupdf-engine.js');
globalThis.mupdf = mupdfMod.default || mupdfMod;

await import('./js/pii-engine.js');
await import('./js/ocr-engine.js');
await import('./js/pdf-redactor.js');

const pdfBytes = fs.readFileSync('test_agreement.pdf');
const redactor = new PDFRedactor();
await redactor.init();

const cfg = {
  bvn: true,
  nin: true,
  cac: true,
  cards: true,
  iban: true,
  emails: true,
  phones: true,
  names: true,
  style: 'blackout',
  enableOcr: false
};

const res = await redactor.redactDocument(new Uint8Array(pdfBytes), cfg);
console.log('--- REDACTION RESULT ---');
console.log(`Hits: ${res.hits}, Pages touched: ${res.pagesTouched}`);
console.log('Log items:');
res.log.forEach(l => {
  console.log(`Page ${l.page} | ${l.category} | "${l.orig}" -> "${l.replacement}"`);
});

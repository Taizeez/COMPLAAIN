/**
 * safeRedact PDF Engine
 * Integrates MuPDF WebAssembly for authentic stream-level PDF redaction,
 * Two-Pass Adaptive Entity Graph Extraction (Discovers names, aliases, companies, addresses),
 * plus Offline OCR (Tesseract WASM) & Pixel-Level Image Redaction for scanned documents.
 */

(function (global) {
  "use strict";

  const getPIIEngine = () => global.PIIEngine || globalThis.PIIEngine;

  class PDFRedactor {
    constructor() {
      this.mupdf = null;
      this.isReady = false;
      this.initPromise = null;
      this.ocrEngine = new OCREngine();
    }

    async init() {
      if (this.isReady && this.mupdf) return true;
      if (this.initPromise) return this.initPromise;

      this.initPromise = (async () => {
        try {
          if (global.mupdf) {
            this.mupdf = global.mupdf;
            this.isReady = true;
            return true;
          }
          if (typeof window !== "undefined") {
            const mod = await import("./vendor/mupdf-engine.js");
            this.mupdf = mod.default || mod;
            this.isReady = true;
            return true;
          }
        } catch (err) {
          console.warn("MuPDF native load failed, checking fallback:", err);
        }
        return false;
      })();

      return this.initPromise;
    }

    extractPageText(page) {
      const st = page.toStructuredText("preserve-whitespace");
      const lines = [];
      let cur = null;
      st.walk({
        beginLine(b) { cur = { text: "", bbox: [b[0], b[1], b[2], b[3]], chars: [] }; },
        onChar(c, _o, _f, _s, quad) { if (cur) { cur.text += c; cur.chars.push({ c, quad }); } },
        endLine() { if (cur) { lines.push(cur); cur = null; } },
      });
      for (const line of lines) {
        line.words = [];
        let w = null;
        const flush = () => { if (w && w.text.trim()) line.words.push(w); w = null; };
        for (const { c, quad } of line.chars) {
          if (/\s/.test(c)) { flush(); continue; }
          const x0 = Math.min(quad[0], quad[2], quad[4], quad[6]), y0 = Math.min(quad[1], quad[3], quad[5], quad[7]);
          const x1 = Math.max(quad[0], quad[2], quad[4], quad[6]), y1 = Math.max(quad[1], quad[3], quad[5], quad[7]);
          if (!w) w = { text: "", bbox: [x0, y0, x1, y1] };
          w.text += c;
          w.bbox = [Math.min(w.bbox[0], x0), Math.min(w.bbox[1], y0), Math.max(w.bbox[2], x1), Math.max(w.bbox[3], y1)];
        }
        flush();
        delete line.chars;
      }
      st.destroy();
      return lines;
    }

    rectsIntersect(a, b) {
      return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    }

    pad(b, p = 0.6) {
      return [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
    }

    unionBoxes(bs) {
      return bs.reduce((a, b) => [
        Math.min(a[0], b[0]), Math.min(a[1], b[1]),
        Math.max(a[2], b[2]), Math.max(a[3], b[3])
      ]);
    }

    rangeToBoxes(line, startIdx, endIdx) {
      const boxes = [];
      let cursor = 0;
      for (const w of line.words) {
        const at = line.text.indexOf(w.text, cursor);
        if (at === -1) continue;
        cursor = at + w.text.length;
        if (cursor > startIdx && at < endIdx) boxes.push(w.bbox);
      }
      return boxes;
    }

    renderPageToImage(page, scale = 1.5) {
      const pix = page.toPixmap(this.mupdf.Matrix.scale(scale, scale), this.mupdf.ColorSpace.DeviceRGB, false);
      const pngBytes = pix.asPNG();
      pix.destroy();
      const blob = new Blob([pngBytes], { type: "image/png" });
      return {
        blob,
        url: URL.createObjectURL(blob),
        bytes: pngBytes,
        width: pix.getWidth ? pix.getWidth() : page.getBounds()[2] * scale,
        height: pix.getHeight ? pix.getHeight() : page.getBounds()[3] * scale
      };
    }

    // --- Pass 2: Page-Level Pattern & Graph Matching ---
    planPageRedactions(page, cfg, entityGraph = null) {
      const PII = getPIIEngine();
      const lines = this.extractPageText(page);
      const hasText = lines.some(l => l.text.trim());
      const plan = [];

      // Helper to match regex and record bounding box
      const matchPattern = (re, category, label) => {
        for (const line of lines) {
          const text = line.text;
          const reg = new RegExp(re.source, re.flags);
          let m;
          while ((m = reg.exec(text)) !== null) {
            const matchStr = m[0];
            const start = m.index;
            const end = start + matchStr.length;
            const boxes = this.rangeToBoxes(line, start, end);
            if (boxes.length) {
              plan.push({
                bbox: this.pad(this.unionBoxes(boxes)),
                text: label,
                orig: matchStr.trim(),
                category
              });
            }
          }
        }
      };

      // 1. BVN
      if (cfg.bvn) {
        matchPattern(/\bBVN[:\s#-]*([1-9]\d{10})\b/gi, "BVN", "[BVN]");
      }

      // 2. NIN
      if (cfg.nin) {
        matchPattern(/\bNIN[:\s#-]*(\d{11})\b/gi, "NIN", "[NIN]");
      }

      // 3. CAC Registration (RC, BN, IT, LLP)
      if (cfg.cac) {
        matchPattern(/\b(?:RC|BN|IT|LLP)[\s.:/-]*(?:No\.?[:\s]*)?\d{4,8}\b/gi, "CAC", "[CAC REG]");
      }

      // Cross-line sliding window context checks for wrapped headers
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const prevText = lineIdx > 0 ? lines[lineIdx - 1].text : "";

        // NIN wrapped (e.g. "NIN:" on prev line, "48392019482" on current line)
        if (cfg.nin && /NIN[:\s#-]*$/i.test(prevText.trim())) {
          const m = line.text.match(/^(\d{11})\b/);
          if (m) {
            const boxes = this.rangeToBoxes(line, 0, m[1].length);
            if (boxes.length) plan.push({ bbox: this.pad(this.unionBoxes(boxes)), text: "[NIN_REDACTED]", orig: m[1], category: "NIN" });
          }
        }

        // CAC wrapped (e.g. "(RC" on prev line, "No: 1049281" on current line)
        if (cfg.cac && /(?:RC|BN|IT|LLP)[\s.:/-]*$/i.test(prevText.trim())) {
          const m = line.text.match(/^(?:No\.?[:\s]*)?(\d{4,8})\b/i);
          if (m) {
            const boxes = this.rangeToBoxes(line, 0, m[0].length);
            if (boxes.length) plan.push({ bbox: this.pad(this.unionBoxes(boxes)), text: "[CAC_REDACTED]", orig: m[0], category: "CAC" });
          }
        }
      }

      // 4. Tax Identification Number (TIN)
      if (cfg.tin !== false) {
        matchPattern(/\b(?:TIN|Tax\s*Identification\s*Number(?:\s*\(TIN\))?)[:\s#-]*([A-Za-z0-9-]+)\b/gi, "TIN", "[TIN_REDACTED]");
      }

      // 5. Bank Account Numbers & NUBAN
      if (cfg.accounts !== false) {
        matchPattern(/\b(?:Account\s*No\.?|Acc\s*No\.?|NUBAN)[:\s]*(\d{10})\b/gi, "Account", "[ACCOUNT_REDACTED]");
      }

      // 6. Bank Sort Codes (UK 6-digit & Nigerian 9-digit)
      if (cfg.sortCodes !== false) {
        matchPattern(/\bSort\s*Code[:\s]*(\d{6,9})\b|\b\d{2}[-\s]\d{2}[-\s]\d{2}\b/gi, "Sort Code", "[SORTCODE_REDACTED]");
      }

      // 7. Financial Amounts (Numbers and words in parentheses)
      if (cfg.amounts !== false) {
        matchPattern(/(?:₦|NGN|\$|£|€)\s?[\d,]+(?:\.\d{2})?(?:\s*\([A-Za-z\s-]+\))?/gi, "Amount", "[AMOUNT_REDACTED]");
      }

      // 8. Addresses (Residential, Corporate, Property)
      if (cfg.addresses !== false) {
        matchPattern(/\b(?:residing at|registered (?:corporate )?address at|property located at)\s+([^,\n\r(]+(?:,\s*[^,\n\r(]+){1,4})/gi, "Address", "[ADDRESS_REDACTED]");
        matchPattern(/\b(?:\d+|Plot\s+\d+)\s+[A-Z][a-zA-Z\s]+(?:Avenue|Ave|Way|Street|St|Road|Rd|Crescent|Close|Drive|Dr|Expressway)\b(?:,\s*[^,\n\r(]+){1,3}/gi, "Address", "[ADDRESS_REDACTED]");
      }

      // 9. Credit Cards (with Luhn check)
      if (cfg.cards) {
        for (const line of lines) {
          const re = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g;
          let m;
          while ((m = re.exec(line.text)) !== null) {
            if (PII && PII.isValidLuhn(m[0])) {
              const boxes = this.rangeToBoxes(line, m.index, m.index + m[0].length);
              if (boxes.length) plan.push({ bbox: this.pad(this.unionBoxes(boxes)), text: "[CARD_REDACTED]", orig: m[0], category: "Card" });
            }
          }
        }
      }

      // 10. IBAN
      if (cfg.iban) {
        for (const line of lines) {
          const re = /\b[A-Z]{2}\d{2}[A-Z0-9\s-]{11,32}\b/gi;
          let m;
          while ((m = re.exec(line.text)) !== null) {
            if (PII && PII.isValidIBAN(m[0])) {
              const boxes = this.rangeToBoxes(line, m.index, m.index + m[0].length);
              if (boxes.length) plan.push({ bbox: this.pad(this.unionBoxes(boxes)), text: "[IBAN_REDACTED]", orig: m[0], category: "IBAN" });
            }
          }
        }
      }

      // 11. Emails
      if (cfg.emails) {
        matchPattern(/\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g, "Email", "[EMAIL_REDACTED]");
      }

      // 12. Phone Numbers
      if (cfg.phones) {
        matchPattern(/(?:\+234\s?\(?0?\)?|0)[789][01]\d{1}[\s-]?\d{3,4}[\s-]?\d{3,4}\b|(?:\+44\s?\(?0?\)?|\(?0\)?)(?:\d\s?){8,10}\d/g, "Phone", "[PHONE_REDACTED]");
      }

      // 13. Two-Pass Adaptive Entity Graph Matching
      // Redacts full names, titled surnames (e.g. Mr. Gbajabiamila, Mrs. Anifowose), and companies
      if (cfg.names && entityGraph) {
        for (const fullName of entityGraph.names) {
          const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matchPattern(new RegExp(`\\b${escaped}\\b`, "gi"), "Name", "[NAME_REDACTED]");
        }

        for (const surname of entityGraph.surnames) {
          if (surname.length < 3) continue;
          const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const titlePat = new RegExp(`\\b${PII.titlesPattern}\\.?\\s+${escaped}\\b`, "gi");
          matchPattern(titlePat, "Name", "[NAME_REDACTED]");
        }

        for (const comp of entityGraph.companies) {
          if (comp.length < 3) continue;
          const escaped = comp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matchPattern(new RegExp(`\\b${escaped}\\b`, "gi"), "Company", "[ORG_REDACTED]");
        }

        for (const addr of entityGraph.addresses) {
          if (addr.length < 6) continue;
          const escaped = addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          matchPattern(new RegExp(escaped, "gi"), "Address", "[ADDRESS_REDACTED]");
        }
      }

      // 14. Custom Comma-Separated User Words / Numbers / Phrases
      if (cfg.customPhrases) {
        const phrases = cfg.customPhrases.split(",").map(s => s.trim()).filter(Boolean);
        for (const p of phrases) {
          if (p.length >= 1) {
            const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            matchPattern(new RegExp(escaped, "gi"), "Custom", "[CONFIDENTIAL_REDACTED]");
          }
        }
      }

      // Fallback: Generic titled names pattern
      if (cfg.names) {
        const genTitleRe = new RegExp("\\b" + PII.titlesPattern + "\\.?\\s+[A-Z][a-z]+(?:[^\\S\\r\\n]+[A-Z][a-z]+)*\\b", "g");
        matchPattern(genTitleRe, "Name", "[NAME_REDACTED]");
      }

      // Overlap deduplication: Sort by area descending, discard sub-boxes
      plan.sort((a, b) => {
        const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
        const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
        return areaB - areaA;
      });

      const kept = [];
      for (const item of plan) {
        if (!kept.some(k => k.bbox[0] <= item.bbox[0] && k.bbox[1] <= item.bbox[1] && k.bbox[2] >= item.bbox[2] && k.bbox[3] >= item.bbox[3])) {
          kept.push(item);
        }
      }

      return { plan: kept, hasText };
    }

    applyPlan(doc, page, plan, cfg) {
      for (const item of plan) {
        const a = page.createAnnotation("Redact");
        a.setRect(item.bbox);
      }
      page.applyRedactions(false);

      const inv = this.mupdf.Matrix.invert(page.getTransform());
      const isBlackout = cfg.style === "blackout";
      const isClean = cfg.style === "clean";
      const [fillRGB, textRGB] = isBlackout ? [[0, 0, 0], [1, 1, 1]] :
                                 isClean ? [[1, 1, 1], [1, 1, 1]] :
                                 [[0.93, 0.94, 0.98], [0.12, 0.22, 0.45]];
      const font = new this.mupdf.Font("Helvetica");
      let ops = "q\n";

      for (const item of plan) {
        const [x0, y0, x1, y1] = item.bbox;
        const p0 = [inv[0] * x0 + inv[2] * y1 + inv[4], inv[1] * x0 + inv[3] * y1 + inv[5]];
        const p1 = [inv[0] * x1 + inv[2] * y0 + inv[4], inv[1] * x1 + inv[3] * y0 + inv[5]];
        const rx0 = Math.min(p0[0], p1[0]), ry0 = Math.min(p0[1], p1[1]);
        const rw = Math.abs(p1[0] - p0[0]), rh = Math.abs(p1[1] - p0[1]);
        ops += `${fillRGB.join(" ")} rg ${rx0.toFixed(2)} ${ry0.toFixed(2)} ${rw.toFixed(2)} ${rh.toFixed(2)} re f\n`;

        if (item.text) {
          let size = Math.min(8.5, rh * 0.82);
          let tw = 0;
          for (const ch of item.text) tw += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0)), 0);
          tw *= size;
          if (tw > rw && tw > 0) size = size * (rw / tw) * 0.98;
          const tx = rx0 + Math.max(0, (rw - tw) / 2);
          const ty = ry0 + (rh - size * 0.72) / 2 + size * 0.02;
          const escText = item.text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
          ops += `BT /RRHelv ${size.toFixed(2)} Tf ${textRGB.join(" ")} rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escText}) Tj ET\n`;
        }
      }
      ops += "Q\n";

      const pageObj = page.getObject();
      let res = pageObj.get("Resources");
      if (!res || res.isNull()) { res = doc.newDictionary(); pageObj.put("Resources", res); }
      let fonts = res.get("Font");
      if (!fonts || fonts.isNull()) { fonts = doc.newDictionary(); res.put("Font", fonts); }
      fonts.put("RRHelv", doc.addSimpleFont(font, "Latin"));

      const pre = doc.addStream("q\n", null);
      const post = doc.addStream("Q\n" + ops, null);
      const contents = pageObj.get("Contents");
      const arr = doc.newArray();
      arr.push(pre);
      if (contents.isArray()) { for (let i = 0; i < contents.length; i++) arr.push(contents.get(i)); }
      else arr.push(contents);
      arr.push(post);
      pageObj.put("Contents", arr);
    }

    async redactDocument(data, cfg, onProgress = null) {
      if (!this.mupdf) throw new Error("MuPDF engine is not initialized");
      const PII = getPIIEngine();
      const doc = this.mupdf.Document.openDocument(data, "application/pdf");
      const n = doc.countPages();

      // ======================================================================
      // PASS 1: Full Document Entity Discovery & Graph Construction
      // ======================================================================
      let fullDocText = "";
      for (let i = 0; i < n; i++) {
        const pg = doc.loadPage(i);
        fullDocText += pg.toStructuredText("preserve-whitespace").asText() + "\n";
        pg.destroy();
      }

      const entityGraph = PII ? PII.buildEntityGraph(fullDocText) : null;
      if (onProgress) onProgress(`Discovered ${entityGraph ? entityGraph.names.size : 0} primary entities. Running redaction pass...`);

      // ======================================================================
      // PASS 2: Universal Redaction Execution
      // ======================================================================
      let hits = 0, pagesTouched = 0, imageOnlyPages = 0, firstTouchedPage = -1;
      const log = [];
      const scannedPagesList = [];

      for (let i = 0; i < n; i++) {
        const page = doc.loadPage(i);
        const { plan, hasText } = this.planPageRedactions(page, cfg, entityGraph);

        if (!hasText) {
          imageOnlyPages++;
          scannedPagesList.push(i);
        }

        if (plan.length) {
          this.applyPlan(doc, page, plan, cfg);
          hits += plan.length;
          pagesTouched++;
          if (firstTouchedPage === -1) firstTouchedPage = i;
          for (const p of plan) {
            log.push({ page: i + 1, category: p.category, orig: p.orig, replacement: p.text });
          }
        }
        page.destroy();
      }

      const out = doc.saveToBuffer("garbage=4,compress=yes").asUint8Array().slice();
      doc.destroy();

      // Post-audit verification loop
      const survivors = [];
      let previewPng = null;
      const doc2 = this.mupdf.Document.openDocument(out, "application/pdf");
      if (log.length) {
        let allText = "";
        for (let i = 0; i < doc2.countPages(); i++) {
          const pg = doc2.loadPage(i);
          allText += pg.toStructuredText().asText() + "\n";
          pg.destroy();
        }
        const collapsed = allText.toLowerCase();
        for (const entry of log) {
          const needle = (entry.orig || "").toLowerCase().trim();
          if (needle.length > 3 && collapsed.includes(needle)) survivors.push(entry.orig);
        }
      }

      if (firstTouchedPage >= 0) {
        const pg = doc2.loadPage(firstTouchedPage);
        const pix = pg.toPixmap(this.mupdf.Matrix.scale(1.3, 1.3), this.mupdf.ColorSpace.DeviceRGB, false);
        previewPng = pix.asPNG();
        pix.destroy(); pg.destroy();
      }
      doc2.destroy();

      return {
        data: out,
        hits,
        pagesTouched,
        pageCount: n,
        imageOnlyPages,
        scannedPagesList,
        survivors: [...new Set(survivors)],
        log,
        previewPng,
        firstTouchedPage,
        entityGraph
      };
    }
  }

  global.PDFRedactor = PDFRedactor;
})(typeof window !== "undefined" ? window : globalThis);

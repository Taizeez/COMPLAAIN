// ===== ReasonableRedactor application =====


// ---------- patterns ----------
const EMAIL_CORE = "[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}";
const TOKEN_EMAIL_RE = new RegExp("(<)?(" + EMAIL_CORE + ")(>)?([,.;:]?)", "i");
const HEADER_KEYS = ["to:", "cc:", "bcc:", "from:", "subject:", "date:", "sent:", "reply-to:", "attachments:"];
const TITLES = "(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Rev|Sir|Dame|Lord|Lady)";

// line-level patterns: { re, rep, group?, digitsMin?, digitsMax?, requires? }
const LINE_PATTERNS = {
  phones: [{ re: /(?:\+44\s?\(?0?\)?|\(?0\)?)(?:\d\s?){8,10}\d/g, rep: "[phone]", digitsMin: 10, digitsMax: 13 }],
  postcodes: [{ re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, rep: "[postcode]" }],
  ni: [{ re: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, rep: "[NI number]" }],
  caseNos: [
    { re: /\b\d{7}\/\d{4}\b/g, rep: "[case no.]" },
    { re: /\[\d{4}\]\s+(?:UKSC|UKPC|UKHL|EWCA(?:\s+(?:Civ|Crim))?|EWHC|UKEAT|EAT|UKUT|UKFTT|EWFC|EWCOP)\b[\w\s().]{0,20}?\d+/g, rep: "[citation]" },
    { re: /\b(?:case|claim)\s+(?:no|number|ref(?:erence)?)s?\.?:?\s*([A-Za-z0-9][A-Za-z0-9\/\-.]{1,}[A-Za-z0-9])/gi, rep: "[case no.]", group: 1 },
  ],
  dob: [{ re: /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi, rep: "[DOB]", requires: /\b(?:d\.?\s?o\.?\s?b|date of birth|born)\b/i }],
  money: [{ re: /£\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:million|billion|bn|m|k|thousand))?\b|£\s?\d[\d,]*(?:\.\d{1,2})?/g, rep: "[amount]" }],
  legislation: [
    { re: /\b(?:[A-Z][\w()'’]*\s+){1,7}Act\s+\d{4}\b/g, rep: "[legislation]" },
    { re: /\b(?:ss?|sections?|sec)\.?\s*\d+[A-Za-z]?(?:\(\d+\))*(?:\s*(?:,|and|to|-)\s*\d+[A-Za-z]?(?:\(\d+\))*)*(?:\s+of\s+the\s+(?:[A-Z][\w()'’]*\s+){0,7}Act\s+\d{4})?/g, rep: "[legislation]" },
    { re: /\b(?:Article|Articles|Art\.?|Regulation|Regulations|Reg\.?|Schedule|Sch\.?|Rule|Part|Paragraph|Para\.?)\s+\d+[A-Za-z]?(?:\(\d+\))*/gi, rep: "[legislation]" },
    { re: /\b(?:UK\s+)?GDPR\b|\bSI\s+\d{4}\/\d+\b/g, rep: "[legislation]" },
  ],
};

const CIPHER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const $ = id => document.getElementById(id);
const statusEl = $("status");

statusEl.textContent = "Ready. Add PDFs above. Working fully offline.";

function parseList(text, defaultLabelFor) {
  // "Name" or "Name = Label", one per line; returns [{phrase, label}]
  return text.split("\n").map(s => s.trim()).filter(s => s.length >= 3).map((s, i) => {
    const m = s.split(/\s*=\s*/);
    return { phrase: m[0].trim(), label: (m[1] || "").trim() || defaultLabelFor(i) };
  }).filter(x => x.phrase.length >= 3);
}

function readConfig() {
  return {
    maskEmails: $("tEmails").checked,
    redactBcc: $("tBcc").checked,
    patterns: {
      phones: $("tPhones").checked,
      postcodes: $("tPostcodes").checked,
      ni: $("tNI").checked,
      caseNos: $("tCaseNos").checked,
      dob: $("tDOB").checked,
      money: $("tMoney").checked,
      legislation: $("tLegislation").checked,
    },
    witnesses: parseList($("lWitnesses").value, i => "Witness " + (CIPHER[i] || i + 1)),
    companies: parseList($("lCompanies").value, i => "Company " + (CIPHER[i] || i + 1)),
    terms: parseList($("lTerms").value, () => $("termRep").value || "[redacted]"),
    keepDomains: $("keepDomains").value.split(",").map(s => s.trim()).filter(Boolean),
    keepEmails: $("keepEmails").value.split(",").map(s => s.trim()).filter(Boolean),
    style: $("optStyle").value,
    maskUser: $("maskUser").value || "[redacted]",
    bccReplacement: $("bccRep").value || "Bcc: [redacted]",
    skipEmailMaskInsideBcc: true,
  };
}

function anythingSelected(cfg) {
  return cfg.maskEmails || cfg.redactBcc || Object.values(cfg.patterns).some(Boolean)
    || cfg.witnesses.length || cfg.companies.length || cfg.terms.length;
}

// ---------- text extraction ----------
const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

function extractPageText(page) {
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

const rectsIntersect = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const pad = (b, p = 0.6) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
const unionBoxes = bs => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const cleanWord = s => s.replace(/^[^\w£]+|[^\w)\]]+$/g, "");

function collectBccLineBboxes(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (norm(lines[i].text).startsWith("bcc:")) {
      out.push({ bbox: lines[i].bbox, text: lines[i].text });
      let j = i + 1;
      while (j < lines.length) {
        const n = norm(lines[j].text);
        if (!n || HEADER_KEYS.some(k => n.startsWith(k))) break;
        const gap = lines[j].bbox[1] - lines[j - 1].bbox[3];
        if (gap > (lines[j].bbox[3] - lines[j].bbox[1])) break;
        out.push({ bbox: lines[j].bbox, text: lines[j].text });
        j++;
      }
      i = j; continue;
    }
    i++;
  }
  return out;
}

// map a [startIdx, endIdx) char range within line.text to the union of word boxes
function rangeToBoxes(line, startIdx, endIdx) {
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

function matchLineRegexes(line, defs, category, plan, excludeRects) {
  for (const def of defs) {
    if (def.requires && !def.requires.test(line.text)) continue;
    const re = new RegExp(def.re.source, def.re.flags);
    let m;
    while ((m = re.exec(line.text)) !== null) {
      let matched = m[0], startIdx = m.index;
      if (def.group != null && m[def.group] != null) {
        matched = m[def.group];
        startIdx = m.index + m[0].indexOf(matched);
      }
      if (def.digitsMin) {
        const d = (matched.match(/\d/g) || []).length;
        if (d < def.digitsMin || d > def.digitsMax) continue;
      }
      const boxes = rangeToBoxes(line, startIdx, startIdx + matched.length);
      if (!boxes.length) continue;
      const box = pad(unionBoxes(boxes));
      if (excludeRects.some(r => rectsIntersect(box, r))) continue;
      plan.push({ bbox: box, text: def.rep, orig: matched, category });
    }
  }
}

function matchPhrases(line, entries, category, plan, excludeRects, alsoTitledSurname) {
  for (const { phrase, label } of entries) {
    const parts = phrase.toLowerCase().split(/\s+/);
    // token-sequence match (whole words, punctuation-tolerant)
    for (let wi = 0; wi + parts.length <= line.words.length; wi++) {
      const seq = line.words.slice(wi, wi + parts.length);
      if (seq.every((sw, k) => cleanWord(sw.text).toLowerCase() === parts[k])) {
        const box = pad(unionBoxes(seq.map(s => s.bbox)));
        if (excludeRects.some(r => rectsIntersect(box, r))) continue;
        plan.push({ bbox: box, text: label, orig: phrase, category });
      }
    }
    // titled surname: "Mr Smith", "Dr Bloggs" for the last word of a multi-word name
    if (alsoTitledSurname && parts.length >= 2) {
      const surname = parts[parts.length - 1];
      const tre = new RegExp("\\b" + TITLES + "\\.?\\s+" + surname.replace(/[.*+?^${}()|[\]\\]/g, "\\<script type="module">
const MUPDF_URL = "https://cdn.jsdelivr.net/npm/mupdf@1.28.0/dist/mupdf.js";

// ---------- patterns ----------
const EMAIL_CORE = "[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}";
const TOKEN_EMAIL_RE = new RegExp("(<)?(" + EMAIL_CORE + ")(>)?([,.;:]?)", "i");
const HEADER_KEYS = ["to:", "cc:", "bcc:", "from:", "subject:", "date:", "sent:", "reply-to:", "attachments:"];
const TITLES = "(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Rev|Sir|Dame|Lord|Lady)";

// line-level patterns: { re, rep, group?, digitsMin?, digitsMax?, requires? }
const LINE_PATTERNS = {
  phones: [{ re: /(?:\+44\s?\(?0?\)?|\(?0\)?)(?:\d\s?){8,10}\d/g, rep: "[phone]", digitsMin: 10, digitsMax: 13 }],
  postcodes: [{ re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, rep: "[postcode]" }],
  ni: [{ re: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, rep: "[NI number]" }],
  caseNos: [
    { re: /\b\d{7}\/\d{4}\b/g, rep: "[case no.]" },
    { re: /\[\d{4}\]\s+(?:UKSC|UKPC|UKHL|EWCA(?:\s+(?:Civ|Crim))?|EWHC|UKEAT|EAT|UKUT|UKFTT|EWFC|EWCOP)\b[\w\s().]{0,20}?\d+/g, rep: "[citation]" },
    { re: /\b(?:case|claim)\s+(?:no|number|ref(?:erence)?)s?\.?:?\s*([A-Za-z0-9][A-Za-z0-9\/\-.]{1,}[A-Za-z0-9])/gi, rep: "[case no.]", group: 1 },
  ],
  dob: [{ re: /\b(?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi, rep: "[DOB]", requires: /\b(?:d\.?\s?o\.?\s?b|date of birth|born)\b/i }],
  money: [{ re: /£\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:million|billion|bn|m|k|thousand))?\b|£\s?\d[\d,]*(?:\.\d{1,2})?/g, rep: "[amount]" }],
  legislation: [
    { re: /\b(?:[A-Z][\w()'’]*\s+){1,7}Act\s+\d{4}\b/g, rep: "[legislation]" },
    { re: /\b(?:ss?|sections?|sec)\.?\s*\d+[A-Za-z]?(?:\(\d+\))*(?:\s*(?:,|and|to|-)\s*\d+[A-Za-z]?(?:\(\d+\))*)*(?:\s+of\s+the\s+(?:[A-Z][\w()'’]*\s+){0,7}Act\s+\d{4})?/g, rep: "[legislation]" },
    { re: /\b(?:Article|Articles|Art\.?|Regulation|Regulations|Reg\.?|Schedule|Sch\.?|Rule|Part|Paragraph|Para\.?)\s+\d+[A-Za-z]?(?:\(\d+\))*/gi, rep: "[legislation]" },
    { re: /\b(?:UK\s+)?GDPR\b|\bSI\s+\d{4}\/\d+\b/g, rep: "[legislation]" },
  ],
};

const CIPHER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const $ = id => document.getElementById(id);
const statusEl = $("status");

let mupdf = null;
(async () => {
  try {
    mupdf = await import(MUPDF_URL);
    statusEl.textContent = "Ready. Add PDFs above.";
  } catch (e) {
    statusEl.innerHTML = '<span class="pill bad">Could not load the redaction engine. Check your internet connection and reload. The engine downloads once; your files are then processed offline in this tab.</span>';
    console.error(e);
  }
})();

function parseList(text, defaultLabelFor) {
  // "Name" or "Name = Label", one per line; returns [{phrase, label}]
  return text.split("\n").map(s => s.trim()).filter(s => s.length >= 3).map((s, i) => {
    const m = s.split(/\s*=\s*/);
    return { phrase: m[0].trim(), label: (m[1] || "").trim() || defaultLabelFor(i) };
  }).filter(x => x.phrase.length >= 3);
}

function readConfig() {
  return {
    maskEmails: $("tEmails").checked,
    redactBcc: $("tBcc").checked,
    patterns: {
      phones: $("tPhones").checked,
      postcodes: $("tPostcodes").checked,
      ni: $("tNI").checked,
      caseNos: $("tCaseNos").checked,
      dob: $("tDOB").checked,
      money: $("tMoney").checked,
      legislation: $("tLegislation").checked,
    },
    witnesses: parseList($("lWitnesses").value, i => "Witness " + (CIPHER[i] || i + 1)),
    companies: parseList($("lCompanies").value, i => "Company " + (CIPHER[i] || i + 1)),
    terms: parseList($("lTerms").value, () => $("termRep").value || "[redacted]"),
    keepDomains: $("keepDomains").value.split(",").map(s => s.trim()).filter(Boolean),
    keepEmails: $("keepEmails").value.split(",").map(s => s.trim()).filter(Boolean),
    style: $("optStyle").value,
    maskUser: $("maskUser").value || "[redacted]",
    bccReplacement: $("bccRep").value || "Bcc: [redacted]",
    skipEmailMaskInsideBcc: true,
  };
}

function anythingSelected(cfg) {
  return cfg.maskEmails || cfg.redactBcc || Object.values(cfg.patterns).some(Boolean)
    || cfg.witnesses.length || cfg.companies.length || cfg.terms.length;
}

// ---------- text extraction ----------
const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

function extractPageText(page) {
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

const rectsIntersect = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const pad = (b, p = 0.6) => [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
const unionBoxes = bs => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const cleanWord = s => s.replace(/^[^\w£]+|[^\w)\]]+$/g, "");

function collectBccLineBboxes(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (norm(lines[i].text).startsWith("bcc:")) {
      out.push({ bbox: lines[i].bbox, text: lines[i].text });
      let j = i + 1;
      while (j < lines.length) {
        const n = norm(lines[j].text);
        if (!n || HEADER_KEYS.some(k => n.startsWith(k))) break;
        const gap = lines[j].bbox[1] - lines[j - 1].bbox[3];
        if (gap > (lines[j].bbox[3] - lines[j].bbox[1])) break;
        out.push({ bbox: lines[j].bbox, text: lines[j].text });
        j++;
      }
      i = j; continue;
    }
    i++;
  }
  return out;
}

// map a [startIdx, endIdx) char range within line.text to the union of word boxes
function rangeToBoxes(line, startIdx, endIdx) {
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

function matchLineRegexes(line, defs, category, plan, excludeRects) {
  for (const def of defs) {
    if (def.requires && !def.requires.test(line.text)) continue;
    const re = new RegExp(def.re.source, def.re.flags);
    let m;
    while ((m = re.exec(line.text)) !== null) {
      let matched = m[0], startIdx = m.index;
      if (def.group != null && m[def.group] != null) {
        matched = m[def.group];
        startIdx = m.index + m[0].indexOf(matched);
      }
      if (def.digitsMin) {
        const d = (matched.match(/\d/g) || []).length;
        if (d < def.digitsMin || d > def.digitsMax) continue;
      }
      const boxes = rangeToBoxes(line, startIdx, startIdx + matched.length);
      if (!boxes.length) continue;
      const box = pad(unionBoxes(boxes));
      if (excludeRects.some(r => rectsIntersect(box, r))) continue;
      plan.push({ bbox: box, text: def.rep, orig: matched, category });
    }
  }
}

function matchPhrases(line, entries, category, plan, excludeRects, alsoTitledSurname) {
  for (const { phrase, label } of entries) {
    const parts = phrase.toLowerCase().split(/\s+/);
    // token-sequence match (whole words, punctuation-tolerant)
    for (let wi = 0; wi + parts.length <= line.words.length; wi++) {
      const seq = line.words.slice(wi, wi + parts.length);
      if (seq.every((sw, k) => cleanWord(sw.text).toLowerCase() === parts[k])) {
        const box = pad(unionBoxes(seq.map(s => s.bbox)));
        if (excludeRects.some(r => rectsIntersect(box, r))) continue;
        plan.push({ bbox: box, text: label, orig: phrase, category });
      }
    }
    // titled surname: "Mr Smith", "Dr Bloggs" for the last word of a multi-word name
    if (alsoTitledSurname && parts.length >= 2) {
      const surname = parts[parts.length - 1];
      const tre = new RegExp("\\b" + TITLES + "\\.?\\s+" + surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      let m;
      while ((m = tre.exec(line.text)) !== null) {
        const boxes = rangeToBoxes(line, m.index, m.index + m[0].length);
        if (!boxes.length) continue;
        const box = pad(unionBoxes(boxes));
        if (excludeRects.some(r => rectsIntersect(box, r))) continue;
        plan.push({ bbox: box, text: label, orig: m[0], category });
      }
    }
  }
}

const shouldMaskEmail = (cfg, email) => {
  const e = email.toLowerCase();
  if (cfg.keepEmails.some(x => x.toLowerCase() === e)) return false;
  const domain = e.includes("@") ? e.split("@")[1] : "";
  return !cfg.keepDomains.some(x => x.toLowerCase() === domain);
};
const maskEmailKeepDomain = (u, email) => u + "@" + email.split(/@(.+)/)[1];

// plan items: { bbox, text (replacement or null), orig, category }
function planPageRedactions(page, cfg) {
  const lines = extractPageText(page);
  const hasText = lines.some(l => l.text.trim());
  const plan = [];
  const bcc = cfg.redactBcc ? collectBccLineBboxes(lines) : [];
  const bccRects = bcc.map(b => b.bbox);

  if (bcc.length) {
    plan.push({ bbox: bcc[0].bbox, text: cfg.bccReplacement, orig: bcc[0].text, category: "Bcc" });
    for (const b of bcc.slice(1)) plan.push({ bbox: b.bbox, text: null, orig: b.text, category: "Bcc" });
  }

  for (const line of lines) {
    // emails (word-level, keep-domain)
    if (cfg.maskEmails) {
      for (const w of line.words) {
        if (!w.text.includes("@")) continue;
        const insideBcc = bccRects.some(r => rectsIntersect(w.bbox, r));
        if (cfg.skipEmailMaskInsideBcc && insideBcc) continue;
        const m = TOKEN_EMAIL_RE.exec(w.text);
        if (m && shouldMaskEmail(cfg, m[2])) {
          plan.push({
            bbox: pad(w.bbox),
            text: (m[1] || "") + maskEmailKeepDomain(cfg.maskUser, m[2]) + (m[3] || "") + (m[4] || ""),
            orig: m[2], category: "Email",
          });
        }
      }
    }

    // pattern categories
    for (const [key, on] of Object.entries(cfg.patterns)) {
      if (on) matchLineRegexes(line, LINE_PATTERNS[key], categoryName(key), plan, bccRects);
    }

    // people, organisations, terms
    matchPhrases(line, cfg.witnesses, "Witness/party", plan, bccRects, true);
    matchPhrases(line, cfg.companies, "Organisation", plan, bccRects, false);
    matchPhrases(line, cfg.terms, "Term", plan, bccRects, false);
  }

  // drop plan items fully contained within an earlier, larger item (overlap dedupe)
  plan.sort((a, b) => area(b.bbox) - area(a.bbox));
  const kept = [];
  for (const item of plan) {
    if (kept.some(k => contains(k.bbox, item.bbox))) continue;
    kept.push(item);
  }
  return { plan: kept, hasText };
}

const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const contains = (a, b) => a[0] <= b[0] + 0.5 && a[1] <= b[1] + 0.5 && a[2] >= b[2] - 0.5 && a[3] >= b[3] - 0.5;

function categoryName(key) {
  return { phones: "Phone", postcodes: "Postcode", ni: "NI number", caseNos: "Case/claim no.",
           dob: "Date of birth", money: "Amount", legislation: "Legislation" }[key] || key;
}

// ---------- applying ----------
const fmt = n => Number(n.toFixed(2));
const escapePdf = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const transformPoint = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function measureText(font, text, size) {
  let w = 0;
  for (const ch of text) w += font.advanceGlyph(font.encodeCharacter(ch.codePointAt(0)), 0);
  return w * size;
}

function applyPlan(doc, page, plan, cfg) {
  for (const item of plan) {
    const a = page.createAnnotation("Redact");
    a.setRect(item.bbox);
  }
  page.applyRedactions(false);

  const inv = mupdf.Matrix.invert(page.getTransform());
  const [fillRGB, textRGB] = cfg.style === "blackout" ? [[0, 0, 0], [1, 1, 1]] : [[1, 1, 1], [0, 0, 0]];
  const font = new mupdf.Font("Helvetica");
  let ops = "q\n";

  for (const item of plan) {
    const [x0, y0, x1, y1] = item.bbox;
    const p0 = transformPoint(inv, [x0, y1]);
    const p1 = transformPoint(inv, [x1, y0]);
    const rx0 = Math.min(p0[0], p1[0]), ry0 = Math.min(p0[1], p1[1]);
    const rw = Math.abs(p1[0] - p0[0]), rh = Math.abs(p1[1] - p0[1]);
    ops += `${fillRGB.join(" ")} rg ${fmt(rx0)} ${fmt(ry0)} ${fmt(rw)} ${fmt(rh)} re f\n`;
    if (item.text) {
      let size = Math.min(9, rh * 0.82);
      let tw = measureText(font, item.text, size);
      if (tw > rw && tw > 0) { size = size * (rw / tw) * 0.98; tw = measureText(font, item.text, size); }
      const tx = rx0 + Math.max(0, (rw - tw) / 2);
      const ty = ry0 + (rh - size * 0.72) / 2 + size * 0.02;
      ops += `BT /RRHelv ${fmt(size)} Tf ${textRGB.join(" ")} rg ${fmt(tx)} ${fmt(ty)} Td (${escapePdf(item.text)}) Tj ET\n`;
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

function redactDocument(data, cfg) {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  let hits = 0, pagesTouched = 0, imageOnlyPages = 0, firstTouchedPage = -1;
  const log = []; // { page, category, orig, replacement }
  const n = doc.countPages();

  for (let i = 0; i < n; i++) {
    const page = doc.loadPage(i);
    const { plan, hasText } = planPageRedactions(page, cfg);
    if (!hasText) imageOnlyPages++;
    if (plan.length) {
      applyPlan(doc, page, plan, cfg);
      hits += plan.length;
      pagesTouched++;
      if (firstTouchedPage === -1) firstTouchedPage = i;
      for (const p of plan) {
        log.push({ page: i + 1, category: p.category, orig: (p.orig || "").trim(), replacement: p.text || "(line removed)" });
      }
    }
    page.destroy();
  }

  const out = doc.saveToBuffer("garbage=4,compress=yes").asUint8Array().slice();
  doc.destroy();

  // verification: none of the removed strings may survive in the output text layer,
  // and render a preview of the first redacted page
  const survivors = [];
  let previewPng = null;
  const doc2 = mupdf.Document.openDocument(out, "application/pdf");
  if (log.length) {
    let allText = "";
    for (let i = 0; i < doc2.countPages(); i++) {
      const pg = doc2.loadPage(i);
      allText += pg.toStructuredText().asText() + "\n";
      pg.destroy();
    }
    const collapsed = allText.replace(/\s+/g, " ").toLowerCase();
    const replacements = new Set(log.map(l => l.replacement.replace(/\s+/g, " ").toLowerCase()));
    for (const entry of log) {
      const needle = entry.orig.replace(/\s+/g, " ").toLowerCase();
      if (!needle) continue;
      if (needle.startsWith("bcc:")) {
        const tail = needle.slice(4).trim();
        if (tail && collapsed.includes(tail)) survivors.push(entry.orig);
        continue;
      }
      if (replacements.has(needle)) continue;
      if (collapsed.includes(needle)) survivors.push(entry.orig);
    }
  }
  if (firstTouchedPage >= 0) {
    const pg = doc2.loadPage(firstTouchedPage);
    const pix = pg.toPixmap(mupdf.Matrix.scale(1.4, 1.4), mupdf.ColorSpace.DeviceRGB, false);
    previewPng = pix.asPNG();
    pix.destroy(); pg.destroy();
  }
  doc2.destroy();

  return { data: out, hits, pagesTouched, pageCount: n, imageOnlyPages,
           survivors: [...new Set(survivors)], log, previewPng, firstTouchedPage };
}

// ---------- UI wiring ----------
const drop = $("drop"), fileInput = $("fileInput"), results = $("results");
const rerunBtn = $("rerunBtn"), clearBtn = $("clearBtn"), resultsBar = $("resultsBar");

// Each uploaded file is kept here (original bytes stay in memory, still fully local),
// so changing the settings and pressing "re-apply" re-runs from the pristine original
// instead of needing a re-upload. Keyed so re-uploading the same file updates its row.
const loaded = new Map(); // key -> { name, bytes, li, urls: [] }
let dirty = false;

const keyFor = file => `${file.name}::${file.size}::${file.lastModified}`;
const revoke = entry => { entry.urls.forEach(u => URL.revokeObjectURL(u)); entry.urls = []; };

function updateBar() {
  const n = loaded.size;
  resultsBar.hidden = n === 0;
  clearBtn.textContent = `Clear all (${n})`;
  if (dirty) {
    rerunBtn.classList.add("dirty");
    rerunBtn.textContent = `Settings changed — re-apply to ${n} file${n === 1 ? "" : "s"}`;
  } else {
    rerunBtn.classList.remove("dirty");
    rerunBtn.textContent = `Re-apply current settings to ${n} file${n === 1 ? "" : "s"}`;
  }
}

// mark that settings changed after files were loaded, so the re-apply button lights up
function markDirty() { if (loaded.size) { dirty = true; updateBar(); } }
$("settingsCard").addEventListener("input", markDirty);
$("settingsCard").addEventListener("change", markDirty);

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => {
  e.preventDefault(); drop.classList.remove("over");
  handleFiles([...e.dataTransfer.files].filter(f => /\.pdf$/i.test(f.name)));
});
fileInput.addEventListener("change", () => { handleFiles([...fileInput.files]); fileInput.value = ""; });

rerunBtn.addEventListener("click", () => rerunAll());
clearBtn.addEventListener("click", () => {
  for (const entry of loaded.values()) { revoke(entry); entry.li.remove(); }
  loaded.clear(); dirty = false; updateBar();
  statusEl.textContent = "Cleared. Add PDFs any time.";
});

// render one file's result into its row, always starting from the original bytes
function renderResult(entry, cfg) {
  revoke(entry);
  try {
    const r = redactDocument(entry.bytes, cfg);
    const outName = entry.name.replace(/\.pdf$/i, "") + "-redacted.pdf";
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
    entry.urls.push(url);

    let pills = "";
    if (r.hits > 0 && r.survivors.length === 0) pills += `<span class="pill ok">✓ Verified — removed text is gone from the text layer</span>`;
    if (r.hits === 0) pills += `<span class="pill">Nothing matched your settings</span>`;
    if (r.survivors.length) pills += `<span class="pill bad">⚠ Check manually — may still contain: ${escHtml(r.survivors.slice(0, 3).join(", "))}</span>`;
    if (r.imageOnlyPages) pills += `<span class="pill bad">⚠ ${r.imageOnlyPages} scanned page(s) with no text layer — cannot be redacted without OCR</span>`;

    let logHtml = "";
    if (r.log.length) {
      const rows = r.log.map(l =>
        `<tr><td>${l.page}</td><td>${escHtml(l.category)}</td><td class="orig">${escHtml(l.orig)}</td><td>${escHtml(l.replacement)}</td></tr>`).join("");
      logHtml = `<details class="log"><summary>What was removed (${r.log.length})</summary>
        <table class="log"><thead><tr><th>Page</th><th>Category</th><th>Removed</th><th>Replaced with</th></tr></thead>
        <tbody>${rows}</tbody></table></details>`;
    }

    let previewHtml = "";
    if (r.previewPng) {
      const pUrl = URL.createObjectURL(new Blob([r.previewPng], { type: "image/png" }));
      entry.urls.push(pUrl);
      previewHtml = `<details class="log"><summary>Preview page ${r.firstTouchedPage + 1}</summary>
        <img class="preview" src="${pUrl}" alt="Preview of redacted page ${r.firstTouchedPage + 1}"></details>`;
    }

    entry.li.innerHTML = `<div class="res-head">
        <span class="fname">${escHtml(outName)}</span>
        <button class="dl">Download</button>
      </div>
      <div class="meta">${r.hits} redaction${r.hits === 1 ? "" : "s"} across ${r.pagesTouched} of ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}. ${pills}</div>
      ${logHtml}${previewHtml}`;
    entry.li.querySelector("button.dl").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = url; a.download = outName; a.click();
    });
  } catch (err) {
    console.error(err);
    entry.li.innerHTML = `<div class="res-head"><span class="fname">${escHtml(entry.name)}</span></div>
      <div class="meta"><span class="pill bad">Failed: ${escHtml(String(err && err.message || err))}. If this PDF is password-protected, remove the password first.</span></div>`;
  }
}

async function handleFiles(files) {
  if (!files.length) return;
  if (!mupdf) { statusEl.textContent = "Engine still loading, one moment…"; return; }
  const cfg = readConfig();
  if (!anythingSelected(cfg)) {
    statusEl.innerHTML = '<span class="pill bad">Nothing selected to redact. Turn on at least one option or add names/terms above.</span>';
    return;
  }
  $("resultsCard").hidden = false;

  for (const file of files) {
    statusEl.textContent = `Processing ${file.name}…`;
    const key = keyFor(file);
    let entry = loaded.get(key);
    if (!entry) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="res-head"><span class="fname">${escHtml(file.name)}</span></div><div class="meta">working…</div>`;
      results.prepend(li);
      entry = { name: file.name, bytes: null, li, urls: [] };
      loaded.set(key, entry);
    } else {
      entry.li.querySelector(".meta").textContent = "re-reading…";
    }
    await new Promise(r => setTimeout(r, 30)); // let the UI paint before synchronous work
    entry.bytes = new Uint8Array(await file.arrayBuffer());
    renderResult(entry, cfg);
  }
  dirty = false; updateBar();
  statusEl.textContent = "Done. Change settings above, then press re-apply to refresh without re-uploading.";
}

function rerunAll() {
  if (!loaded.size) return;
  const cfg = readConfig();
  if (!anythingSelected(cfg)) {
    statusEl.innerHTML = '<span class="pill bad">Nothing selected to redact. Turn on at least one option or add names/terms above.</span>';
    return;
  }
  statusEl.textContent = `Re-applying settings to ${loaded.size} file(s)…`;
  setTimeout(() => { // let the status paint before the synchronous work
    for (const entry of loaded.values()) if (entry.bytes) renderResult(entry, cfg);
    dirty = false; updateBar();
    statusEl.textContent = "Refreshed with the current settings.";
  }, 30);
}

function escHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

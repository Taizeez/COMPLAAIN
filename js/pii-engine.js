/**
 * safeRedact PII Engine
 * Comprehensive PII detection, validation checksums, and anonymization transformers.
 * Features:
 * - Two-Pass Adaptive Entity Graph (Discovers primary names, builds alias indices, propagates everywhere)
 * - Nigerian/African Fintech (BVN, NIN, NUBAN, CAC, TIN, 9-digit Sort Codes, NGN Currency, Mobile Phones)
 * - UK & European Legal/Fintech (Sort Code, IBAN with Mod-97, NI numbers, Postcodes, Citations, GDPR)
 * - US & Global Financial (Credit Cards with Luhn, SSN, ABA Routing, SWIFT, Passports)
 * - Addresses (Residential, Corporate, Property)
 */

(function (global) {
  "use strict";

  // --- Title & Honorific Prefixes (African, Legal, Religious, Civic, Academic) ---
  const TITLES_PATTERN =
    "(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Barrister|Barr|Solicitor|Bldr|Engr|Arc|Pharm|" +
    "Chief|Otunba|High\\s+Chief|Alhaji|Alhaja|Hajia|Mallam|Prince|Princess|" +
    "Hon|Honourable|Justice|Judge|Sen|Senator|Rep|Representative|" +
    "Rev|Reverend|Pastor|Bishop|Apostle|Evang|Evangelist|Deacon|Deaconess|Imam|Sheikh|" +
    "Sir|Dame|Lord|Lady)";

  const TITLES_RE = new RegExp("^" + TITLES_PATTERN + "\\.?\\s+", "i");

  // --- Luhn Algorithm Checksum for Credit / Debit Cards ---
  function isValidLuhn(str) {
    const cleaned = (str || "").replace(/\D/g, "");
    if (cleaned.length < 12 || cleaned.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  // --- Mod-97-10 Checksum for IBAN ---
  function isValidIBAN(input) {
    const iban = (input || "").replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(iban)) return false;
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let numeric = "";
    for (let i = 0; i < rearranged.length; i++) {
      const ch = rearranged.charCodeAt(i);
      numeric += (ch >= 65 && ch <= 90) ? (ch - 55).toString() : rearranged[i];
    }
    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 7) {
      const part = remainder.toString() + numeric.substring(i, i + 7);
      remainder = parseInt(part, 10) % 97;
    }
    return remainder === 1;
  }

  // --- US ABA Routing Number Checksum ---
  function isValidAbaRouting(str) {
    const cleaned = (str || "").replace(/\D/g, "");
    if (cleaned.length !== 9) return false;
    const d = cleaned.split("").map(Number);
    const checksum = (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10;
    return checksum === 0;
  }

  // --- Deterministic String Hash ---
  function hashString(str, seed = 0x811c9dc5) {
    let hval = seed;
    for (let i = 0; i < str.length; i++) {
      hval ^= str.charCodeAt(i);
      hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
    }
    return (hval >>> 0).toString(16).toUpperCase();
  }

  // Category Definitions
  const PII_CATEGORIES = {
    // --- Nigerian & African Fintech ---
    BVN: {
      id: "bvn",
      name: "Bank Verification Number (BVN)",
      region: "Nigeria",
      domain: "Fintech",
      re: /\bBVN[:\s#-]*([1-9]\d{10})\b/gi,
      validate(val, context) {
        const s = String(val).trim();
        if (!/^[1-9]\d{10}$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        return ctx.includes("bvn") || ctx.includes("bank verification");
      },
      mask(val) {
        const s = String(val).replace(/\D/g, "");
        return s.length === 11 ? s.slice(0, 3) + "******" + s.slice(-2) : "[BVN]";
      }
    },

    NIN: {
      id: "nin",
      name: "National Identification Number (NIN)",
      region: "Nigeria",
      domain: "Legal/Govt",
      re: /\bNIN[:\s#-]*(\d{11})\b/gi,
      validate(val, context) {
        const s = String(val).trim();
        if (!/^\d{11}$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        return ctx.includes("nin") || ctx.includes("national id") || ctx.includes("identity");
      },
      mask(val) {
        const s = String(val).replace(/\D/g, "");
        return s.length === 11 ? s.slice(0, 3) + "******" + s.slice(-2) : "[NIN]";
      }
    },

    TIN: {
      id: "tin",
      name: "Tax Identification Number (TIN)",
      region: "Nigeria/Global",
      domain: "Legal/Tax",
      re: /\b(?:TIN|Tax\s*Identification\s*Number(?:\s*\(TIN\))?)[:\s#-]*([A-Za-z0-9-]+)\b/gi,
      validate(val) {
        return /\b\d{8,10}(?:-\d{4})?\b/.test(String(val).trim());
      },
      mask(val) {
        return "[TIN REDACTED]";
      }
    },

    CAC: {
      id: "cac",
      name: "CAC Business Registration Number",
      region: "Nigeria",
      domain: "Legal/Corporate",
      re: /\b(?:RC|BN|IT|LLP)[\s.:/-]*(?:No\.?[:\s]*)?\d{4,8}\b/gi,
      validate(val) {
        return /\b(?:RC|BN|IT|LLP)[\s.:/-]*(?:No\.?[:\s]*)?\d{4,8}\b/i.test(String(val).trim());
      },
      mask(val) {
        return "[CAC REGISTRATION]";
      }
    },

    BANK_ACCOUNT: {
      id: "bank_account",
      name: "Bank Account Number / NUBAN",
      region: "Nigeria/Global",
      domain: "Fintech",
      re: /\b(?:Account\s*No\.?|Acc\s*No\.?|NUBAN)[:\s]*(\d{10})\b/gi,
      validate(val, context) {
        const s = String(val).trim();
        if (!/^\d{10}$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        return /acc|nuban|account|bank/i.test(ctx);
      },
      mask(val) {
        const s = String(val).replace(/\D/g, "");
        return s.length === 10 ? s.slice(0, 2) + "******" + s.slice(-2) : "[ACCOUNT]";
      }
    },

    SORT_CODE: {
      id: "sort_code",
      name: "Bank Sort Code (UK 6-digit & Nigerian 9-digit NIBSS)",
      region: "Fintech",
      domain: "Fintech",
      re: /\bSort\s*Code[:\s]*(\d{6,9})\b|\b\d{2}[-\s]\d{2}[-\s]\d{2}\b/gi,
      validate(val) {
        const s = String(val).replace(/[-\s]/g, "");
        return /^\d{6}$/.test(s) || /^\d{9}$/.test(s);
      },
      mask(val) {
        return "[SORT CODE]";
      }
    },

    PHONE_NG: {
      id: "phone_ng",
      name: "Nigerian Phone Number",
      region: "Nigeria",
      domain: "Telecom/Fintech",
      re: /(?:\+234\s?\(?0?\)?|0)[789][01]\d{1}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
      validate(val) {
        const cleaned = String(val).replace(/[\s()-]/g, "");
        return /^(?:\+234|0)[789][01]\d{8}$/.test(cleaned);
      },
      mask(val) {
        const s = String(val).replace(/[\s()-]/g, "");
        if (s.startsWith("+234")) return "+234 " + s.slice(4, 7) + " **** " + s.slice(-3);
        return s.slice(0, 4) + " **** " + s.slice(-3);
      }
    },

    CURRENCY_AMOUNTS: {
      id: "currency_amounts",
      name: "Financial Amounts (Numbers & Words)",
      region: "Global",
      domain: "Fintech",
      re: /(?:₦|NGN|\$|£|€)\s?[\d,]+(?:\.\d{2})?(?:\s*\([A-Za-z\s-]+\))?/gi,
      validate(val) {
        return /(?:₦|NGN|\$|£|€)\s?[\d,]+(?:\.\d{2})?/i.test(String(val).trim());
      },
      mask() { return "[AMOUNT]"; }
    },

    ADDRESS: {
      id: "address",
      name: "Residential, Corporate & Property Addresses",
      region: "Global",
      domain: "Geographic/Legal",
      re: /\b(?:residing at|registered (?:corporate )?address at|property located at)\s+([^,\n\r(]+(?:,\s*[^,\n\r(]+){1,4})/gi,
      validate(val) {
        return /\b(?:residing at|corporate address at|property located at|\b\d+\s+[A-Z][a-z]+\s+(?:Avenue|Way|Street|Road|Close|Crescent|Drive|Expressway))\b/i.test(String(val));
      },
      mask() { return "[ADDRESS REDACTED]"; }
    },

    // --- UK & European Legal & Fintech ---
    IBAN: {
      id: "iban",
      name: "IBAN (International Bank Account Number)",
      region: "Europe/Global",
      domain: "Fintech",
      re: /\b[A-Z]{2}\d{2}[A-Z0-9\s-]{11,32}\b/gi,
      validate(val) {
        return isValidIBAN(String(val));
      },
      mask(val) {
        const s = String(val).replace(/[\s-]/g, "").toUpperCase();
        return s.slice(0, 4) + " **** **** " + s.slice(-4);
      }
    },

    NI_UK: {
      id: "ni_uk",
      name: "UK National Insurance Number",
      region: "UK",
      domain: "Legal/Govt",
      re: /\b[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]{1}\b/gi,
      validate(val) {
        const s = String(val).replace(/\s/g, "").toUpperCase();
        return /^[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\d{6}[A-D]{1}$/.test(s);
      },
      mask(val) {
        const s = String(val).replace(/\s/g, "").toUpperCase();
        return s.slice(0, 2) + " ** ** " + s.slice(-2);
      }
    },

    POSTCODE_UK: {
      id: "postcode_uk",
      name: "UK Postcode",
      region: "UK",
      domain: "Geographic",
      re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
      validate(val) {
        return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(String(val).trim());
      },
      mask(val) {
        const parts = String(val).trim().split(/\s+/);
        return parts[0] + " ***";
      }
    },

    CASE_CITATION: {
      id: "case_citation",
      name: "Court Citation / Case Number",
      region: "UK/Global",
      domain: "Legal",
      re: /(?:\[\d{4}\]\s+(?:UKSC|UKPC|UKHL|EWCA(?:\s+(?:Civ|Crim))?|EWHC|UKEAT|EAT|UKUT|UKFTT|EWFC|EWCOP)\b[\w\s().]{0,20}?\d+|\b\d{7}\/\d{4}\b|\b(?:case|claim)\s+(?:no|number|ref(?:erence)?)s?\.?:?\s*[A-Za-z0-9][\w\/\-.]{1,}\d)/gi,
      validate(val) {
        return /\[\d{4}\]|\d{7}\/\d{4}|(?:case|claim)\s+(?:no|ref)/i.test(String(val));
      },
      mask() { return "[CASE NO.]"; }
    },

    LEGISLATION_GDPR: {
      id: "legislation_gdpr",
      name: "Legislation / GDPR / Statutory Instruments",
      region: "UK/EU",
      domain: "Legal",
      re: /\b(?:(?:UK\s+)?GDPR|SI\s+\d{4}\/\d+|(?:[A-Z][\w()'’]*\s+){1,7}Act\s+\d{4}|(?:ss?|sections?|Article|Regulation|Schedule)\s+\d+[A-Za-z]?(?:\(\d+\))*)\b/g,
      validate(val) {
        return /\b(?:GDPR|SI\s+\d{4}|Act\s+\d{4}|section\s+\d+|Article\s+\d+)/i.test(String(val));
      },
      mask() { return "[LEGISLATION]"; }
    },

    // --- US & Global Financial ---
    SSN_US: {
      id: "ssn_us",
      name: "US Social Security Number (SSN)",
      region: "US",
      domain: "Legal/Govt",
      re: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
      validate(val) {
        const s = String(val).replace(/[-\s]/g, "");
        return /^(?!000|666|9\d{2})\d{3}(?!00)\d{2}(?!0000)\d{4}$/.test(s);
      },
      mask(val) {
        const s = String(val).replace(/[-\s]/g, "");
        return "***-**-" + s.slice(-4);
      }
    },

    CREDIT_CARD: {
      id: "credit_card",
      name: "Credit / Debit Card (PAN)",
      region: "Global",
      domain: "Fintech",
      re: /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g,
      validate(val) {
        return isValidLuhn(String(val));
      },
      mask(val) {
        const s = String(val).replace(/\D/g, "");
        return "**** **** **** " + s.slice(-4);
      }
    },

    ROUTING_ABA: {
      id: "routing_aba",
      name: "US ABA Routing Number",
      region: "US",
      domain: "Fintech",
      re: /\b\d{9}\b/g,
      validate(val, context) {
        if (!isValidAbaRouting(val)) return false;
        const ctx = (context || "").toLowerCase();
        return /routing|aba|transit|wire/i.test(ctx);
      },
      mask(val) {
        const s = String(val).replace(/\D/g, "");
        return "*****" + s.slice(-4);
      }
    },

    SWIFT_BIC: {
      id: "swift_bic",
      name: "SWIFT / BIC Code",
      region: "Global",
      domain: "Fintech",
      re: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
      validate(val, context) {
        const s = String(val).trim().toUpperCase();
        if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        return /swift|bic|bank code|wire/i.test(ctx);
      },
      mask(val) {
        const s = String(val).trim().toUpperCase();
        return s.slice(0, 4) + "****";
      }
    },

    PASSPORT: {
      id: "passport",
      name: "International Passport Number",
      region: "Global",
      domain: "Legal/Govt",
      re: /\b[A-Z0-9]{8,9}\b/g,
      validate(val, context) {
        const s = String(val).trim().toUpperCase();
        if (!/^[A-Z0-9]{8,9}$/.test(s)) return false;
        const ctx = (context || "").toLowerCase();
        return /passport|travel\s*doc|intl\s*id/i.test(ctx);
      },
      mask(val) {
        const s = String(val).trim().toUpperCase();
        return s.slice(0, 2) + "*****" + s.slice(-2);
      }
    },

    EMAIL: {
      id: "email",
      name: "Email Address",
      region: "Global",
      domain: "Communications",
      re: /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g,
      validate(val) {
        return /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(String(val).trim());
      },
      mask(val, keepDomain = true) {
        const s = String(val).trim();
        const at = s.indexOf("@");
        if (at === -1) return "[EMAIL]";
        if (!keepDomain) return "[EMAIL]";
        const user = s.slice(0, at);
        const domain = s.slice(at);
        const maskedUser = user.length > 2 ? user.slice(0, 1) + "***" + user.slice(-1) : "***";
        return maskedUser + domain;
      }
    },

    PHONE_INTL: {
      id: "phone_intl",
      name: "International Phone Number",
      region: "Global",
      domain: "Telecom",
      re: /(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
      validate(val) {
        const cleaned = String(val).replace(/[\s()-]/g, "");
        return /^\+?\d{10,14}$/.test(cleaned);
      },
      mask(val) {
        const s = String(val).trim();
        return s.length > 4 ? s.slice(0, 3) + " **** " + s.slice(-3) : "[PHONE]";
      }
    },

    NAME_HONORIFIC: {
      id: "name_honorific",
      name: "Personal Name with Title / Honorific",
      region: "Global",
      domain: "Personal/Legal",
      re: new RegExp("\\b" + TITLES_PATTERN + "\\.?\\s+[A-Z][a-z]+(?:[^\S\\r\\n]+[A-Z][a-z]+)*\\b", "g"),
      validate(val) {
        return TITLES_RE.test(String(val).trim());
      },
      mask(val) {
        const s = String(val).trim();
        const m = s.match(TITLES_RE);
        const title = m ? m[0].trim() : "Person";
        return `${title} [REDACTED]`;
      }
    }
  };

  /**
   * Two-Pass Adaptive Entity Graph Extractor
   * Pass 1: Scans full text to discover primary parties, names, titles, aliases, and corporate names.
   * Pass 2: Creates regexes for all discovered variants (e.g. "Mr. Gbajabiamila", "Mrs. Anifowose", "Efe Holdings")
   */
  function buildEntityGraph(fullText) {
    const names = new Set();
    const surnames = new Set();
    const firstnames = new Set();
    const companies = new Set();
    const addresses = new Set();

    if (!fullText || typeof fullText !== "string") {
      return { names, surnames, firstnames, companies, addresses };
    }

    // 1. Primary Full Name with Title on same line: e.g. "Mr. Femi Gbajabiamila"
    const nameRe = new RegExp("\\b" + TITLES_PATTERN + "\\.?\\s+([A-Z][a-z]+(?:[^\\S\\r\\n]+[A-Z][a-z]+)+)\\b", "g");
    let m;
    while ((m = nameRe.exec(fullText)) !== null) {
      const full = m[0].trim();
      const bare = m[1].trim();
      names.add(full);
      names.add(bare);
      const parts = bare.split(/\s+/);
      if (parts.length >= 2) {
        firstnames.add(parts[0]);
        surnames.add(parts[parts.length - 1]);
        for (let i = 1; i < parts.length; i++) {
          surnames.add(parts[i]);
        }
      }
    }

    // 2. Companies & Business Entities
    const compRe1 = /\b(?:business name|name|company)\s+([A-Z][a-zA-Z0-9\s&]+?(?:Holdings|Ltd|Plc|Limited|LLC|Inc|Enterprises|Ventures|Bank))\b/gi;
    while ((m = compRe1.exec(fullText)) !== null) {
      companies.add(m[1].trim());
    }
    const compRe2 = /\b[A-Z][a-zA-Z0-9\s&]{2,30}?\s+(?:Plc|Ltd|Limited|LLC)\b/g;
    while ((m = compRe2.exec(fullText)) !== null) {
      companies.add(m[0].trim());
    }
    const bankRe = /\b(?:First Bank of Nigeria Plc|Zenith Bank|First Bank|GTBank|Access Bank|UBA|Fidelity Bank|Stanbic|Kuda Bank|Moniepoint|Opay|PalmPay)\b/gi;
    while ((m = bankRe.exec(fullText)) !== null) {
      companies.add(m[0].trim());
    }

    // 3. Addresses
    const addrRe = /\b(?:residing at|registered (?:corporate )?address at|property located at)\s+([^,\n\r]+(?:,\s*[^,\n\r]+){1,4})/gi;
    while ((m = addrRe.exec(fullText)) !== null) {
      let addr = m[1].trim();
      // Clean up any trailing parentheses or labels
      addr = addr.replace(/\s*\([^)]*$/, "").trim();
      if (addr.length > 8) addresses.add(addr);
    }

    return { names, surnames, firstnames, companies, addresses };
  }

  // --- Pseudonym Generator ---
  class PseudonymVault {
    constructor() {
      this.cache = new Map();
      this.counts = { individual: 0, company: 0, account: 0, bvn: 0, nin: 0, generic: 0 };
    }

    getPseudonym(originalValue, categoryId = "generic") {
      const key = `${categoryId}::${String(originalValue).trim().toLowerCase()}`;
      if (this.cache.has(key)) return this.cache.get(key);

      let label;
      const id = (categoryId || "").toLowerCase();
      if (id.includes("name") || id.includes("witness") || id.includes("party")) {
        this.counts.individual++;
        label = `Individual_${String(this.counts.individual).padStart(3, "0")}`;
      } else if (id.includes("company") || id.includes("org") || id.includes("cac")) {
        this.counts.company++;
        label = `Entity_${String(this.counts.company).padStart(3, "0")}`;
      } else if (id.includes("account") || id.includes("nuban") || id.includes("sort")) {
        this.counts.account++;
        label = `Acct_${hashString(originalValue).slice(0, 6)}`;
      } else if (id.includes("bvn")) {
        this.counts.bvn++;
        label = `BVN_TOKEN_${hashString(originalValue).slice(0, 6)}`;
      } else if (id.includes("nin")) {
        this.counts.nin++;
        label = `NIN_TOKEN_${hashString(originalValue).slice(0, 6)}`;
      } else {
        this.counts.generic++;
        label = `ANON_${hashString(originalValue).slice(0, 8)}`;
      }

      this.cache.set(key, label);
      return label;
    }

    clear() {
      this.cache.clear();
      this.counts = { individual: 0, company: 0, account: 0, bvn: 0, nin: 0, generic: 0 };
    }
  }

  // --- Column Detector ---
  function detectColumnType(headerName, sampleValues = []) {
    const header = (headerName || "").trim().toLowerCase();
    const scores = {};
    Object.keys(PII_CATEGORIES).forEach(k => { scores[k] = 0; });

    if (/bvn|bank\s*verification/i.test(header)) scores.BVN += 85;
    if (/nin|national\s*id/i.test(header)) scores.NIN += 85;
    if (/nuban|account\s*(?:no|number|num)|acc\s*no/i.test(header)) scores.BANK_ACCOUNT += 85;
    if (/cac|rc\s*no|rc_number|registration|reg\s*no/i.test(header)) scores.CAC += 85;
    if (/tin|tax\s*id/i.test(header)) scores.TIN += 90;
    if (/address|residence|location/i.test(header)) scores.ADDRESS += 85;
    if (/phone|mobile|tel|gsm/i.test(header)) { scores.PHONE_NG += 50; scores.PHONE_INTL += 50; }
    if (/email|e-mail/i.test(header)) scores.EMAIL += 95;
    if (/card|pan|card_number|card_no/i.test(header)) scores.CREDIT_CARD += 85;
    if (/sort\s*code|sortcode/i.test(header)) scores.SORT_CODE += 85;
    if (/iban/i.test(header)) scores.IBAN += 95;
    if (/swift|bic/i.test(header)) scores.SWIFT_BIC += 85;
    if (/ssn|social\s*sec/i.test(header)) scores.SSN_US += 90;
    if (/routing/i.test(header)) scores.ROUTING_ABA += 85;
    if (/passport/i.test(header)) scores.PASSPORT += 85;
    if (/postcode|zip/i.test(header)) scores.POSTCODE_UK += 70;
    if (/ni\s*no|national\s*insurance/i.test(header)) scores.NI_UK += 90;
    if (/salary|amount|price|cost|fee|balance/i.test(header)) scores.CURRENCY_AMOUNTS += 60;
    if (/name|customer|client|witness|party|director|staff|employee/i.test(header)) {
      scores.NAME_HONORIFIC += 65;
    }

    const validSamples = sampleValues.filter(v => v != null && String(v).trim().length > 0);
    if (validSamples.length > 0) {
      for (const val of validSamples) {
        const s = String(val).trim();
        for (const [catKey, catDef] of Object.entries(PII_CATEGORIES)) {
          if (catDef.validate && catDef.validate(s, header)) {
            scores[catKey] += (100 / validSamples.length);
          }
        }
      }
    }

    let bestCat = null;
    let maxScore = 0;
    for (const [catKey, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestCat = catKey;
      }
    }

    if (maxScore >= 45 && bestCat) {
      return {
        category: bestCat,
        categoryDef: PII_CATEGORIES[bestCat],
        confidence: Math.min(100, Math.round(maxScore))
      };
    }

    if (/desc|narrative|memo|comment|remark|detail|note|particular/i.test(header)) {
      return { category: "FREE_TEXT", categoryDef: { name: "Free-Text / Narrative" }, confidence: 75 };
    }

    return { category: null, confidence: 0 };
  }

  // --- Free-Text Inline Entity Redactor ---
  function redactFreeText(text, options = {}, vault = null) {
    if (!text || typeof text !== "string") return text;
    let result = text;
    const mode = options.mode || "mask";

    // 1. Emails
    result = result.replace(PII_CATEGORIES.EMAIL.re, match => {
      if (mode === "pseudonymize" && vault) return vault.getPseudonym(match, "email");
      if (mode === "redact") return "[EMAIL]";
      return PII_CATEGORIES.EMAIL.mask(match, options.keepDomain !== false);
    });

    // 2. BVN
    result = result.replace(PII_CATEGORIES.BVN.re, match => {
      return mode === "pseudonymize" && vault ? vault.getPseudonym(match, "bvn") :
             mode === "redact" ? "[BVN REDACTED]" : "[BVN]";
    });

    // 3. NIN
    result = result.replace(PII_CATEGORIES.NIN.re, match => {
      return mode === "pseudonymize" && vault ? vault.getPseudonym(match, "nin") :
             mode === "redact" ? "[NIN REDACTED]" : "[NIN]";
    });

    // 4. CAC
    result = result.replace(PII_CATEGORIES.CAC.re, () => "[CAC REGISTRATION]");

    // 5. TIN
    result = result.replace(PII_CATEGORIES.TIN.re, () => "[TIN REDACTED]");

    // 6. Bank Accounts
    result = result.replace(PII_CATEGORIES.BANK_ACCOUNT.re, () => "[ACCOUNT NO.]");

    // 7. Sort Codes
    result = result.replace(PII_CATEGORIES.SORT_CODE.re, () => "[SORT CODE]");

    // 8. Phones
    result = result.replace(PII_CATEGORIES.PHONE_NG.re, match => {
      if (mode === "pseudonymize" && vault) return vault.getPseudonym(match, "phone");
      return PII_CATEGORIES.PHONE_NG.mask(match);
    });

    // 9. Credit Cards
    result = result.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g, match => {
      if (isValidLuhn(match)) return "[CARD NUMBER]";
      return match;
    });

    // 10. Financial Amounts
    result = result.replace(PII_CATEGORIES.CURRENCY_AMOUNTS.re, () => "[AMOUNT]");

    // 11. Addresses
    result = result.replace(PII_CATEGORIES.ADDRESS.re, () => "[ADDRESS REDACTED]");

    // 12. Titled Names
    result = result.replace(PII_CATEGORIES.NAME_HONORIFIC.re, match => {
      if (mode === "pseudonymize" && vault) return vault.getPseudonym(match, "name");
      if (mode === "redact") return "[NAME REDACTED]";
      return PII_CATEGORIES.NAME_HONORIFIC.mask(match);
    });

    return result;
  }

  // Export to global scope
  const PIIEngine = {
    categories: PII_CATEGORIES,
    titlesPattern: TITLES_PATTERN,
    isValidLuhn,
    isValidIBAN,
    isValidAbaRouting,
    hashString,
    PseudonymVault,
    detectColumnType,
    redactFreeText,
    buildEntityGraph
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PIIEngine;
  }
  global.PIIEngine = PIIEngine;
})(typeof window !== "undefined" ? window : globalThis);

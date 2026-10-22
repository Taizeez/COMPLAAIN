# Complaain — Compliance as an Infrastructure
### Enterprise PII Redaction & Column Anonymizer Suite

**Complaain** is an air-gapped, client-side compliance platform designed to permanently redact and anonymize sensitive Personally Identifiable Information (PII) from **Spreadsheets (Excel `.xlsx`, `.xls`, `.csv`, `.tsv`, Google Sheets)** and **PDF Documents (digital and scanned)**.

All files are processed **100% locally** in computer memory. Zero documents, cell values, or telemetry ever leave your machine.

---

## 🚀 How to Download & Run Complaain (No ZIP Extraction Needed)

Designed for non-technical individuals (lawyers, compliance officers, risk analysts, auditors, HR). You **never need to download a ZIP file or open terminal commands**:

### 🌐 Method 1: Instant Web App & PWA Desktop Install (Zero Download)
1. Open the hosted GitHub Pages link in Google Chrome, Microsoft Edge, or Safari:
   `https://<your-username>.github.io/<repo-name>/`
2. Click **Install App** in the header or the **Install** icon in your browser address bar.
3. Complaain is instantly installed as a native Windows/macOS desktop application with its own icon on your Desktop and Start Menu.
4. **Works 100% offline** — files never touch a server, and the app automatically updates when you reload.

---

### 📦 Method 2: 1-Click Single Standalone File Download
- Download the single file **[complaain-portable-offline.html](https://raw.githubusercontent.com/<your-username>/<repo-name>/main/complaain-portable-offline.html)** directly to your computer.
- Double-click the downloaded `.html` file.
- It opens immediately in any browser with full offline redaction, spreadsheet column anonymizer, and MuPDF WASM engine built-in.
- **Zero installation, zero zip files, zero dependencies.** You can carry it on a USB flash drive or email it.
- *(For Windows Executable: Download **`Complaain-Windows.exe`** from GitHub Releases — 1-click single-file binary, no zip).*

---

### ⚡ Method 3: 1-Line Windows Desktop Installer (With Full Local GLiNER AI Model)
To install the full local AI transformer suite and automatically place a **Complaain** shortcut on your Windows Desktop:
1. Right-click your Windows Start button and choose **PowerShell** (or Windows Terminal).
2. Paste this single command and press Enter:
   ```powershell
   irm https://raw.githubusercontent.com/<your-username>/<repo-name>/main/install.ps1 | iex
   ```
3. A shortcut named **Complaain** will appear directly on your Desktop. Double-click it anytime to run!

---

## 🧠 Local Entity Capturing with GLiNER Transformer AI

Complaain features a hybrid dual-layer entity detection engine:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPLAAIN DUAL-LAYER ENGINE                     │
├─────────────────────────────────────┬──────────────────────────────────┤
│   Deterministic Algorithmic Rules   │  GLiNER Zero-Shot Transformer AI │
│   (Instant, 100% Exact Matches)     │  (urchade/gliner_small-v2.1)     │
├─────────────────────────────────────┼──────────────────────────────────┤
│ • BVN, NIN, CAC Registrations       │ • Contextual Person Names        │
│ • Bank Accounts, Sort Codes, IBAN   │ • Signatories & Witnesses        │
│ • Phone Numbers, Emails             │ • Corporate Entities & Banks     │
│ • Credit Cards (Luhn algorithm)     │ • Physical Property Addresses    │
│ • Currency Amounts (₦, $, €, £)     │ • Co-reference Document Graph    │
└─────────────────────────────────────┴──────────────────────────────────┘
```

1. **Deterministic Rules & Algorithmic Validations**: Instantly captures structured PII (NIN, BVN, Credit Cards via Luhn checksum, IBAN via Mod-97, Sort Codes, CAC numbers, Phone numbers, Emails).
2. **GLiNER Zero-Shot Transformer AI (`urchade/gliner_small-v2.1`)**: Captures arbitrary semantic entities locally in memory without cloud APIs. Extracts complex African and international person names, corporate entities, banking institutions, and physical property locations.
3. **Document Co-Reference Graph**: When an entity like `"Mr. Babatunde Raji Fashola"` is detected on page 1, the co-reference engine automatically propagates `"Fashola"` and `"Babatunde"` across all remaining pages, schedules, and annexures so no occurrence is missed. Boilerplate legal roles (*"First Party"*, *"Second Party"*, *"Witness"*, *"Guarantor"*) are safely protected from accidental redaction.

---

## 🔄 Automatic Update on Reload
When you open or reload Complaain (`Ctrl + R` or `F5`), the application automatically checks for updates in the background against `version.json` and updates service worker assets.
- If a new version or feature is detected, an **Update Available** banner appears with the changelog.
- Clicking **Update & Reload** instantly flushes outdated caches, activates the latest service worker build, and refreshes the page with the newest features.

---

## 🌟 Key Capabilities

### 1. Intelligent Spreadsheet Column Anonymization
- **Multi-Format Support**: Native `.xlsx`, `.xls`, `.csv`, `.tsv`, and Google Sheets exports.
- **Batch Column Selection**: Check individual columns or click **Select Detected PII** to batch-select all sensitive columns.
- **Action Strategies**:
  - **✨ Anonymize (Deterministic Pseudonymization)**: Consistent HMAC pseudonym hashing (`Individual_001`, `Entity_002`, `Acct_3E9A`) preserving SQL table JOINs and referential integrity.
  - **🔒 Mask (Partial Redaction)**: Preserves context while obscuring sensitive digits (e.g. `222******89`, `0803****789`, `a***@bank.com`).
  - **⬛ Redact**: Completely replaces values with custom text stamps.
- **Real-Time Side-by-Side Diff**: Compare sanitized output, original data, or side-by-side diff (red strikethrough for deleted data, green for replacements).
- **Compliance Audit Trail**: Export full audit logs (`.csv` or `.json`) documenting every modified cell.

---

### 2. Comprehensive Fintech & Legal PII Coverage

| Jurisdiction / Domain | Covered Entities & Algorithmic Validations |
| :--- | :--- |
| **Nigeria & African Fintech** | • **BVN (Bank Verification Number)**: 11-digit financial identifier with proximity context filters.<br>• **NIN (National Identification Number)**: 11-digit national identity.<br>• **NUBAN**: 10-digit Nigerian Uniform Bank Account Numbers.<br>• **CAC Registration**: Corporate Affairs Commission numbers (`RC`, `BN`, `IT`, `LLP`, `CAC/...`).<br>• **Nigerian Phones**: `+234`, `080`, `081`, `090`, `091`, `070` mobile series.<br>• **Naira Amounts**: Currency symbols (`₦`, `NGN`) and financial suffixes. |
| **UK & European Legal/Fintech** | • **UK Sort Codes & Accounts**: 6-digit sort codes (`XX-XX-XX`) and 8-digit accounts.<br>• **IBAN**: Validated using real **ISO 7064 Modulo 97-10** checksum.<br>• **National Insurance (NI)**: Official HMRC format.<br>• **UK Postcodes**: Standard UK postcode formats.<br>• **Court & Tribunal Citations**: Neutral citations (`[2026] EWCA Civ 123`, `UKSC`, `UKEAT`, tribunal case references `1234567/2025`).<br>• **Legislation**: Acts of Parliament, UK GDPR, Statutory Instruments. |
| **US & Global Financial** | • **Credit / Debit Card PANs**: 13–19 digits validated with the **Luhn Algorithm** to eliminate false positives.<br>• **SSN**: 9-digit US Social Security Numbers.<br>• **ABA Routing**: 9-digit Federal Reserve transit numbers with Mod-10 checksum.<br>• **SWIFT / BIC**: 8 or 11 character ISO 9362 bank identifier codes.<br>• **International Passports**: Biometric passport numbers across international formats. |
| **Universal Personal & Legal** | • **Emails**: Option to mask username while keeping domain (`[redacted]@domain.com`) or full redact.<br>• **Titles & Honorifics**: African cultural titles (*Chief, Otunba, Alhaji, Alhaja, Hajia, Mallam, Prince*), Legal titles (*Barrister, Solicitor, Hon., Justice, Judge, Sen.*), Religious titles (*Pastor, Bishop, Apostle, Imam, Sheikh*), and Academic/Honorific (*Prof., Dr., Engr., Sir, Dame*). |

---

### 3. Smart Text Replacement Badges & PDF Redaction
- **Smart Replacement Badges**: Rather than solid black or white boxes, text is replaced with clean badges matching the entity type:
  - `[NAME_REDACTED]`
  - `[NIN_REDACTED]`
  - `[BVN_REDACTED]`
  - `[ACCOUNT_REDACTED]`
  - `[EMAIL_REDACTED]`
  - `[PHONE_REDACTED]`
  - `[ADDRESS_REDACTED]`
  - `[ORG_REDACTED]` / `[BANK_REDACTED]`
  - `[CAC_REDACTED]`
  - `[TIN_REDACTED]`
  - `[AMOUNT_REDACTED]`
- **Multi-Input Custom Redactions (Comma-Separated)**: Enter any custom names, account numbers, plot/address references, or characters separated by commas (e.g. `Gbajabiamila, 0049201948, Asaba, Plot 5`). Complaain automatically locates and replaces them with confidential badges across all pages.
- **Visual Redactor Studio (Interactive Stamping)**:
  - Open any PDF directly into the Visual Studio for manual click-and-drag redactions.
  - Choose from smart badge stamps (`[SIGNATURE_REDACTED]`, `[NIN_REDACTED]`, `[EMAIL_REDACTED]`, `[NAME_REDACTED]`, `[STAMP_REDACTED]`, etc.), custom text badges (`✏️ Custom Text...`), blackout, or whiteout boxes.
  - **In-Studio Auto-Stamp**: Type comma-separated text, numbers, or characters directly into the Visual Studio toolbar and click `⚡ Auto-Stamp` to instantly place badge boxes on all matching occurrences across the page.
  - **Permanent Pixel Burn**: Redactions are physically burned into the underlying bitmap image pixels (scanned pages) or purged from the PDF content stream (digital pages).
- **Physical Stream Purge**: Powered by PyMuPDF and client-side MuPDF WebAssembly. Glyph operators (`Tj`, `TJ`) are completely purged from the stream with a self-auditing verification loop.

---

### 4. Command-Line Interface (CLI Batch Processing)
You can also run Complaain directly from the terminal without opening a browser:

```bash
# Redact any PDF with smart badges and custom terms:
python complaain.py agreement.pdf --custom "Gbajabiamila, 0049201948, Asaba" -o agreement_redacted.pdf

# Redact with specific style (badges, generic, blackout, clean):
python complaain.py agreement.pdf --style badges -o agreement_badges.pdf

# Anonymize specific columns in an Excel spreadsheet:
python complaain.py customers.xlsx --anonymize "Full Name,Email,NIN" -o clean_customers.xlsx

# Mask card numbers and BVNs in a CSV:
python complaain.py transactions.csv --mask "Card Number,BVN" --anonymize "Customer Name"
```

---

### Included Benchmark Test Files:
- [test_agreement.pdf](file:///c:/Users/HP/rea_pii/test_agreement.pdf): Confidential Settlement Agreement & Mutual Release benchmark (82 verified redactions, 0 survivors).
- [sample_fintech_legal_data.xlsx](file:///c:/Users/HP/rea_pii/sample_fintech_legal_data.xlsx): Multi-column legal/fintech dataset.
- [sample_fintech_legal_data.csv](file:///c:/Users/HP/rea_pii/sample_fintech_legal_data.csv): High-volume CSV benchmark.

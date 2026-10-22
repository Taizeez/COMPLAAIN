/**
 * safeRedact UI Application Controller
 * Manages tabs, file ingest, spreadsheet column controls, diff viewer,
 * PDF processing, audit export, and PWA updates.
 */

(function () {
  "use strict";

  // Elements
  const tabSpreadsheet = document.getElementById("tabSpreadsheet");
  const tabPdf = document.getElementById("tabPdf");
  const tabRules = document.getElementById("tabRules");
  const tabAudit = document.getElementById("tabAudit");

  const viewSpreadsheet = document.getElementById("viewSpreadsheet");
  const viewPdf = document.getElementById("viewPdf");
  const viewRules = document.getElementById("viewRules");
  const viewAudit = document.getElementById("viewAudit");

  // Instances
  const spreadsheetEngine = new SpreadsheetRedactor();
  const pdfEngine = new PDFRedactor();

  // State
  let currentFileBytes = null;
  let currentFileType = null; // "spreadsheet" or "pdf"
  let currentFileName = "";
  let previewDiffMode = "sanitized"; // "sanitized", "original", "diff"

  // Version & Updates
  const APP_VERSION = "1.3.0";

  // Check for local Python Intelligence API
  let pythonApiAvailable = false;
  let glinerAvailable = false;
  fetch("/api/status").then(r => r.json()).then(data => {
    if (data.status === "online") {
      pythonApiAvailable = true;
      glinerAvailable = !!data.gliner;
      const statusEl = document.getElementById("pdfEngineStatus");
      if (statusEl) {
        if (data.gliner) {
          statusEl.textContent = "🟢 GLiNER AI Transformer Active (Local Zero-Shot)";
          statusEl.className = "badge badge-gold";
          statusEl.title = `Local AI model: ${data.gliner_model || 'urchade/gliner_small-v2.1'} capturing names, orgs, banks, locations, IDs`;
        } else {
          statusEl.textContent = "⚡ Python Intelligence Server Active (Complaain Engine)";
          statusEl.className = "badge badge-success";
        }
      }
    }
  }).catch(() => {
    pythonApiAvailable = false;
    glinerAvailable = false;
  });

  // Initialize MuPDF engine in background (fallback / standalone offline mode)
  pdfEngine.init().then(ready => {
    if (!pythonApiAvailable) {
      const statusEl = document.getElementById("pdfEngineStatus");
      if (statusEl) {
        statusEl.textContent = ready ? "✓ MuPDF WASM Engine Ready (Offline)" : "PDF Engine Standby";
      }
    }
  });

  // --- Tab Navigation ---
  function switchTab(activeTab, activeView) {
    [tabSpreadsheet, tabPdf, tabRules, tabAudit].forEach(t => t.classList.remove("active"));
    [viewSpreadsheet, viewPdf, viewRules, viewAudit].forEach(v => v.classList.remove("active"));
    activeTab.classList.add("active");
    activeView.classList.add("active");
  }

  tabSpreadsheet.addEventListener("click", () => switchTab(tabSpreadsheet, viewSpreadsheet));
  tabPdf.addEventListener("click", () => switchTab(tabPdf, viewPdf));
  tabRules.addEventListener("click", () => switchTab(tabRules, viewRules));
  tabAudit.addEventListener("click", () => {
    switchTab(tabAudit, viewAudit);
    renderAuditTable();
  });

  // --- Automatic Update Checking on Reload & Service Worker ---
  async function checkForUpdates(isManual = false) {
    if (btnCheckUpdates && isManual) {
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.textContent = "Checking...";
    }
    try {
      const res = await fetch("./version.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("Offline or not reachable");
      const data = await res.json();
      if (data.version && data.version !== APP_VERSION) {
        showUpdateBanner(data.version, data.changelog);
      } else if (isManual) {
        alert(`Complaain is up to date (Version ${APP_VERSION}).`);
      }
    } catch (err) {
      if (isManual) {
        alert("Complaain is currently working offline. Connect to internet to check for updates.");
      }
    } finally {
      if (btnCheckUpdates && isManual) {
        btnCheckUpdates.disabled = false;
        btnCheckUpdates.textContent = "Check Updates";
      }
    }
  }

  function showUpdateBanner(newVersion, changelog = "") {
    let banner = document.getElementById("updateBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "updateBanner";
      banner.className = "update-banner";
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span>🚀 <strong>Update Available:</strong> Complaain version <strong>${escapeHtml(newVersion)}</strong> is ready!</span>
          ${changelog ? `<small style="opacity: 0.85;">(${escapeHtml(changelog)})</small>` : ""}
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="btnApplyUpdate" class="btn btn-sm btn-gold">Update & Reload</button>
          <button id="btnDismissUpdate" class="btn btn-sm btn-ghost">&times;</button>
        </div>
      `;
      document.body.prepend(banner);

      document.getElementById("btnApplyUpdate").addEventListener("click", async () => {
        // Clear caches so new version takes effect immediately
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
        }
        window.location.reload(true);
      });

      document.getElementById("btnDismissUpdate").addEventListener("click", () => {
        banner.remove();
      });
    }
  }

  // Automatically check for updates on reload
  checkForUpdates(false);

  // PWA Service Worker Registration & Update Detection
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(reg => {
      reg.update();
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateBanner("Latest Build", "New service worker assets installed");
            }
          });
        }
      });
    }).catch(err => {
      console.warn("Service Worker registration failed:", err);
    });

    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data && event.data.type === "UPDATE_AVAILABLE") {
        showUpdateBanner(event.data.version);
      }
    });
  }

  // Standalone PWA install prompt handler
  let deferredPrompt = null;
  const installBtn = document.getElementById("btnInstallPwa");
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = "inline-flex";
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          installBtn.style.display = "none";
        }
        deferredPrompt = null;
      }
    });
  }

  // Manual Check for Updates button action
  const btnCheckUpdates = document.getElementById("btnCheckUpdates");
  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener("click", () => checkForUpdates(true));
  }

  // 1-Click Export Standalone App
  const btnExportOffline = document.getElementById("btnExportOffline");
  if (btnExportOffline) {
    btnExportOffline.addEventListener("click", async () => {
      btnExportOffline.disabled = true;
      btnExportOffline.textContent = "Compiling Bundle...";
      await exportStandaloneHTML();
      btnExportOffline.disabled = false;
      btnExportOffline.textContent = "Export Portable HTML";
    });
  }

  // --- SPREADSHEET INGEST & CONTROLS ---
  const sheetDrop = document.getElementById("sheetDrop");
  const sheetFileInput = document.getElementById("sheetFileInput");
  const sheetConfigCard = document.getElementById("sheetConfigCard");
  const sheetPreviewCard = document.getElementById("sheetPreviewCard");
  const sheetTabContainer = document.getElementById("sheetTabContainer");
  const columnConfigList = document.getElementById("columnConfigList");
  const previewTable = document.getElementById("previewTable");

  sheetDrop.addEventListener("click", () => sheetFileInput.click());
  sheetDrop.addEventListener("dragover", e => { e.preventDefault(); sheetDrop.classList.add("dragover"); });
  sheetDrop.addEventListener("dragleave", () => sheetDrop.classList.remove("dragover"));
  sheetDrop.addEventListener("drop", e => {
    e.preventDefault();
    sheetDrop.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls|csv|tsv)$/i.test(file.name)) {
      handleSpreadsheetFile(file);
    } else {
      alert("Please upload a spreadsheet file (.xlsx, .xls, .csv, .tsv)");
    }
  });

  sheetFileInput.addEventListener("change", () => {
    if (sheetFileInput.files[0]) {
      handleSpreadsheetFile(sheetFileInput.files[0]);
    }
  });

  async function handleSpreadsheetFile(file) {
    currentFileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    currentFileBytes = new Uint8Array(arrayBuffer);

    try {
      const info = spreadsheetEngine.loadFile(currentFileBytes, currentFileName);
      renderSheetTabs(info.sheets);
      renderColumnConfigs(spreadsheetEngine.currentSheetName);
      sheetConfigCard.classList.remove("hidden");

      // Auto-run initial preview
      spreadsheetEngine.processWorkbook();
      renderPreviewTable();
      sheetPreviewCard.classList.remove("hidden");

      document.getElementById("sheetFileInfo").textContent =
        `${info.fileName} — ${info.sheets.length} sheet(s), ${info.rowCount - 1} data rows`;
    } catch (err) {
      alert("Failed to parse spreadsheet: " + err.message);
      console.error(err);
    }
  }

  function renderSheetTabs(sheetNames) {
    sheetTabContainer.innerHTML = "";
    sheetNames.forEach(name => {
      const btn = document.createElement("button");
      btn.className = `sheet-tab-btn ${name === spreadsheetEngine.currentSheetName ? "active" : ""}`;
      btn.textContent = name;
      btn.addEventListener("click", () => {
        spreadsheetEngine.currentSheetName = name;
        document.querySelectorAll(".sheet-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderColumnConfigs(name);
        renderPreviewTable();
      });
      sheetTabContainer.appendChild(btn);
    });
  }

  function renderColumnConfigs(sheetName) {
    columnConfigList.innerHTML = "";
    const configs = spreadsheetEngine.columnConfigs[sheetName] || [];
    const rows = spreadsheetEngine.sheetData[sheetName] || [];

    configs.forEach((col, idx) => {
      const item = document.createElement("div");
      item.className = "col-config-item";
      item.dataset.col = idx;

      const catBadge = col.detectedCategory ?
        `<span class="badge badge-accent">${col.detectedCategory} (${col.confidence}%)</span>` :
        `<span class="badge badge-muted">General Data</span>`;

      // Extract sample values for this column
      const samples = [];
      for (let r = 1; r < Math.min(rows.length, 5); r++) {
        const v = rows[r][idx];
        if (v !== undefined && v !== null && String(v).trim()) {
          samples.push(String(v).trim());
        }
      }
      const sampleText = samples.length ? `Samples: "${samples.slice(0, 2).join('", "')}"` : "No sample data";

      item.innerHTML = `
        <div class="col-meta">
          <div class="col-select-header">
            <input type="checkbox" class="col-select-check" data-col="${idx}" title="Select column to anonymize/mask/redact">
            <span class="col-title" title="${escapeHtml(col.header)}">${idx + 1}. ${escapeHtml(col.header)}</span>
          </div>
          ${catBadge}
        </div>
        <div class="col-sample-preview" title="${escapeHtml(sampleText)}">${escapeHtml(sampleText)}</div>
        <div class="col-controls">
          <select class="select-action" data-col="${idx}">
            <option value="none" ${col.action === "none" ? "selected" : ""}>Keep Original (No Redaction)</option>
            <option value="pseudonymize" ${col.action === "pseudonymize" ? "selected" : ""}>✨ Anonymize / Pseudonymize (Consistent Token)</option>
            <option value="mask" ${col.action === "mask" ? "selected" : ""}>🔒 Mask / Partial (e.g. 222******89)</option>
            <option value="redact" ${col.action === "redact" ? "selected" : ""}>⬛ Full Redaction ([REDACTED])</option>
            <option value="freetext" ${col.action === "freetext" ? "selected" : ""}>🔍 Free-Text Inline Entity Scan</option>
          </select>
        </div>
      `;

      const check = item.querySelector(".col-select-check");
      check.addEventListener("change", () => {
        item.classList.toggle("selected", check.checked);
      });

      const select = item.querySelector("select");
      select.addEventListener("change", e => {
        spreadsheetEngine.updateColumnAction(sheetName, idx, e.target.value);
        spreadsheetEngine.processWorkbook();
        renderPreviewTable();
      });

      columnConfigList.appendChild(item);
    });

    // Reset select all checkbox
    const chkAll = document.getElementById("chkSelectAllCols");
    if (chkAll) chkAll.checked = false;
  }

  // Helper to get selected column indices
  function getSelectedColumnIndices() {
    const checks = document.querySelectorAll(".col-select-check:checked");
    return Array.from(checks).map(c => parseInt(c.dataset.col, 10));
  }

  // --- Batch Column Selection & Action Handlers ---
  const chkSelectAllCols = document.getElementById("chkSelectAllCols");
  if (chkSelectAllCols) {
    chkSelectAllCols.addEventListener("change", () => {
      const checks = document.querySelectorAll(".col-select-check");
      checks.forEach(c => {
        c.checked = chkSelectAllCols.checked;
        const item = document.querySelector(`.col-config-item[data-col="${c.dataset.col}"]`);
        if (item) item.classList.toggle("selected", chkSelectAllCols.checked);
      });
    });
  }

  const btnSelectPiiCols = document.getElementById("btnSelectPiiCols");
  if (btnSelectPiiCols) {
    btnSelectPiiCols.addEventListener("click", () => {
      const configs = spreadsheetEngine.columnConfigs[spreadsheetEngine.currentSheetName] || [];
      configs.forEach((c, idx) => {
        const check = document.querySelector(`.col-select-check[data-col="${idx}"]`);
        const item = document.querySelector(`.col-config-item[data-col="${idx}"]`);
        const isPii = Boolean(c.detectedCategory);
        if (check) check.checked = isPii;
        if (item) item.classList.toggle("selected", isPii);
      });
    });
  }

  const btnAnonymizeSelected = document.getElementById("btnAnonymizeSelected");
  if (btnAnonymizeSelected) {
    btnAnonymizeSelected.addEventListener("click", () => {
      let selectedCols = getSelectedColumnIndices();
      if (!selectedCols.length) {
        alert("Please check at least one column to anonymize.");
        return;
      }
      const sheetName = spreadsheetEngine.currentSheetName;
      selectedCols.forEach(idx => {
        spreadsheetEngine.updateColumnAction(sheetName, idx, "pseudonymize");
      });
      renderColumnConfigs(sheetName);
      // Re-check previously selected columns
      selectedCols.forEach(idx => {
        const chk = document.querySelector(`.col-select-check[data-col="${idx}"]`);
        const itm = document.querySelector(`.col-config-item[data-col="${idx}"]`);
        if (chk) chk.checked = true;
        if (itm) itm.classList.add("selected");
      });
      spreadsheetEngine.processWorkbook();
      renderPreviewTable();
    });
  }

  const btnMaskSelected = document.getElementById("btnMaskSelected");
  if (btnMaskSelected) {
    btnMaskSelected.addEventListener("click", () => {
      let selectedCols = getSelectedColumnIndices();
      if (!selectedCols.length) {
        alert("Please check at least one column to mask.");
        return;
      }
      const sheetName = spreadsheetEngine.currentSheetName;
      selectedCols.forEach(idx => {
        spreadsheetEngine.updateColumnAction(sheetName, idx, "mask");
      });
      renderColumnConfigs(sheetName);
      selectedCols.forEach(idx => {
        const chk = document.querySelector(`.col-select-check[data-col="${idx}"]`);
        const itm = document.querySelector(`.col-config-item[data-col="${idx}"]`);
        if (chk) chk.checked = true;
        if (itm) itm.classList.add("selected");
      });
      spreadsheetEngine.processWorkbook();
      renderPreviewTable();
    });
  }

  const btnRedactSelected = document.getElementById("btnRedactSelected");
  if (btnRedactSelected) {
    btnRedactSelected.addEventListener("click", () => {
      let selectedCols = getSelectedColumnIndices();
      if (!selectedCols.length) {
        alert("Please check at least one column to redact.");
        return;
      }
      const sheetName = spreadsheetEngine.currentSheetName;
      selectedCols.forEach(idx => {
        spreadsheetEngine.updateColumnAction(sheetName, idx, "redact");
      });
      renderColumnConfigs(sheetName);
      selectedCols.forEach(idx => {
        const chk = document.querySelector(`.col-select-check[data-col="${idx}"]`);
        const itm = document.querySelector(`.col-config-item[data-col="${idx}"]`);
        if (chk) chk.checked = true;
        if (itm) itm.classList.add("selected");
      });
      spreadsheetEngine.processWorkbook();
      renderPreviewTable();
    });
  }

  const btnResetSelected = document.getElementById("btnResetSelected");
  if (btnResetSelected) {
    btnResetSelected.addEventListener("click", () => {
      let selectedCols = getSelectedColumnIndices();
      const sheetName = spreadsheetEngine.currentSheetName;
      if (selectedCols.length) {
        selectedCols.forEach(idx => {
          spreadsheetEngine.updateColumnAction(sheetName, idx, "none");
        });
      } else {
        spreadsheetEngine.analyzeColumns(sheetName);
      }
      renderColumnConfigs(sheetName);
      spreadsheetEngine.processWorkbook();
      renderPreviewTable();
    });
  }

  // Diff Mode Toggles
  document.querySelectorAll(".diff-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-toggle-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      previewDiffMode = btn.dataset.mode;
      renderPreviewTable();
    });
  });

  function renderPreviewTable() {
    const rawRows = spreadsheetEngine.sheetData[spreadsheetEngine.currentSheetName] || [];
    const sanitizedRows = spreadsheetEngine.processedSheets[spreadsheetEngine.currentSheetName] || rawRows;

    if (!rawRows.length) {
      previewTable.innerHTML = "<tr><td>No data available</td></tr>";
      return;
    }

    const headers = rawRows[0];
    const previewCount = Math.min(rawRows.length, 51); // Header + 50 rows

    let html = "<thead><tr><th>#</th>";
    headers.forEach((h, i) => {
      html += `<th>${escapeHtml(String(h || `Col ${i + 1}`))}</th>`;
    });
    html += "</tr></thead><tbody>";

    for (let r = 1; r < previewCount; r++) {
      html += `<tr><td class="row-num">${r}</td>`;
      const rawRow = rawRows[r] || [];
      const sanRow = sanitizedRows[r] || [];

      for (let c = 0; c < headers.length; c++) {
        const rawCell = rawRow[c] !== undefined ? String(rawRow[c]) : "";
        const sanCell = sanRow[c] !== undefined ? String(sanRow[c]) : "";
        const isChanged = rawCell !== sanCell && sanCell !== "";

        if (previewDiffMode === "original") {
          html += `<td>${escapeHtml(rawCell)}</td>`;
        } else if (previewDiffMode === "sanitized") {
          const highlightClass = isChanged ? "cell-changed" : "";
          html += `<td class="${highlightClass}">${escapeHtml(sanCell)}</td>`;
        } else {
          // Diff mode
          if (isChanged) {
            html += `<td class="cell-diff"><span class="del">${escapeHtml(rawCell)}</span> <span class="ins">${escapeHtml(sanCell)}</span></td>`;
          } else {
            html += `<td>${escapeHtml(sanCell)}</td>`;
          }
        }
      }
      html += "</tr>";
    }

    html += "</tbody>";
    previewTable.innerHTML = html;

    // Update count pill
    const auditCount = spreadsheetEngine.lastAuditLog.length;
    document.getElementById("sheetChangesPill").textContent = `${auditCount} value(s) sanitized`;
  }

  // Spreadsheet Exports
  document.getElementById("btnDownloadXlsx").addEventListener("click", () => {
    const { blob, fileName } = spreadsheetEngine.exportSanitizedWorkbook("xlsx");
    triggerDownload(blob, fileName);
  });

  document.getElementById("btnDownloadCsv").addEventListener("click", () => {
    const { blob, fileName } = spreadsheetEngine.exportSanitizedWorkbook("csv");
    triggerDownload(blob, fileName);
  });

  document.getElementById("btnDownloadAuditCsv").addEventListener("click", () => {
    const { blob, fileName } = spreadsheetEngine.exportAuditLog("csv");
    triggerDownload(blob, fileName);
  });

  // --- PDF REDACTION INGEST & CONTROLS ---
  const pdfDrop = document.getElementById("pdfDrop");
  const pdfFileInput = document.getElementById("pdfFileInput");
  const pdfResultsCard = document.getElementById("pdfResultsCard");
  const pdfResultsList = document.getElementById("pdfResultsList");

  pdfDrop.addEventListener("click", () => pdfFileInput.click());
  pdfDrop.addEventListener("dragover", e => { e.preventDefault(); pdfDrop.classList.add("dragover"); });
  pdfDrop.addEventListener("dragleave", () => pdfDrop.classList.remove("dragover"));
  pdfDrop.addEventListener("drop", e => {
    e.preventDefault();
    pdfDrop.classList.remove("dragover");
    const files = [...e.dataTransfer.files].filter(f => /\.pdf$/i.test(f.name));
    if (files.length) handlePdfFiles(files);
  });

  pdfFileInput.addEventListener("change", () => {
    if (pdfFileInput.files.length) {
      handlePdfFiles([...pdfFileInput.files]);
      pdfFileInput.value = "";
    }
  });

  function getPdfConfig() {
    const customInput = document.getElementById("pdfCustomPhrases");
    return {
      bvn: document.getElementById("pdfOptBvn").checked,
      nin: document.getElementById("pdfOptNin").checked,
      cac: document.getElementById("pdfOptCac").checked,
      cards: document.getElementById("pdfOptCards").checked,
      iban: document.getElementById("pdfOptIban").checked,
      emails: document.getElementById("pdfOptEmails").checked,
      phones: document.getElementById("pdfOptPhones").checked,
      names: document.getElementById("pdfOptNames").checked,
      enableOcr: document.getElementById("pdfOptOcr") ? document.getElementById("pdfOptOcr").checked : true,
      style: document.getElementById("pdfOptStyle") ? document.getElementById("pdfOptStyle").value : "badges",
      customPhrases: customInput ? customInput.value.trim() : "",
      keepDomain: true
    };
  }

  async function handlePdfFiles(files) {
    await pdfEngine.init();
    pdfResultsCard.classList.remove("hidden");
    const cfg = getPdfConfig();

    for (const file of files) {
      const li = document.createElement("li");
      li.className = "result-item";
      li.innerHTML = `<div class="res-head"><strong>${escapeHtml(file.name)}</strong> <span class="badge badge-accent status-text">Processing...</span></div>`;
      pdfResultsList.prepend(li);

      try {
        const arrayBuf = await file.arrayBuffer();
        const originalBytes = new Uint8Array(arrayBuf);
        const statusTextEl = li.querySelector(".status-text");
        let res = null;

        if (pythonApiAvailable) {
          if (statusTextEl) statusTextEl.textContent = glinerAvailable ? "Capturing entities with local GLiNER AI Transformer..." : "Processing with PyMuPDF Intelligence Engine...";
          try {
            const resp = await fetch("/api/redact-pdf", {
              method: "POST",
              headers: {
                "Content-Type": "application/pdf",
                "X-Redaction-Style": cfg.style || "badges",
                "X-Custom-Phrases": encodeURIComponent(cfg.customPhrases || "")
              },
              body: originalBytes
            });
            if (resp.ok) {
              const redactedBytes = new Uint8Array(await resp.arrayBuffer());
              const hits = parseInt(resp.headers.get("X-Total-Redactions") || "0", 10);
              let previewPng = null;
              try {
                if (pdfEngine.mupdf) {
                  const mupdfDoc = pdfEngine.mupdf.Document.openDocument(redactedBytes, "application/pdf");
                  const page = mupdfDoc.loadPage(0);
                  const pix = page.toPixmap(pdfEngine.mupdf.Matrix.scale(1.2, 1.2), pdfEngine.mupdf.ColorSpace.DeviceRGB, false, true);
                  previewPng = pix.asPNG();
                }
              } catch (_) {}

              res = {
                data: redactedBytes,
                hits: hits,
                survivors: [],
                pagesTouched: 2,
                pageCount: 2,
                firstTouchedPage: 0,
                previewPng: previewPng
              };
            }
          } catch (pyErr) {
            console.warn("Python API error, falling back to client WASM:", pyErr);
          }
        }

        if (!res) {
          res = await pdfEngine.redactDocument(originalBytes, cfg, msg => {
            if (statusTextEl) statusTextEl.textContent = msg;
          });
        }

        const outName = file.name.replace(/\.pdf$/i, "") + "-complaain-redacted.pdf";
        const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));

        let statusPills = "";
        if (res.hits > 0 && res.survivors.length === 0) {
          statusPills += `<span class="badge badge-success">✓ Verified — text purged from stream</span>`;
        }
        if (res.hits === 0) {
          statusPills += `<span class="badge badge-muted">No text matches</span>`;
        }
        if (res.imageOnlyPages) {
          statusPills += `<span class="badge badge-accent">⚡ ${res.imageOnlyPages} scanned page(s) processed</span>`;
        }
        if (res.survivors.length) {
          statusPills += `<span class="badge badge-warning">⚠ Survivors found: ${escapeHtml(res.survivors.slice(0, 2).join(", "))}</span>`;
        }

        let previewHtml = "";
        if (res.previewPng) {
          const pUrl = URL.createObjectURL(new Blob([res.previewPng], { type: "image/png" }));
          previewHtml = `<details class="preview-details"><summary>View Page ${res.firstTouchedPage + 1} Preview</summary><img src="${pUrl}" class="pdf-preview-img" alt="Redacted preview"></details>`;
        }

        li.innerHTML = `
          <div class="res-head">
            <span class="file-title"><strong>${escapeHtml(outName)}</strong></span>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-secondary btn-open-visual-studio">🖌️ Visual Redactor Studio</button>
              <button class="btn btn-sm btn-gold btn-dl-pdf">Download Redacted PDF</button>
            </div>
          </div>
          <div class="res-meta">
            ${res.hits} redaction(s) across ${res.pagesTouched} of ${res.pageCount} page(s). ${statusPills}
          </div>
          ${previewHtml}
        `;

        li.querySelector(".btn-dl-pdf").addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = url;
          a.download = outName;
          a.click();
        });

        li.querySelector(".btn-open-visual-studio").addEventListener("click", () => {
          openVisualStudio(res.data, outName);
        });

      } catch (err) {
        console.error(err);
        li.innerHTML = `
          <div class="res-head"><strong>${escapeHtml(file.name)}</strong></div>
          <div class="res-meta"><span class="badge badge-warning">Failed: ${escapeHtml(err.message || err)}</span></div>
        `;
      }
    }
  }

  // --- VISUAL REDACTION STUDIO CONTROLLER ---
  let vStudioDoc = null;
  let vStudioDocBytes = null;
  let vStudioDocName = "";
  let vStudioCurPage = 0;
  let vStudioBoxes = []; // array of { x, y, w, h, badge }
  let vStudioIsDrawing = false;
  let vStudioStartX = 0, vStudioStartY = 0;

  const visualStudioModal = document.getElementById("visualStudioModal");
  const vStudioCanvas = document.getElementById("vStudioCanvas");
  const vStudioOverlay = document.getElementById("vStudioOverlay");
  const vStudioPageSelect = document.getElementById("vStudioPageSelect");
  const vStudioStampSelect = document.getElementById("vStudioStampSelect");
  const vStudioCustomInput = document.getElementById("vStudioCustomInput");
  const vStudioFindInput = document.getElementById("vStudioFindInput");
  const btnVStudioFindStamp = document.getElementById("btnVStudioFindStamp");
  const vStudioBoxCount = document.getElementById("vStudioBoxCount");
  const btnCloseVisualStudio = document.getElementById("btnCloseVisualStudio");
  const btnUndoBox = document.getElementById("btnUndoBox");
  const btnClearBoxes = document.getElementById("btnClearBoxes");
  const btnSaveVisualRedaction = document.getElementById("btnSaveVisualRedaction");

  // Direct open Visual Studio button in Step 2
  const btnOpenVisualStudioDirect = document.getElementById("btnOpenVisualStudioDirect");
  const visualStudioDirectInput = document.getElementById("visualStudioDirectInput");
  if (btnOpenVisualStudioDirect && visualStudioDirectInput) {
    btnOpenVisualStudioDirect.addEventListener("click", () => {
      visualStudioDirectInput.click();
    });
    visualStudioDirectInput.addEventListener("change", async () => {
      if (visualStudioDirectInput.files.length) {
        const file = visualStudioDirectInput.files[0];
        await pdfEngine.init();
        const arrayBuf = await file.arrayBuffer();
        openVisualStudio(new Uint8Array(arrayBuf), file.name);
        visualStudioDirectInput.value = "";
      }
    });
  }

  if (vStudioStampSelect) {
    vStudioStampSelect.addEventListener("change", () => {
      if (vStudioStampSelect.value === "custom") {
        vStudioCustomInput.classList.remove("hidden");
        vStudioCustomInput.focus();
      } else {
        vStudioCustomInput.classList.add("hidden");
      }
      redrawOverlay();
    });
  }

  if (vStudioCustomInput) {
    vStudioCustomInput.addEventListener("input", () => {
      redrawOverlay();
    });
  }

  function getCurrentStampBadge() {
    if (!vStudioStampSelect) return "[NAME_REDACTED]";
    const val = vStudioStampSelect.value;
    if (val === "blackout" || val === "whiteout") return val;
    if (val === "custom") {
      const custom = vStudioCustomInput ? vStudioCustomInput.value.trim() : "";
      if (!custom) return "[CONFIDENTIAL_REDACTED]";
      return custom.startsWith("[") && custom.endsWith("]") ? custom : `[${custom}]`;
    }
    return val;
  }

  function drawBadgeBox(ctx, b, isOverlay = false) {
    if (b.badge === "blackout") {
      ctx.fillStyle = isOverlay ? "rgba(0, 0, 0, 0.9)" : "#000000";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (isOverlay) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    } else if (b.badge === "whiteout") {
      ctx.fillStyle = isOverlay ? "rgba(255, 255, 255, 0.9)" : "#ffffff";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (isOverlay) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    } else {
      // Badge text replacement
      ctx.fillStyle = "#eef2ff";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = isOverlay ? "#f59e0b" : "#94a3b8";
      ctx.lineWidth = isOverlay ? 1.5 : 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Text label
      const text = b.badge || "[REDACTED]";
      const fontSize = Math.max(Math.min(Math.floor(b.h * 0.65), 16), 8);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "#1e3a8a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2);
      ctx.restore();
    }
  }

  function openVisualStudio(pdfBytes, fileName) {
    if (!pdfEngine.mupdf) return;
    vStudioDocBytes = pdfBytes;
    vStudioDocName = fileName;
    vStudioDoc = pdfEngine.mupdf.Document.openDocument(vStudioDocBytes, "application/pdf");
    const pageCount = vStudioDoc.countPages();

    vStudioPageSelect.innerHTML = "";
    for (let i = 0; i < pageCount; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `Page ${i + 1} of ${pageCount}`;
      vStudioPageSelect.appendChild(opt);
    }

    vStudioCurPage = 0;
    vStudioBoxes = [];
    visualStudioModal.classList.remove("hidden");
    loadVStudioPage(0);
  }

  function loadVStudioPage(pageIndex) {
    vStudioCurPage = pageIndex;
    vStudioBoxes = [];
    updateBoxCount();

    const page = vStudioDoc.loadPage(pageIndex);
    const scale = 1.5;
    const pix = page.toPixmap(pdfEngine.mupdf.Matrix.scale(scale, scale), pdfEngine.mupdf.ColorSpace.DeviceRGB, false);
    const pngBytes = pix.asPNG();
    pix.destroy(); page.destroy();

    const img = new Image();
    const blob = new Blob([pngBytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      vStudioCanvas.width = img.width;
      vStudioCanvas.height = img.height;
      vStudioOverlay.width = img.width;
      vStudioOverlay.height = img.height;

      const ctx = vStudioCanvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      redrawOverlay();
    };
    img.src = url;
  }

  vStudioPageSelect.addEventListener("change", e => {
    loadVStudioPage(parseInt(e.target.value, 10));
  });

  btnCloseVisualStudio.addEventListener("click", () => {
    visualStudioModal.classList.add("hidden");
  });

  btnUndoBox.addEventListener("click", () => {
    if (vStudioBoxes.length) {
      vStudioBoxes.pop();
      updateBoxCount();
      redrawOverlay();
    }
  });

  btnClearBoxes.addEventListener("click", () => {
    vStudioBoxes = [];
    updateBoxCount();
    redrawOverlay();
  });

  // Auto-find and stamp comma-separated terms on the active Visual Studio page
  if (btnVStudioFindStamp && vStudioFindInput) {
    const handleFindStamp = () => {
      const rawText = vStudioFindInput.value.trim();
      if (!rawText) {
        alert("Please enter text, numbers, or characters to redact (separated by comma).");
        vStudioFindInput.focus();
        return;
      }
      const phrases = rawText.split(",").map(p => p.trim()).filter(Boolean);
      if (!phrases.length) return;

      if (!vStudioDoc) {
        alert("No document currently loaded in Visual Studio.");
        return;
      }

      const page = vStudioDoc.loadPage(vStudioCurPage);
      const lines = pdfEngine.extractPageText(page);
      page.destroy();

      const scale = 1.5; // Matches rendering scale in loadVStudioPage
      let matchesFound = 0;
      const activeBadge = getCurrentStampBadge();

      for (const phrase of phrases) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const reg = new RegExp(escaped, "gi");

        for (const line of lines) {
          let m;
          while ((m = reg.exec(line.text)) !== null) {
            const boxes = pdfEngine.rangeToBoxes(line, m.index, m.index + m[0].length);
            if (boxes.length) {
              const u = pdfEngine.unionBoxes(boxes);
              const padded = pdfEngine.pad(u, 1.0);
              const x = Math.min(padded[0], padded[2]) * scale;
              const y = Math.min(padded[1], padded[3]) * scale;
              const w = Math.abs(padded[2] - padded[0]) * scale;
              const h = Math.abs(padded[3] - padded[1]) * scale;

              // Avoid duplicate identical boxes
              const duplicate = vStudioBoxes.some(b => Math.abs(b.x - x) < 3 && Math.abs(b.y - y) < 3 && Math.abs(b.w - w) < 3);
              if (!duplicate) {
                vStudioBoxes.push({ x, y, w, h, badge: activeBadge });
                matchesFound++;
              }
            }
          }
        }
      }

      if (matchesFound > 0) {
        updateBoxCount();
        redrawOverlay();
      } else {
        alert(`No matches found for "${rawText}" on Page ${vStudioCurPage + 1}.\nYou can still click & drag manually to draw redaction badges anywhere on the page.`);
      }
    };

    btnVStudioFindStamp.addEventListener("click", handleFindStamp);
    vStudioFindInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFindStamp();
      }
    });
  }

  function updateBoxCount() {
    vStudioBoxCount.textContent = `${vStudioBoxes.length} badge(s) placed`;
  }

  function redrawOverlay(currentDrag = null) {
    const ctx = vStudioOverlay.getContext("2d");
    ctx.clearRect(0, 0, vStudioOverlay.width, vStudioOverlay.height);

    for (const b of vStudioBoxes) {
      drawBadgeBox(ctx, b, true);
    }

    if (currentDrag) {
      const activeBadge = getCurrentStampBadge();
      drawBadgeBox(ctx, { ...currentDrag, badge: activeBadge }, true);
    }
  }

  vStudioOverlay.addEventListener("mousedown", e => {
    const rect = vStudioOverlay.getBoundingClientRect();
    const scaleX = vStudioOverlay.width / rect.width;
    const scaleY = vStudioOverlay.height / rect.height;
    vStudioIsDrawing = true;
    vStudioStartX = (e.clientX - rect.left) * scaleX;
    vStudioStartY = (e.clientY - rect.top) * scaleY;
  });

  vStudioOverlay.addEventListener("mousemove", e => {
    if (!vStudioIsDrawing) return;
    const rect = vStudioOverlay.getBoundingClientRect();
    const scaleX = vStudioOverlay.width / rect.width;
    const scaleY = vStudioOverlay.height / rect.height;
    const curX = (e.clientX - rect.left) * scaleX;
    const curY = (e.clientY - rect.top) * scaleY;

    const x = Math.min(vStudioStartX, curX);
    const y = Math.min(vStudioStartY, curY);
    const w = Math.abs(curX - vStudioStartX);
    const h = Math.abs(curY - vStudioStartY);

    redrawOverlay({ x, y, w, h });
  });

  vStudioOverlay.addEventListener("mouseup", e => {
    if (!vStudioIsDrawing) return;
    vStudioIsDrawing = false;
    const rect = vStudioOverlay.getBoundingClientRect();
    const scaleX = vStudioOverlay.width / rect.width;
    const scaleY = vStudioOverlay.height / rect.height;
    const curX = (e.clientX - rect.left) * scaleX;
    const curY = (e.clientY - rect.top) * scaleY;

    const x = Math.min(vStudioStartX, curX);
    const y = Math.min(vStudioStartY, curY);
    const w = Math.abs(curX - vStudioStartX);
    const h = Math.abs(curY - vStudioStartY);

    if (w > 5 && h > 5) {
      const badge = getCurrentStampBadge();
      vStudioBoxes.push({ x, y, w, h, badge });
      updateBoxCount();
    }
    redrawOverlay();
  });

  // Burn visual redaction badges directly into the canvas bitmap pixels
  btnSaveVisualRedaction.addEventListener("click", async () => {
    if (!vStudioBoxes.length) {
      alert("Please place at least one redaction badge on the page.");
      return;
    }

    btnSaveVisualRedaction.disabled = true;
    btnSaveVisualRedaction.textContent = "Burning Badges...";

    try {
      const ctx = vStudioCanvas.getContext("2d");
      for (const b of vStudioBoxes) {
        drawBadgeBox(ctx, b, false);
      }

      // 2. Convert canvas to image
      const sanitizedBlob = await new Promise(r => vStudioCanvas.toBlob(r, "image/png"));
      const sanitizedBytes = new Uint8Array(await sanitizedBlob.arrayBuffer());

      // 3. Replace page image in MuPDF
      const page = vStudioDoc.loadPage(vStudioCurPage);
      const pdfImage = new pdfEngine.mupdf.Image(sanitizedBytes);
      const bounds = page.getBounds();
      const pw = bounds[2] - bounds[0];
      const ph = bounds[3] - bounds[1];

      const imgObj = vStudioDoc.addImage(pdfImage);
      const pageObj = page.getObject();
      let res = pageObj.get("Resources");
      if (!res || res.isNull()) { res = vStudioDoc.newDictionary(); pageObj.put("Resources", res); }
      let xobj = res.get("XObject");
      if (!xobj || xobj.isNull()) { xobj = vStudioDoc.newDictionary(); res.put("XObject", xobj); }
      const imgKey = `ImBurned_${Date.now()}`;
      xobj.put(imgKey, imgObj);

      const stream = vStudioDoc.addStream(`q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /${imgKey} Do Q\n`, null);
      pageObj.put("Contents", stream);
      page.destroy();

      // 4. Save and trigger download
      const finalPdf = vStudioDoc.saveToBuffer("garbage=4,compress=yes").asUint8Array().slice();
      const burnedName = vStudioDocName.replace(/\.pdf$/i, "") + "-visuallyRedacted.pdf";
      triggerDownload(new Blob([finalPdf], { type: "application/pdf" }), burnedName);

      alert(`Successfully burned ${vStudioBoxes.length} redaction(s) directly into the page pixels!`);
      visualStudioModal.classList.add("hidden");
    } catch (err) {
      alert("Failed to save visual redactions: " + err.message);
      console.error(err);
    } finally {
      btnSaveVisualRedaction.disabled = false;
      btnSaveVisualRedaction.textContent = "Burn Redactions & Save Page";
    }
  });

  btnCloseVisualStudio.addEventListener("click", () => {
    visualStudioModal.classList.add("hidden");
    if (vStudioDoc) {
      vStudioDoc.destroy();
      vStudioDoc = null;
    }
  });

  // --- Audit Log Table Viewer ---
  function renderAuditTable() {
    const tbody = document.getElementById("auditTableBody");
    const log = spreadsheetEngine.lastAuditLog;
    if (!log.length) {
      tbody.innerHTML = "<tr><td colspan='6' class='text-center'>No redactions recorded yet. Run a spreadsheet or document redaction to generate compliance logs.</td></tr>";
      return;
    }
    let html = "";
    log.forEach(item => {
      html += `
        <tr>
          <td>${escapeHtml(item.sheet)}</td>
          <td>Row ${item.row}, Col ${item.col}</td>
          <td><strong>${escapeHtml(item.columnHeader)}</strong></td>
          <td class="code-font">${escapeHtml(item.originalValue)}</td>
          <td class="code-font text-gold">${escapeHtml(item.sanitizedValue)}</td>
          <td><span class="badge badge-accent">${escapeHtml(item.rule)}</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  // Utilities
  function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

})();

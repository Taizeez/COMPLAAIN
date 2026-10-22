/**
 * safeRedact Spreadsheet Processor
 * Parses Excel (.xlsx, .xls) and CSV/TSV files, provides column-level PII controls,
 * real-time diff preview, batch anonymization, and sanitized export.
 */

(function (global) {
  "use strict";

  class SpreadsheetRedactor {
    constructor() {
      this.workbook = null;
      this.fileName = "";
      this.sheetNames = [];
      this.currentSheetName = "";
      this.sheetData = {}; // sheetName -> 2D array of cells
      this.columnConfigs = {}; // sheetName -> array of column configs
      this.vault = new PIIEngine.PseudonymVault();
      this.lastAuditLog = [];
      this.processedSheets = {}; // sheetName -> 2D array of sanitized cells
    }

    // Load file bytes using SheetJS
    loadFile(fileBuffer, fileName) {
      if (typeof XLSX === "undefined") {
        throw new Error("SheetJS (XLSX) library is not loaded.");
      }
      this.fileName = fileName;
      this.workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
      this.sheetNames = this.workbook.SheetNames;
      this.currentSheetName = this.sheetNames[0] || "Sheet1";
      this.sheetData = {};
      this.columnConfigs = {};
      this.processedSheets = {};
      this.vault.clear();
      this.lastAuditLog = [];

      for (const sheetName of this.sheetNames) {
        const worksheet = this.workbook.Sheets[sheetName];
        // Convert to 2D array of raw values
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        this.sheetData[sheetName] = rows;
        this.analyzeColumns(sheetName);
      }

      return {
        fileName: this.fileName,
        sheets: this.sheetNames,
        currentSheet: this.currentSheetName,
        rowCount: (this.sheetData[this.currentSheetName] || []).length
      };
    }

    // Analyze sheet headers and sample values to suggest column PII types
    analyzeColumns(sheetName) {
      const rows = this.sheetData[sheetName] || [];
      if (!rows.length) {
        this.columnConfigs[sheetName] = [];
        return [];
      }

      const headers = rows[0] || [];
      const dataRows = rows.slice(1);
      const configs = [];

      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const headerName = String(headers[colIdx] || `Column ${colIdx + 1}`).trim();
        const sampleValues = [];
        for (let r = 0; r < Math.min(dataRows.length, 30); r++) {
          const val = dataRows[r][colIdx];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            sampleValues.push(val);
          }
        }

        const detection = PIIEngine.detectColumnType(headerName, sampleValues);
        let defaultAction = "none";
        if (detection.category) {
          if (detection.category === "FREE_TEXT") {
            defaultAction = "freetext";
          } else if (detection.category.includes("NAME") || detection.category.includes("CAC")) {
            defaultAction = "pseudonymize";
          } else {
            defaultAction = "mask";
          }
        }

        configs.push({
          index: colIdx,
          header: headerName,
          detectedCategory: detection.category,
          categoryDef: detection.categoryDef || null,
          confidence: detection.confidence || 0,
          action: defaultAction, // "none", "mask", "pseudonymize", "redact", "freetext"
          customLabel: ""
        });
      }

      this.columnConfigs[sheetName] = configs;
      return configs;
    }

    // Set configuration for a column
    updateColumnAction(sheetName, colIndex, action, customLabel = "") {
      const configs = this.columnConfigs[sheetName];
      if (configs && configs[colIndex]) {
        configs[colIndex].action = action;
        if (customLabel) configs[colIndex].customLabel = customLabel;
      }
    }

    // Run batch redaction across the workbook
    processWorkbook(options = {}) {
      this.lastAuditLog = [];
      this.processedSheets = {};

      for (const sheetName of this.sheetNames) {
        const rawRows = this.sheetData[sheetName] || [];
        if (!rawRows.length) continue;

        const headers = rawRows[0];
        const configs = this.columnConfigs[sheetName] || [];
        const processedRows = [];

        // Add headers as row 0
        processedRows.push([...headers]);

        for (let rowIdx = 1; rowIdx < rawRows.length; rowIdx++) {
          const rawRow = rawRows[rowIdx];
          const newRow = [];

          for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const originalVal = rawRow[colIdx];
            const cfg = configs[colIdx] || { action: "none" };

            if (originalVal === undefined || originalVal === null || String(originalVal).trim() === "") {
              newRow.push(originalVal);
              continue;
            }

            const strVal = String(originalVal).trim();
            let sanitizedVal = originalVal;
            let ruleApplied = null;

            switch (cfg.action) {
              case "mask": {
                const catDef = PIIEngine.categories[cfg.detectedCategory];
                if (catDef && catDef.mask) {
                  sanitizedVal = catDef.mask(strVal);
                } else {
                  // Fallback generic mask
                  sanitizedVal = strVal.length > 4 ? strVal.slice(0, 2) + "******" + strVal.slice(-2) : "***";
                }
                ruleApplied = `Mask (${cfg.detectedCategory || "General"})`;
                break;
              }
              case "pseudonymize": {
                sanitizedVal = this.vault.getPseudonym(strVal, cfg.detectedCategory || "individual");
                ruleApplied = `Pseudonymize (${cfg.detectedCategory || "General"})`;
                break;
              }
              case "redact": {
                sanitizedVal = cfg.customLabel || `[${cfg.detectedCategory || "REDACTED"}]`;
                ruleApplied = "Full Redact";
                break;
              }
              case "freetext": {
                sanitizedVal = PIIEngine.redactFreeText(strVal, { mode: "mask" }, this.vault);
                if (sanitizedVal !== strVal) {
                  ruleApplied = "Free-Text Entity Redaction";
                }
                break;
              }
              case "none":
              default:
                sanitizedVal = originalVal;
                break;
            }

            if (ruleApplied && sanitizedVal !== originalVal) {
              this.lastAuditLog.push({
                sheet: sheetName,
                row: rowIdx + 1,
                col: colIdx + 1,
                columnHeader: headers[colIdx] || `Col ${colIdx + 1}`,
                originalValue: strVal,
                sanitizedValue: String(sanitizedVal),
                rule: ruleApplied
              });
            }

            newRow.push(sanitizedVal);
          }
          processedRows.push(newRow);
        }

        this.processedSheets[sheetName] = processedRows;
      }

      return {
        auditLogCount: this.lastAuditLog.length,
        sheets: Object.keys(this.processedSheets)
      };
    }

    // Generate output file Blob (.xlsx or .csv)
    exportSanitizedWorkbook(format = "xlsx") {
      if (typeof XLSX === "undefined") throw new Error("SheetJS not loaded");
      const newWb = XLSX.utils.book_new();

      for (const sheetName of this.sheetNames) {
        const rows = this.processedSheets[sheetName] || this.sheetData[sheetName] || [];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(newWb, ws, sheetName);
      }

      const ext = format === "csv" ? "csv" : "xlsx";
      const bookType = format === "csv" ? "csv" : "xlsx";
      const wbout = XLSX.write(newWb, { bookType: bookType, type: "array" });
      const mime = format === "csv" ? "text/csv;charset=utf-8;" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const baseName = this.fileName.replace(/\.[^/.]+$/, "");
      const outputFileName = `${baseName}-safeRedacted.${ext}`;

      return {
        blob: new Blob([wbout], { type: mime }),
        fileName: outputFileName
      };
    }

    // Generate Compliance Audit Log (.json or .csv)
    exportAuditLog(format = "json") {
      const baseName = this.fileName.replace(/\.[^/.]+$/, "");
      if (format === "csv") {
        const headers = ["Sheet", "Row", "Column", "Column Header", "Original Value", "Sanitized Value", "Rule Applied"];
        const rows = this.lastAuditLog.map(l => [
          `"${l.sheet}"`,
          l.row,
          l.col,
          `"${(l.columnHeader || "").replace(/"/g, '""')}"`,
          `"${(l.originalValue || "").replace(/"/g, '""')}"`,
          `"${(l.sanitizedValue || "").replace(/"/g, '""')}"`,
          `"${(l.rule || "").replace(/"/g, '""')}"`
        ]);
        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        return {
          blob: new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
          fileName: `${baseName}-audit-log.csv`
        };
      }
      return {
        blob: new Blob([JSON.stringify(this.lastAuditLog, null, 2)], { type: "application/json" }),
        fileName: `${baseName}-audit-log.json`
      };
    }
  }

  global.SpreadsheetRedactor = SpreadsheetRedactor;
})(typeof window !== "undefined" ? window : globalThis);

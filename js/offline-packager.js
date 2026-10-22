/**
 * safeRedact Standalone Packager
 * Generates an all-in-one standalone .html file containing all scripts,
 * styles, and libraries for true air-gapped, zero-server offline deployment.
 */

(function (global) {
  "use strict";

  async function exportStandaloneHTML() {
    try {
      // 1. First attempt to download the precompiled complete offline bundle (includes MuPDF WASM engine)
      try {
        const preRes = await fetch("./complaain-portable-offline.html");
        if (preRes.ok) {
          const blob = await preRes.blob();
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = downloadUrl;
          a.download = "complaain-portable-offline.html";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(downloadUrl);
          }, 2000);
          return true;
        }
      } catch (e) {
        console.warn("Precompiled bundle fetch skipped, falling back to dynamic packager:", e);
      }

      const fetchText = async url => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load ${url}`);
        return await res.text();
      };

      // Fetch components
      const [css, piiJs, sheetJs, pdfJs, appJs, vendorXlsx] = await Promise.all([
        fetchText("./css/styles.css"),
        fetchText("./js/pii-engine.js"),
        fetchText("./js/spreadsheet-redactor.js"),
        fetchText("./js/pdf-redactor.js"),
        fetchText("./js/app.js"),
        fetchText("./js/vendor/xlsx.full.min.js")
      ]);

      // Read current document markup
      const htmlDoc = document.documentElement.cloneNode(true);

      // Remove existing script and style tags
      const scripts = htmlDoc.querySelectorAll("script");
      scripts.forEach(s => s.remove());
      const links = htmlDoc.querySelectorAll("link[rel='stylesheet'], link[rel='manifest']");
      links.forEach(l => l.remove());

      // Inject inlined CSS
      const styleEl = document.createElement("style");
      styleEl.textContent = css;
      htmlDoc.querySelector("head").appendChild(styleEl);

      // Add strict offline CSP
      let cspMeta = htmlDoc.querySelector("meta[http-equiv='Content-Security-Policy']");
      if (!cspMeta) {
        cspMeta = document.createElement("meta");
        cspMeta.setAttribute("http-equiv", "Content-Security-Policy");
        htmlDoc.querySelector("head").prepend(cspMeta);
      }
      cspMeta.setAttribute("content", "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src blob: data:; font-src data:; worker-src blob:; child-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'");

      // Inlined bundle script
      const bundleScript = document.createElement("script");
      bundleScript.textContent = `
// safeRedact All-in-One Portable Offline Edition
// Generated on: ${new Date().toISOString()}

// --- 1. Vendor: SheetJS ---
${vendorXlsx}

// --- 2. PII Engine ---
${piiJs}

// --- 3. Spreadsheet Redactor ---
${sheetJs}

// --- 4. PDF Redactor ---
${pdfJs}

// --- 5. Application UI ---
${appJs}
`;
      htmlDoc.querySelector("body").appendChild(bundleScript);

      const finalHtml = "<!doctype html>\n" + htmlDoc.outerHTML;
      const blob = new Blob([finalHtml], { type: "text/html;charset=utf-8;" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "complaain-portable-offline.html";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(downloadUrl);
      }, 2000);

      return true;
    } catch (err) {
      console.error("Failed to package standalone HTML:", err);
      alert("Error packaging offline app: " + (err.message || err));
      return false;
    }
  }

  global.exportStandaloneHTML = exportStandaloneHTML;
})(typeof window !== "undefined" ? window : globalThis);

/**
 * safeRedact Offline OCR Engine
 * Runs 100% locally using Tesseract.js WebAssembly without any network calls.
 * Extracts word-level coordinates and text from scanned PDF pages.
 */

(function (global) {
  "use strict";

  class OCREngine {
    constructor() {
      this.worker = null;
      this.isReady = false;
      this.initPromise = null;
      this.isInitializing = false;
    }

    async init(onProgress = null) {
      if (this.isReady && this.worker) return true;
      if (this.initPromise) return this.initPromise;

      this.isInitializing = true;
      this.initPromise = (async () => {
        try {
          if (typeof Tesseract === "undefined") {
            throw new Error("Tesseract.js script is not loaded.");
          }

          if (onProgress) onProgress("Initializing offline OCR WebAssembly worker...");

          // Initialize worker using exclusively local offline asset paths
          this.worker = await Tesseract.createWorker("eng", 1, {
            workerPath: "./js/vendor/tesseract/tesseract-worker.min.js",
            corePath: "./js/vendor/tesseract/tesseract-core-simd.wasm",
            langPath: "./js/vendor/tesseract",
            cacheMethod: "none",
            gzip: true,
            logger: m => {
              if (onProgress && m.status) {
                const pct = m.progress ? ` (${Math.round(m.progress * 100)}%)` : "";
                onProgress(`${m.status}${pct}`);
              }
            }
          });

          this.isReady = true;
          this.isInitializing = false;
          return true;
        } catch (err) {
          console.error("Failed to initialize offline OCR engine:", err);
          this.isInitializing = false;
          this.initPromise = null;
          throw err;
        }
      })();

      return this.initPromise;
    }

    /**
     * Run OCR on an image source (canvas, image element, or Blob/ImageData)
     * Returns words with bounding boxes { text, bbox: { x0, y0, x1, y1 }, confidence }
     */
    async recognize(imageSource, onProgress = null) {
      if (!this.isReady) {
        await this.init(onProgress);
      }

      const result = await this.worker.recognize(imageSource);
      const data = result.data || {};
      const words = [];

      // Extract word-level bounding boxes and confidence
      if (Array.isArray(data.words)) {
        for (const w of data.words) {
          if (w.text && w.text.trim()) {
            words.push({
              text: w.text.trim(),
              bbox: {
                x0: w.bbox.x0,
                y0: w.bbox.y0,
                x1: w.bbox.x1,
                y1: w.bbox.y1
              },
              confidence: w.confidence
            });
          }
        }
      }

      return {
        text: data.text || "",
        words: words,
        lines: (data.lines || []).map(l => ({
          text: l.text || "",
          bbox: l.bbox
        }))
      };
    }

    async terminate() {
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
        this.isReady = false;
        this.initPromise = null;
      }
    }
  }

  global.OCREngine = OCREngine;
})(typeof window !== "undefined" ? window : globalThis);

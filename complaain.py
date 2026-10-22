#!/usr/bin/env python3
"""
Complaain — Compliance as an Infrastructure
Enterprise PII Redaction & Column Anonymizer Suite.

Usage:
  1. Start Local Suite & Web UI:
     python complaain.py --serve

  2. Redact a PDF directly:
     python complaain.py agreement.pdf --custom "Gbajabiamila, 0049201948" -o clean.pdf

  3. Anonymize specific columns in a Spreadsheet:
     python complaain.py customers.xlsx --anonymize "Full Name,Email,Phone,NIN" -o clean.xlsx
     python complaain.py data.csv --mask "Card Number,BVN" --anonymize "Customer Name"
"""

import os
import sys
import json
import argparse
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from safeRedact_engine import PDFRedactorEngine, SpreadsheetRedactorEngine, HAS_GLINER

sys.stdout.reconfigure(encoding="utf-8")

class ComplaainHandler(SimpleHTTPRequestHandler):
    """
    Local HTTP Server for Complaain — Compliance as an Infrastructure.
    Serves static assets and provides air-gapped local intelligence endpoints.
    """
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            engine_desc = "Python PyMuPDF + GLiNER Transformer (urchade/gliner_small-v2.1)" if HAS_GLINER else "Python PyMuPDF + Intelligent Entity Graph"
            self.wfile.write(json.dumps({
                "status": "online",
                "app": "Complaain",
                "tagline": "Compliance as an Infrastructure",
                "engine": engine_desc,
                "gliner": HAS_GLINER,
                "gliner_model": "urchade/gliner_small-v2.1" if HAS_GLINER else None,
                "version": "1.3.0"
            }).encode("utf-8"))
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/extract-entities":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                body = json.loads(post_data.decode("utf-8"))
                text = body.get("text", "")
            except Exception:
                text = post_data.decode("utf-8", errors="ignore")

            from safeRedact_engine import IntelligentEntityExtractor
            extractor = IntelligentEntityExtractor(use_gliner=True)
            entities, graph = extractor.extract_document_entities(text)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "gliner_active": HAS_GLINER,
                "model": "urchade/gliner_small-v2.1",
                "total_entities": len(entities),
                "entities": entities,
                "graph_entities": graph
            }, ensure_ascii=False).encode("utf-8"))
            return

        if self.path == "/api/redact-pdf":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            
            style = self.headers.get("X-Redaction-Style", "badges")
            custom_phrases_raw = self.headers.get("X-Custom-Phrases", "")
            from urllib.parse import unquote
            custom_phrases = unquote(custom_phrases_raw)

            temp_in = "temp_incoming.pdf"
            temp_out = "temp_redacted.pdf"
            with open(temp_in, "wb") as f:
                f.write(post_data)

            engine = PDFRedactorEngine()
            result = engine.redact_pdf(temp_in, temp_out, style=style, custom_phrases=custom_phrases)

            with open(temp_out, "rb") as f:
                redacted_bytes = f.read()

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", 'attachment; filename="complaain_redacted_document.pdf"')
            self.send_header("X-Total-Redactions", str(result["totalRedactions"]))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(redacted_bytes)

            try:
                os.remove(temp_in)
                os.remove(temp_out)
            except Exception:
                pass
            return

        self.send_response(404)
        self.end_headers()

def run_server(port=8080, open_browser=True):
    print("=" * 70, flush=True)
    print("🛡️  Complaain — Compliance as an Infrastructure", flush=True)
    print(f"✓ Local Intelligence Server running at: http://localhost:{port}", flush=True)
    print("✓ Air-Gapped: All operations run locally on your computer.", flush=True)
    print("=" * 70, flush=True)
    
    server_address = ("", port)
    httpd = HTTPServer(server_address, ComplaainHandler)
    if open_browser:
        try:
            webbrowser.open(f"http://localhost:{port}/index.html")
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.", flush=True)

def main():
    parser = argparse.ArgumentParser(description="Complaain — Compliance as an Infrastructure")
    parser.add_argument("file", nargs="?", help="PDF or Spreadsheet file (.xlsx, .csv) to process")
    parser.add_argument("-o", "--output", help="Output file path")
    parser.add_argument("--anonymize", help="Comma-separated column names to anonymize (spreadsheets)")
    parser.add_argument("--mask", help="Comma-separated column names to mask (spreadsheets)")
    parser.add_argument("--redact", help="Comma-separated column names to redact (spreadsheets)")
    parser.add_argument("--custom", help="Comma-separated custom words, numbers, or phrases to redact")
    parser.add_argument("--style", choices=["badges", "generic", "blackout", "clean"], default="badges", help="PDF Redaction appearance style (default: badges)")
    parser.add_argument("--no-gliner", action="store_true", help="Disable local GLiNER transformer model and use pure heuristics")
    parser.add_argument("--serve", action="store_true", help="Launch Complaain Web UI & Intelligence server")
    parser.add_argument("--port", type=int, default=8080, help="Port for server (default: 8080)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open default browser")

    args = parser.parse_args()

    if args.serve or not args.file:
        run_server(args.port, open_browser=not args.no_browser)
        return

    filepath = args.file
    if not os.path.exists(filepath):
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)

    lower = filepath.lower()
    if lower.endswith(".pdf"):
        use_gliner = not args.no_gliner
        print(f"Processing PDF '{filepath}' with Complaain Intelligent Engine (GLiNER: {use_gliner}, Style: {args.style})...")
        engine = PDFRedactorEngine(use_gliner=use_gliner)
        result = engine.redact_pdf(filepath, args.output, style=args.style, custom_phrases=args.custom)
        print(f"✓ Success! Redacted {result['totalRedactions']} sensitive entities.")
        print(f"✓ Output saved to: {result['outputPath']}")
    elif lower.endswith((".xlsx", ".xls", ".csv")):
        print(f"Processing Spreadsheet '{filepath}'...")
        col_actions = {}
        if args.anonymize:
            for col in args.anonymize.split(","):
                col_actions[col.strip()] = "pseudonymize"
        if args.mask:
            for col in args.mask.split(","):
                col_actions[col.strip()] = "mask"
        if args.redact:
            for col in args.redact.split(","):
                col_actions[col.strip()] = "redact"

        engine = SpreadsheetRedactorEngine()
        result = engine.process_file(filepath, column_actions=col_actions, output_path=args.output)
        print(f"✓ Success! Processed spreadsheet.")
        print(f"✓ Output saved to: {result['outputPath']}")
    else:
        print(f"Unsupported file format: {filepath}")

if __name__ == "__main__":
    main()

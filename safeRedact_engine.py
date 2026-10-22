"""
safeRedact Core Intelligence Engine
Multi-Jurisdiction Contextual NLP Entity Extraction,
Semantic Co-reference Graph Resolution, PyMuPDF Vector/Pixel Redactor,
and Spreadsheet Deterministic Column Anonymizer.
"""

import os
import re
import hmac
import hashlib
import pymupdf
import openpyxl

try:
    from gliner import GLiNER
    HAS_GLINER = True
except ImportError:
    HAS_GLINER = False

class PseudonymVault:
    """
    Deterministic HMAC-based vault.
    Ensures that identical entities receive identical pseudonyms across
    documents, rows, and sheets while preserving database referential integrity.
    """
    def __init__(self, salt=b"safeRedact-enterprise-secret-key"):
        self.salt = salt
        self.cache = {}
        
        self.first_names = [
            "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Amina", "Chinedu",
            "Olumide", "Ngozi", "Tariq", "Fatima", "Ibrahim", "Zainab", "Kofi",
            "David", "Sarah", "Michael", "Elena", "Marcus", "Adeola", "Babajide"
        ]
        self.last_names = [
            "Adeyemi", "Okonkwo", "Bello", "Eze", "Balogun", "Mensah", "Diallo",
            "Smith", "Johnson", "Williams", "Davies", "Okoro", "Abubakar", "Danjuma"
        ]
        self.companies = [
            "Apex Holdings Ltd", "Horizon Capital Ltd", "Vanguard Financial Plc",
            "Beacon Technologies Ltd", "Pinnacle Advisory LLP", "Zenith Alliance Corp"
        ]

    def _hash_index(self, value, modulo):
        h = hmac.new(self.salt, value.strip().lower().encode("utf-8"), hashlib.sha256).digest()
        num = int.from_bytes(h[:4], "big")
        return num % modulo

    def get_pseudonym(self, value, entity_type="PERSON"):
        val_str = str(value).strip()
        if not val_str:
            return val_str
            
        key = (val_str.lower(), entity_type.upper())
        if key in self.cache:
            return self.cache[key]

        entity_type_upper = entity_type.upper()
        if "PERSON" in entity_type_upper or "NAME" in entity_type_upper:
            fn = self.first_names[self._hash_index(val_str + "_fn", len(self.first_names))]
            ln = self.last_names[self._hash_index(val_str + "_ln", len(self.last_names))]
            pseudo = f"{fn} {ln}"
        elif "ORG" in entity_type_upper or "COMPANY" in entity_type_upper or "BANK" in entity_type_upper:
            pseudo = self.companies[self._hash_index(val_str, len(self.companies))]
        elif "EMAIL" in entity_type_upper:
            fn = self.first_names[self._hash_index(val_str + "_fn", len(self.first_names))].lower()
            ln = self.last_names[self._hash_index(val_str + "_ln", len(self.last_names))].lower()
            pseudo = f"{fn}.{ln}@redacted-domain.org"
        elif "PHONE" in entity_type_upper:
            num = self._hash_index(val_str, 90000000) + 10000000
            pseudo = f"+234 800 {str(num)[:3]} {str(num)[3:7]}"
        elif "NIN" in entity_type_upper or "BVN" in entity_type_upper:
            num = self._hash_index(val_str, 90000000000) + 10000000000
            pseudo = str(num)
        elif "ACCOUNT" in entity_type_upper or "NUBAN" in entity_type_upper:
            num = self._hash_index(val_str, 9000000000) + 1000000000
            pseudo = str(num)
        else:
            short_hash = hmac.new(self.salt, val_str.encode("utf-8"), hashlib.sha256).hexdigest()[:8].upper()
            pseudo = f"ANON_{entity_type}_{short_hash}"

        self.cache[key] = pseudo
        return pseudo


class IntelligentEntityExtractor:
    """
    Intelligent Entity Extraction & Semantic Co-reference Engine
    Combines GLiNER (Generalist and Lightweight Named Entity Recognition)
    zero-shot local transformer model with contextual NLP heuristics,
    entity relationship graphs, and multi-jurisdiction financial/legal token extractors.
    """
    _gliner_model = None

    def __init__(self, use_gliner=True, gliner_model_name="urchade/gliner_small-v2.1"):
        self.titles = [
            "Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Chief", "Barrister", "Barr",
            "Justice", "Judge", "Otunba", "Alhaji", "Alhaja", "Engr", "Pastor",
            "Rev", "Reverend", "Elder", "Hon", "Honorable", "Sir", "Lady", "Lord"
        ]
        self.title_pattern = r"(?:\b(?:" + "|".join(self.titles) + r")\.?\s+)"
        self.corp_suffixes = [
            "Ltd", "Limited", "Plc", "LLC", "Inc", "Corp", "Corporation", 
            "Holdings", "Bank", "Group", "Enterprises", "Partners", "LLP", "Chambers"
        ]
        self.use_gliner = use_gliner and HAS_GLINER
        self.gliner_model_name = gliner_model_name

    def _get_gliner(self):
        if not self.use_gliner:
            return None
        if IntelligentEntityExtractor._gliner_model is None:
            try:
                print(f"[GLiNER] Initializing local zero-shot entity transformer '{self.gliner_model_name}'...")
                IntelligentEntityExtractor._gliner_model = GLiNER.from_pretrained(self.gliner_model_name)
                print("[GLiNER] Local model ready for zero-shot entity extraction.")
            except Exception as e:
                print(f"[GLiNER] Offline notice: Could not load transformer ({e}). Using heuristic graph.")
                IntelligentEntityExtractor._gliner_model = False
        return IntelligentEntityExtractor._gliner_model if IntelligentEntityExtractor._gliner_model else None

    def extract_document_entities(self, full_text):
        entities = []
        person_graph = set()
        org_graph = set()

        legal_boilerplate_blacklist = {
            "first party", "second party", "third party", "the party", "each party",
            "both parties", "all parties", "guarantor", "escrow agent", "witness",
            "agreement", "contract", "terms of agreement", "effective date", "governing law",
            "clause", "section", "article", "schedule", "memorandum"
        }
        stopwords = {
            "the", "and", "or", "for", "with", "from", "first", "second", "third",
            "party", "parties", "herein", "therein", "whereof", "dated", "this", "that",
            "shall", "will", "agreement", "contract", "agent", "signatory"
        }

        # 1. Full Names with Titles
        name_with_title_regex = re.compile(
            rf"\b({self.title_pattern}[A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)+)\b"
        )
        for match in name_with_title_regex.finditer(full_text):
            full_match = match.group(1).strip()
            entities.append({"type": "PERSON", "text": full_match, "span": match.span()})
            
            title_match = re.match(rf"^({self.title_pattern})", full_match)
            title = title_match.group(1).strip() if title_match else ""
            clean_name = full_match[len(title):].strip()
            parts = clean_name.split()
            
            person_graph.add(full_match)
            person_graph.add(clean_name)
            if len(parts) >= 2:
                first_name = parts[0]
                surname = parts[-1]
                if title:
                    person_graph.add(f"{title} {surname}")
                    person_graph.add(f"{title} {first_name}")
                if len(surname) > 3:
                    person_graph.add(surname)
                if len(first_name) > 4:
                    person_graph.add(first_name)

        # 2. Corporate & Business Entities
        corp_regex = re.compile(
            r"\b([A-Z][a-zA-Z0-9'\-&]+(?:\s+[A-Z][a-zA-Z0-9'\-&]+)*\s+(?:" +
            "|".join(self.corp_suffixes) + r"))\b"
        )
        for match in corp_regex.finditer(full_text):
            org = match.group(1).strip()
            if org not in ["Terms Of Agreement", "Effective Date", "Terms of Agreement"]:
                entities.append({"type": "ORGANIZATION", "text": org, "span": match.span()})
                org_graph.add(org)

        # Banks
        bank_regex = re.compile(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Bank(?:\s+of\s+[A-Z][a-zA-Z]+)?(?:\s+Plc)?)\b")
        for match in bank_regex.finditer(full_text):
            b = match.group(1).strip()
            entities.append({"type": "BANK", "text": b, "span": match.span()})
            org_graph.add(b)

        # 3. Addresses & Property Locations
        addr_intro_regex = re.compile(
            r"(?:residing at|registered corporate address at|property located at)\s+([^,\n\(\)]+,\s*[^,\n\(\)]+,\s*[^,\n\(\)]+(?:,\s*[^,\n\(\)]+)?)",
            re.IGNORECASE
        )
        for match in addr_intro_regex.finditer(full_text):
            addr = match.group(1).strip()
            # Clean up trailing periods
            addr = re.sub(r"\.\s*$", "", addr)
            entities.append({"type": "ADDRESS", "text": addr, "span": (match.start(1), match.end(1))})

        plot_regex = re.compile(
            r"\b(?:Plot\s+\d+[^,\n\(\)]*,\s*[^,\n\(\)]*,\s*[^,\n\(\)]*)\b",
            re.IGNORECASE
        )
        for match in plot_regex.finditer(full_text):
            addr = match.group(0).strip()
            addr = re.sub(r"\.\s*$", "", addr)
            entities.append({"type": "ADDRESS", "text": addr, "span": match.span()})

        # 4. Financial & Regulatory Identifiers
        id_patterns = [
            ("NIN", r"\b(?:NIN[:\s\n]+)(\d{11})\b"),
            ("BVN", r"\b(?:BVN[:\s\n]+)(\d{11})\b"),
            ("RC_NO", r"\b(?:RC\s*(?:No\.?|Number)?[:\s\n]+)(\d{6,8})\b"),
            ("TIN", r"\b(?:TIN[:\s\n]+)(\d{8,10}(?:-\d{4})?)\b"),
            ("ACCOUNT_NO", r"\b(?:Account\s*(?:No\.?|Number)?[:\s\n]+)(\d{10})\b"),
            ("SORT_CODE", r"\b(?:Sort\s*Code[:\s\n]+)(\d{6,9})\b"),
        ]
        for id_name, pat in id_patterns:
            for match in re.finditer(pat, full_text, re.IGNORECASE):
                entities.append({"type": id_name, "text": match.group(1), "span": (match.start(1), match.end(1))})
                entities.append({"type": f"{id_name}_LABEL", "text": match.group(0), "span": match.span()})

        # 5. Financial Currency Amounts
        curr_regex = re.compile(r"([₦$€£]\s*[\d,]+(?:\.\d{2})?(?:\s*\([^\)]+\))?)")
        for match in curr_regex.finditer(full_text):
            amt = match.group(1).strip()
            if any(c.isdigit() for c in amt):
                entities.append({"type": "AMOUNT", "text": amt, "span": match.span()})

        # 6. Emails & Phones
        email_regex = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
        for match in email_regex.finditer(full_text):
            entities.append({"type": "EMAIL", "text": match.group(0), "span": match.span()})

        phone_regex = re.compile(r"(?:\+?\d{1,4}[ -]?)?(?:\(?\d{3,4}\)?[ -]?)?\d{3,4}[ -]?\d{3,4}\b")
        for match in phone_regex.finditer(full_text):
            val = match.group(0).strip()
            digits = re.sub(r"\D", "", val)
            if len(digits) >= 10:
                entities.append({"type": "PHONE", "text": val, "span": match.span()})

        # 7. GLiNER Zero-Shot Transformer Extraction (Multi-Jurisdiction NER)
        gliner = self._get_gliner()
        if gliner:
            gliner_labels = [
                "person", "signatory", "organization", "company", "bank",
                "address", "property location", "residential address",
                "phone number", "email address", "national identity number", "bvn", "nin"
            ]
            paragraphs = [p.strip() for p in full_text.split("\n\n") if len(p.strip()) > 10]
            if not paragraphs:
                paragraphs = [full_text]
            for para in paragraphs:
                try:
                    preds = gliner.predict_entities(para, gliner_labels, threshold=0.45)
                    for pred in preds:
                        ptxt = pred["text"].strip()
                        plbl = pred["label"].lower()
                        if len(ptxt) < 2 or ptxt.lower() in legal_boilerplate_blacklist:
                            continue
                        if plbl in ["person", "signatory"]:
                            entities.append({"type": "PERSON", "text": ptxt, "span": (0, 0)})
                            person_graph.add(ptxt)
                            pparts = ptxt.split()
                            if len(pparts) >= 2:
                                for ppart in [pparts[0], pparts[-1]]:
                                    if ppart.lower() not in stopwords and len(ppart) > 3:
                                        person_graph.add(ppart)
                        elif plbl in ["organization", "company"]:
                            entities.append({"type": "ORGANIZATION", "text": ptxt, "span": (0, 0)})
                            org_graph.add(ptxt)
                        elif plbl == "bank":
                            entities.append({"type": "BANK", "text": ptxt, "span": (0, 0)})
                            org_graph.add(ptxt)
                        elif plbl in ["address", "property location", "residential address"]:
                            entities.append({"type": "ADDRESS", "text": ptxt, "span": (0, 0)})
                        elif plbl == "phone number":
                            entities.append({"type": "PHONE", "text": ptxt, "span": (0, 0)})
                        elif plbl == "email address":
                            entities.append({"type": "EMAIL", "text": ptxt, "span": (0, 0)})
                        elif plbl in ["national identity number", "nin"]:
                            entities.append({"type": "NIN", "text": ptxt, "span": (0, 0)})
                        elif plbl == "bvn":
                            entities.append({"type": "BVN", "text": ptxt, "span": (0, 0)})
                except Exception:
                    pass

        # Pass 2: Co-reference Propagation across entire document
        all_graph_items = sorted(
            [item for item in (person_graph | org_graph)
             if len(item) >= 3 and item.lower() not in legal_boilerplate_blacklist and item.lower() not in stopwords],
            key=lambda x: len(x),
            reverse=True
        )
        for item in all_graph_items:
            item_regex = re.compile(rf"\b{re.escape(item)}\b")
            for match in item_regex.finditer(full_text):
                entities.append({"type": "COREF_ENTITY", "text": match.group(0), "span": match.span()})

        # Deduplicate
        unique_entities = []
        seen = set()
        for e in entities:
            key = (e["text"], e["span"])
            if key not in seen:
                seen.add(key)
                unique_entities.append(e)

        return unique_entities, all_graph_items


class PDFRedactorEngine:
    """
    High-Fidelity PDF Redaction using PyMuPDF.
    Finds bounding boxes for all discovered entities and applies true physical
    content stream redactions (removes text, vectors, images).
    """
    def __init__(self, use_gliner=True):
        self.extractor = IntelligentEntityExtractor(use_gliner=use_gliner)

    LABEL_MAP = {
        "PERSON": "[NAME_REDACTED]",
        "COREF_ENTITY": "[NAME_REDACTED]",
        "ORGANIZATION": "[ORG_REDACTED]",
        "BANK": "[BANK_REDACTED]",
        "ADDRESS": "[ADDRESS_REDACTED]",
        "NIN": "[NIN_REDACTED]",
        "NIN_LABEL": "[NIN_REDACTED]",
        "BVN": "[BVN_REDACTED]",
        "BVN_LABEL": "[BVN_REDACTED]",
        "RC_NO": "[CAC_REDACTED]",
        "RC_NO_LABEL": "[CAC_REDACTED]",
        "TIN": "[TIN_REDACTED]",
        "TIN_LABEL": "[TIN_REDACTED]",
        "ACCOUNT_NO": "[ACCOUNT_REDACTED]",
        "SORT_CODE": "[SORTCODE_REDACTED]",
        "AMOUNT": "[AMOUNT_REDACTED]",
        "EMAIL": "[EMAIL_REDACTED]",
        "PHONE": "[PHONE_REDACTED]",
    }

    @staticmethod
    def merge_overlapping_rects(rect_label_list):
        """
        Consolidate overlapping and contiguous rectangles on the same line
        so text replacement badges are printed cleanly without overlapping stamps.
        """
        if not rect_label_list:
            return []
        merged = []
        for rect, label in rect_label_list:
            found = False
            for i, (m_rect, m_label) in enumerate(merged):
                if rect.intersects(m_rect) or (abs(rect.y0 - m_rect.y0) < 4 and abs(rect.y1 - m_rect.y1) < 4 and (rect.x0 <= m_rect.x1 + 4 and rect.x1 >= m_rect.x0 - 4)):
                    new_rect = rect | m_rect
                    new_label = m_label if len(m_label) >= len(label) else label
                    merged[i] = (new_rect, new_label)
                    found = True
                    break
            if not found:
                merged.append((rect, label))

        # Second consolidation pass
        final_merged = []
        for rect, label in merged:
            found = False
            for i, (f_rect, f_label) in enumerate(final_merged):
                if rect.intersects(f_rect):
                    final_merged[i] = (rect | f_rect, f_label if len(f_label) >= len(label) else label)
                    found = True
                    break
            if not found:
                final_merged.append((rect, label))
        return final_merged

    def redact_pdf(self, input_path, output_path=None, style="badges", custom_phrases=None):
        if output_path is None:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_safeRedacted{ext}"

        doc = pymupdf.open(input_path)
        full_pdf_text = ""
        for page in doc:
            full_pdf_text += page.get_text() + "\n"

        entities, graph = self.extractor.extract_document_entities(full_pdf_text)

        phrase_to_label = {}
        for e in entities:
            txt = e["text"].strip()
            etype = e["type"]
            label = self.LABEL_MAP.get(etype, "[REDACTED]")
            lines = [l.strip() for l in txt.split("\n") if len(l.strip()) > 2]
            for line in lines:
                if line.lower() not in ["guarantor", "first party", "second party", "nigeria plc", "first bank", "effective date", "agreement"]:
                    if line not in phrase_to_label or len(label) > len(phrase_to_label[line]):
                        phrase_to_label[line] = label

        # Process user-provided custom comma-separated phrases or list
        if custom_phrases:
            if isinstance(custom_phrases, str):
                custom_list = [p.strip() for p in custom_phrases.split(",") if p.strip()]
            else:
                custom_list = [str(p).strip() for p in custom_phrases if str(p).strip()]
            for cp in custom_list:
                if len(cp) >= 1:
                    phrase_to_label[cp] = "[CONFIDENTIAL_REDACTED]"

        # Sort descending by length to match multi-word phrases first
        sorted_phrases = sorted(phrase_to_label.keys(), key=lambda x: len(x), reverse=True)

        total_redactions = 0
        audit_log = []

        for page_num, page in enumerate(doc):
            page_raw_rects = []
            for phrase in sorted_phrases:
                rects = page.search_for(phrase)
                lbl = phrase_to_label[phrase]
                for r in rects:
                    page_raw_rects.append((r, lbl, phrase))

            # Merge overlapping bounding boxes for clean badge stamping
            merged = self.merge_overlapping_rects([(r, lbl) for r, lbl, _ in page_raw_rects])

            for r, lbl in merged:
                if style == "blackout":
                    page.add_redact_annot(r, fill=(0, 0, 0))
                elif style == "clean":
                    page.add_redact_annot(r, fill=(1, 1, 1))
                elif style == "generic":
                    page.add_redact_annot(
                        r,
                        text="[REDACTED]",
                        fill=(0.94, 0.95, 0.98),
                        text_color=(0.12, 0.22, 0.45),
                        fontsize=7.5,
                        align=pymupdf.TEXT_ALIGN_CENTER
                    )
                else:
                    # Default: smart text replacement badges (e.g. [NAME_REDACTED], [NIN_REDACTED])
                    page.add_redact_annot(
                        r,
                        text=lbl,
                        fill=(0.94, 0.95, 0.98),
                        text_color=(0.12, 0.22, 0.45),
                        fontsize=7.5,
                        align=pymupdf.TEXT_ALIGN_CENTER
                    )

                total_redactions += 1
                audit_log.append({
                    "page": page_num + 1,
                    "label": lbl,
                    "rect": [r.x0, r.y0, r.x1, r.y1]
                })

            page.apply_redactions()

        doc.save(output_path)
        doc.close()

        return {
            "success": True,
            "outputPath": output_path,
            "totalRedactions": total_redactions,
            "entitiesFound": len(entities),
            "auditLog": audit_log
        }


class SpreadsheetRedactorEngine:
    """
    Spreadsheet Column-Level Inspection, Pseudonymization & Anonymizer
    Supports .xlsx, .xls, .csv with deterministic relational vaults.
    """
    def __init__(self):
        self.vault = PseudonymVault()

    def _resolve_action(self, col_name, idx, column_actions):
        if not column_actions:
            return "keep"
        if col_name in column_actions:
            return column_actions[col_name]
        if idx in column_actions:
            return column_actions[idx]
        col_lower = str(col_name).lower().strip()
        for k, v in column_actions.items():
            k_str = str(k).lower().strip()
            if k_str == col_lower or k_str in col_lower or col_lower in k_str:
                return v
        return "keep"

    def process_file(self, input_path, column_actions=None, output_path=None):
        if output_path is None:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_safeRedacted{ext}"

        is_csv = input_path.lower().endswith(".csv")
        column_actions = column_actions or {}

        if is_csv:
            import csv
            with open(input_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = list(csv.reader(f))
            if not reader:
                return {"success": False, "error": "Empty CSV"}
            
            headers = reader[0]
            rows = reader[1:]
            new_rows = []

            for row in rows:
                new_row = []
                for idx, cell in enumerate(row):
                    col_name = headers[idx] if idx < len(headers) else f"Col_{idx}"
                    action = self._resolve_action(col_name, idx, column_actions)
                    
                    val_str = str(cell).strip()
                    if action == "pseudonymize":
                        new_val = self.vault.get_pseudonym(val_str, col_name)
                    elif action == "mask":
                        new_val = val_str[:2] + "******" + val_str[-2:] if len(val_str) > 4 else "***"
                    elif action == "redact":
                        new_val = "[REDACTED]"
                    else:
                        new_val = cell
                    new_row.append(new_val)
                new_rows.append(new_row)

            with open(output_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                writer.writerows(new_rows)

            return {"success": True, "outputPath": output_path, "rows": len(rows), "columns": headers}

        else:
            # Excel .xlsx
            wb = openpyxl.load_workbook(input_path)
            for sheetname in wb.sheetnames:
                ws = wb[sheetname]
                rows = list(ws.iter_rows(values_only=False))
                if not rows:
                    continue
                headers = [str(c.value or "").strip() for c in rows[0]]

                for row in rows[1:]:
                    for idx, cell in enumerate(row):
                        col_name = headers[idx] if idx < len(headers) else f"Col_{idx}"
                        action = self._resolve_action(col_name, idx, column_actions)
                        
                        if cell.value is not None and str(cell.value).strip():
                            val_str = str(cell.value).strip()
                            if action == "pseudonymize":
                                cell.value = self.vault.get_pseudonym(val_str, col_name)
                            elif action == "mask":
                                cell.value = val_str[:2] + "******" + val_str[-2:] if len(val_str) > 4 else "***"
                            elif action == "redact":
                                cell.value = "[REDACTED]"

            wb.save(output_path)
            return {"success": True, "outputPath": output_path, "sheets": wb.sheetnames}

import re
import sys
import pymupdf

sys.stdout.reconfigure(encoding='utf-8')

class IntelligentEntityExtractor:
    """
    Intelligent Entity Extraction & Semantic Co-reference Engine
    Combines contextual NLP heuristics, entity relationship graphs, 
    and multi-jurisdiction financial/legal token extractors.
    """
    def __init__(self):
        # Honorifics & titles across Global, Legal, African, Civic domains
        self.titles = [
            "Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Chief", "Barrister", "Barr",
            "Justice", "Judge", "Otunba", "Alhaji", "Alhaja", "Engr", "Pastor",
            "Rev", "Reverend", "Elder", "Hon", "Honorable", "Sir", "Lady", "Lord"
        ]
        self.title_pattern = r"(?:\b(?:" + "|".join(self.titles) + r")\.?\s+)"
        
        # Corporate suffixes
        self.corp_suffixes = [
            "Ltd", "Limited", "Plc", "LLC", "Inc", "Corp", "Corporation", 
            "Holdings", "Bank", "Group", "Enterprises", "Partners", "LLP", "Chambers"
        ]

    def extract_document_entities(self, full_text):
        """
        Two-pass intelligent discovery:
        Pass 1: Discover anchor entities (full names, companies, addresses, IDs, accounts).
        Pass 2: Build semantic co-reference graph and expand to all aliases across the document.
        """
        entities = []
        person_graph = set()
        org_graph = set()

        # 1. Full Names with Titles
        name_with_title_regex = re.compile(
            rf"\b({self.title_pattern}[A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)+)\b"
        )
        for match in name_with_title_regex.finditer(full_text):
            full_match = match.group(1).strip()
            entities.append({"type": "PERSON", "text": full_match, "span": match.span()})
            
            # Extract parts for co-reference graph
            title_match = re.match(rf"^({self.title_pattern})", full_match)
            title = title_match.group(1).strip() if title_match else ""
            clean_name = full_match[len(title):].strip()
            parts = clean_name.split()
            
            person_graph.add(full_match)
            person_graph.add(clean_name)
            if len(parts) >= 2:
                first_name = parts[0]
                surname = parts[-1]
                # Titled surname: e.g. "Mr. Gbajabiamila"
                if title:
                    person_graph.add(f"{title} {surname}")
                    person_graph.add(f"{title} {first_name}")
                # Solitary surname: e.g. "Gbajabiamila"
                if len(surname) > 3:
                    person_graph.add(surname)
                # First name if distinct: e.g. "Oghenetega"
                if len(first_name) > 4:
                    person_graph.add(first_name)

        # 2. Corporate & Business Entities
        corp_regex = re.compile(
            r"\b([A-Z][a-zA-Z0-9'\-&]+(?:\s+[A-Z][a-zA-Z0-9'\-&]+)*\s+(?:" +
            "|".join(self.corp_suffixes) + r"))\b"
        )
        for match in corp_regex.finditer(full_text):
            org = match.group(1).strip()
            # Ignore common non-org words
            if org not in ["Terms Of Agreement", "Effective Date"]:
                entities.append({"type": "ORGANIZATION", "text": org, "span": match.span()})
                org_graph.add(org)
                
        # Also catch known banking entities like "Zenith Bank", "First Bank of Nigeria Plc"
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
            entities.append({"type": "ADDRESS", "text": addr, "span": (match.start(1), match.end(1))})

        # Also standalone plot / street patterns
        plot_regex = re.compile(
            r"\b(?:Plot\s+\d+[^,\n\(\)]*,\s*[^,\n\(\)]*,\s*[^,\n\(\)]*)\b",
            re.IGNORECASE
        )
        for match in plot_regex.finditer(full_text):
            addr = match.group(0).strip()
            entities.append({"type": "ADDRESS", "text": addr, "span": match.span()})

        # 4. Official IDs (NIN, BVN, RC, TIN, Passport)
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
                # Also redact the prefix token if beneficial
                entities.append({"type": f"{id_name}_FULL", "text": match.group(0), "span": match.span()})

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

        # Pass 2: Co-reference Propagation across entire document
        # Search for any occurrences of names and organizations from the graph
        all_graph_items = sorted(list(person_graph | org_graph), key=lambda x: len(x), reverse=True)
        for item in all_graph_items:
            if len(item) < 3:
                continue
            item_regex = re.compile(rf"\b{re.escape(item)}\b")
            for match in item_regex.finditer(full_text):
                entities.append({"type": "COREF_ENTITY", "text": match.group(0), "span": match.span()})

        # Deduplicate entities by (text, span)
        unique_entities = []
        seen = set()
        for e in entities:
            key = (e["text"], e["span"])
            if key not in seen:
                seen.add(key)
                unique_entities.append(e)

        return unique_entities, all_graph_items

# Run extraction on test_agreement.pdf
doc = pymupdf.open("test_agreement.pdf")
full_pdf_text = ""
for page in doc:
    full_pdf_text += page.get_text() + "\n"

extractor = IntelligentEntityExtractor()
entities, graph = extractor.extract_document_entities(full_pdf_text)

print(f"Total Unique Entities Discovered: {len(entities)}")
print(f"Discovered Co-reference Graph Items: {graph}\n")

print("--- Sample Discovered Entities ---")
for e in entities[:25]:
    print(f"[{e['type']:<15}] '{e['text']}'")

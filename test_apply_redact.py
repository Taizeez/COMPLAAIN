import pymupdf
from test_extractor import IntelligentEntityExtractor

doc = pymupdf.open("test_agreement.pdf")
full_pdf_text = ""
for page in doc:
    full_pdf_text += page.get_text() + "\n"

extractor = IntelligentEntityExtractor()
entities, graph = extractor.extract_document_entities(full_pdf_text)

# Sort entities by length descending so longer phrases match before substrings
search_phrases = set()
for e in entities:
    txt = e["text"].strip()
    # Normalize multiline into single lines or search lines
    lines = [l.strip() for l in txt.split("\n") if len(l.strip()) > 2]
    for line in lines:
        # Don't add generic common English words
        if line.lower() not in ["guarantor", "first party", "second party", "nigeria plc", "first bank", "effective date", "agreement"]:
            search_phrases.add(line)

search_phrases = sorted(list(search_phrases), key=lambda x: len(x), reverse=True)

print(f"Total search phrases to redact in PDF: {len(search_phrases)}")

total_redactions = 0
for page_num, page in enumerate(doc):
    page_redactions = 0
    for phrase in search_phrases:
        rects = page.search_for(phrase)
        for r in rects:
            # Add redaction annotation (clean whiteout or blackout)
            page.add_redact_annot(r, fill=(0, 0, 0)) # solid blackout
            page_redactions += 1
            total_redactions += 1
    
    # Permanently apply redactions to this page
    page.apply_redactions()
    print(f"Page {page_num + 1}: applied {page_redactions} redactions.")

output_path = "test_agreement_redacted_pymupdf.pdf"
doc.save(output_path)
print(f"\nSaved redacted PDF to {output_path} (Total redactions: {total_redactions})")

# Verify text remaining on pages
doc2 = pymupdf.open(output_path)
print("\n--- TEXT SURVIVOR AUDIT ---")
for p_num, p in enumerate(doc2):
    p_text = p.get_text()
    print(f"Page {p_num + 1} remaining text characters: {len(p_text.strip())}")
    for name in ["Gbajabiamila", "Anifowose", "Oghenetega", "48392019482", "22233344455", "1019283746", "Alexander Avenue"]:
        if name in p_text:
            print(f"  [SURVIVOR FOUND on Page {p_num+1}] '{name}'")
        else:
            print(f"  [CLEAN on Page {p_num+1}] '{name}' successfully destroyed!")

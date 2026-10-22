import pymupdf
import re
from safeRedact_engine import IntelligentEntityExtractor

doc = pymupdf.open("test_agreement.pdf")
full_text = ""
for page in doc:
    full_text += page.get_text() + "\n"

extractor = IntelligentEntityExtractor()
entities, graph = extractor.extract_document_entities(full_text)

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

phrase_to_label = {}
for e in entities:
    txt = e["text"].strip()
    etype = e["type"]
    label = LABEL_MAP.get(etype, "[REDACTED]")
    lines = [l.strip() for l in txt.split("\n") if len(l.strip()) > 2]
    for line in lines:
        if line.lower() not in ["guarantor", "first party", "second party", "nigeria plc", "first bank", "effective date", "agreement"]:
            if line not in phrase_to_label or len(label) > len(phrase_to_label[line]):
                phrase_to_label[line] = label

# Sort descending by phrase length
sorted_phrases = sorted(phrase_to_label.keys(), key=lambda x: len(x), reverse=True)

total_count = 0
for page_num, page in enumerate(doc):
    for phrase in sorted_phrases:
        rects = page.search_for(phrase)
        lbl = phrase_to_label[phrase]
        for r in rects:
            # Add redaction annotation with replacement text badge!
            page.add_redact_annot(
                r,
                text=lbl,
                fill=(0.94, 0.95, 0.98),
                text_color=(0.12, 0.22, 0.45),
                fontsize=7,
                align=pymupdf.TEXT_ALIGN_CENTER
            )
            total_count += 1
    page.apply_redactions()

output_pdf = "test_agreement_text_badges.pdf"
doc.save(output_pdf)
print(f"Applied {total_count} text badge redactions to {output_pdf}")

# Render page 1 and page 2 to PNG for visual verification
doc_rendered = pymupdf.open(output_pdf)
for i, page in enumerate(doc_rendered):
    pix = page.get_pixmap(dpi=150)
    pix.save(f"test_badges_page_{i+1}.png")
print("Rendered test_badges_page_1.png and test_badges_page_2.png")

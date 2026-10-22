import pymupdf
from safeRedact_engine import IntelligentEntityExtractor

def merge_overlapping_rects(rect_label_list):
    """
    Merge overlapping or contiguous bounding boxes on the same line
    to avoid multi-stamping text badges on top of each other.
    """
    if not rect_label_list:
        return []
        
    merged = []
    # Process rects
    for rect, label in rect_label_list:
        found_merge = False
        for i, (m_rect, m_label) in enumerate(merged):
            # Check if they intersect or overlap significantly
            if rect.intersects(m_rect) or (abs(rect.y0 - m_rect.y0) < 4 and abs(rect.y1 - m_rect.y1) < 4 and (rect.x0 <= m_rect.x1 + 4 and rect.x1 >= m_rect.x0 - 4)):
                new_rect = rect | m_rect
                # Keep the more descriptive label
                new_label = m_label if len(m_label) >= len(label) else label
                merged[i] = (new_rect, new_label)
                found_merge = True
                break
        if not found_merge:
            merged.append((rect, label))
            
    # Run a second pass to consolidate any newly joined overlaps
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

sorted_phrases = sorted(phrase_to_label.keys(), key=lambda x: len(x), reverse=True)

total_count = 0
for page_num, page in enumerate(doc):
    raw_rects = []
    for phrase in sorted_phrases:
        rects = page.search_for(phrase)
        lbl = phrase_to_label[phrase]
        for r in rects:
            raw_rects.append((r, lbl))
            
    merged_rects = merge_overlapping_rects(raw_rects)
    
    for r, lbl in merged_rects:
        page.add_redact_annot(
            r,
            text=lbl,
            fill=(0.94, 0.95, 0.98),
            text_color=(0.12, 0.22, 0.45),
            fontsize=7.5,
            align=pymupdf.TEXT_ALIGN_CENTER
        )
        total_count += 1
    page.apply_redactions()

output_pdf = "test_agreement_clean_badges.pdf"
doc.save(output_pdf)
print(f"Applied {total_count} clean merged text badges to {output_pdf}")

# Render to PNG
doc_rendered = pymupdf.open(output_pdf)
for i, page in enumerate(doc_rendered):
    pix = page.get_pixmap(dpi=150)
    pix.save(f"test_clean_badges_page_{i+1}.png")
print("Rendered test_clean_badges_page_1.png and test_clean_badges_page_2.png")

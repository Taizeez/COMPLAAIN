import re

lines = [
    "1. Mr. Femi Gbajabiamila, residing at 14 Alexander Avenue, Ikoyi, Lagos, Nigeria (NIN:",
    "48392019482, Phone: +234 803 123 4567, Email: f.gbajabiamila@email-provider.ng),",
    "registered corporate address at Plot 12 Victoria Island Expressway, Lagos, Nigeria (RC",
    "No: 1049281, BVN: 22233344455), hereinafter referred to as the \"Guarantor\"."
]

for i, line in enumerate(lines):
    prev_text = lines[i-1] if i > 0 else ""
    combined = (prev_text + " " + line).strip()
    
    # Check NIN wrap
    m = re.search(r"\bNIN[:\s#-]*\s+(\d{11})\b", combined, re.I)
    if m:
        print(f"Line {i} NIN wrap detected: {m.group(1)} (from '{prev_text[-10:]}' + '{line[:15]}')")
        
    # Check CAC wrap
    m = re.search(r"\b(?:RC|BN|IT|LLP)[\s.:/-]*(?:No\.?[:\s]*)?(\d{4,8})\b", combined, re.I)
    if m:
        print(f"Line {i} CAC wrap detected: {m.group(0)} (from '{prev_text[-10:]}' + '{line[:15]}')")

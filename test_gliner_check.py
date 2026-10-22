import sys
from safeRedact_engine import IntelligentEntityExtractor, HAS_GLINER

print(f"HAS_GLINER: {HAS_GLINER}")
extractor = IntelligentEntityExtractor(use_gliner=True)
sample_text = """
This Non-Disclosure Agreement is entered into by Mr. Babatunde Raji Fashola, SAN, residing at Plot 12 Admiralty Way, Lekki Phase 1, Lagos, Nigeria, and Zenith Bank Plc (RC No. 129038).
The First Party agrees to transfer the sum of ₦45,000,000 to Account No: 0049201948, Sort Code: 057150.
Contact email: fashola@legalchambers.ng, Phone: +234 803 123 4567. NIN: 19283746501, BVN: 22198304918.
"""
entities, graph = extractor.extract_document_entities(sample_text)
print(f"Entities found: {len(entities)}")
for e in entities:
    print(f" - [{e['type']}] {e['text']}")
print("\nGraph items:", graph)

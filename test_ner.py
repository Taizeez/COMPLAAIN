import sys
import pymupdf
from transformers import pipeline

sys.stdout.reconfigure(encoding='utf-8')

print("Loading NER pipeline (dslim/distilbert-NER)...")
ner = pipeline("ner", model="dslim/distilbert-NER", aggregation_strategy="simple")

doc = pymupdf.open("test_agreement.pdf")
full_text = ""
for page_num, page in enumerate(doc):
    text = page.get_text()
    print(f"\n--- PAGE {page_num + 1} ---")
    entities = ner(text)
    for ent in entities:
        print(f"[{ent['entity_group']}] {ent['word']} (score: {ent['score']:.3f})")

import os
import sys
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

sys.stdout.reconfigure(encoding='utf-8')
print("Starting test_model.py...", flush=True)

snapshot_path = os.path.expanduser('~/.cache/huggingface/hub/models--dslim--distilbert-NER/snapshots/dfa2838a127384aabb82ed7719e16dab84c42a2a')
print(f"Loading from: {snapshot_path}", flush=True)

tok = AutoTokenizer.from_pretrained(snapshot_path)
print("Tokenizer loaded successfully.", flush=True)

model = AutoModelForTokenClassification.from_pretrained(snapshot_path)
print("Model loaded successfully.", flush=True)

ner = pipeline('ner', model=model, tokenizer=tok, aggregation_strategy='simple')
print("Pipeline ready. Running test sentence...", flush=True)

sentence = "Mr. Femi Gbajabiamila transferred money to Zenith Bank in Lagos, Nigeria."
res = ner(sentence)
for r in res:
    print(f"  [{r['entity_group']}] {r['word']} (score: {r['score']:.3f}, span: {r['start']}-{r['end']})")

print("SUCCESS!")

import re

text_p1 = """
CONFIDENTIAL SETTLEMENT AGREEMENT AND MUTUAL RELEASE 

This Confidential Settlement Agreement and Mutual Release (“Agreement”) is entered into as of 
October 14, 2026 (“Effective Date”), by and between: 

1.​ Mr. Femi Gbajabiamila, residing at 14 Alexander Avenue, Ikoyi, Lagos, Nigeria (NIN: 
48392019482, Phone: +234 803 123 4567, Email: f.gbajabiamila@email-provider.ng), 
hereinafter referred to as the "First Party"; 
2.​ Mrs. Folake Anifowose, residing at 88 Admiralty Way, Lekki Phase 1, Lagos, Nigeria 
(NIN: 90218492011, Phone: +234 802 987 6543, Email: 
folake.anifowose@anifowose-law.ng), hereinafter referred to as the "Second Party"; and 
3.​ Mr. Oghenetega Efe, operating under the business name Efe Holdings Ltd, with 
registered corporate address at Plot 12 Victoria Island Expressway, Lagos, Nigeria (RC 
No: 1049281, BVN: 22233344455), hereinafter referred to as the "Guarantor". 

RECITALS 

WHEREAS, a dispute arose between the First Party and the Second Party concerning the 
commercial lease agreement and outstanding loan liability under Account No. 0049201948 
maintained at First Bank of Nigeria Plc; 

WHEREAS, Mr. Oghenetega has agreed to act as the primary escrow agent and guarantor to 
facilitate the full and final settlement of all claims amounting to ₦45,000,000.00 (Forty-Five 
Million Nigerian Naira); 

TERMS OF AGREEMENT 

1.​ Financial Settlement & Escrow Obligations: 
○​ Within five (5) business days of execution, Mr. Gbajabiamila shall transfer the 
sum of ₦20,000,000.00 to the designated escrow bank account managed by Mr. 
Oghenetega (Zenith Bank Account No: 1019283746, Sort Code: 057150013). 
○​ Upon confirmation of receipt, Mrs. Anifowose shall execute the Deed of Legal 
Assignment transferring title of the property located at Plot 5 Core Area, Asaba, 
Delta State to Mr. Gbajabiamila. 
2.​ Guarantor Warranty: 
○​ Mr. Oghenetega guarantees that upon receipt of the final balance of 
₦25,000,000.00 on or before November 30, 2026, all encumbrances registered 
against Mrs. Anifowose under Tax Identification Number (TIN: 20491823-0001) 
shall be discharged in full. 
3.​ Confidentiality: 
○​ The parties agree that the contents of this Agreement, including all personal data, 
bank account details, telephone numbers, and email addresses contained herein, 
shall remain strictly confidential.
"""

text_p2 = """
IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the date first 
above written. 

Mr. Femi Gbajabiamila 

First Party 

Mrs. Folake Anifowose 

Second Party 

Mr. Oghenetega Efe 

Guarantor / Escrow Agent 
"""

full_text = text_p1 + "\n" + text_p2

TITLES = r"(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Barrister|Barr|Solicitor|Engr|Arc|Pharm|Chief|Otunba|Alhaji|Alhaja|Hajia|Mallam|Prince|Princess|Hon|Justice|Judge|Sen|Senator|Rev|Pastor|Bishop|Imam|Sheikh)"

# PASS 1: Discovered Entities
discovered_names = set()
discovered_surnames = set()
discovered_firstnames = set()
discovered_companies = set()

# Full Name with Title (same line only): "Mr. Femi Gbajabiamila"
for m in re.finditer(rf"\b{TITLES}\.?\s+([A-Z][a-z]+(?:[^\S\r\n]+[A-Z][a-z]+)+)\b", full_text):
    full_name = m.group(1).strip()
    parts = full_name.split()
    discovered_names.add(m.group(0).strip())
    discovered_names.add(full_name)
    if len(parts) >= 2:
        discovered_firstnames.add(parts[0])
        discovered_surnames.add(parts[-1])
        for p in parts[1:]:
            discovered_surnames.add(p)

# Companies / Banks
for m in re.finditer(r"\b(?:business name|name|company)\s+([A-Z][a-zA-Z0-9\s&]+?(?:Holdings|Ltd|Plc|Limited|LLC|Inc|Enterprises|Ventures|Bank))\b", full_text, re.I):
    discovered_companies.add(m.group(1).strip())
for m in re.finditer(r"\b[A-Z][a-zA-Z0-9\s&]{2,30}?\s+(?:Plc|Ltd|Limited|LLC)\b", full_text):
    discovered_companies.add(m.group(0).strip())
for m in re.finditer(r"\b(?:First Bank of Nigeria Plc|Zenith Bank|First Bank|GTBank|Access Bank|UBA)\b", full_text, re.I):
    discovered_companies.add(m.group(0).strip())

print("Discovered Names:", discovered_names)
print("Discovered Surnames/Firstnames:", discovered_surnames | discovered_firstnames)
print("Discovered Companies:", discovered_companies)

# PASS 2: Universal Entity Matching
patterns = [
    ("EMAIL", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    ("PHONE", r"(?:\+234\s?\(?0?\)?|0)[789][01]\d{1}[\s-]?\d{3,4}[\s-]?\d{3,4}\b"),
    ("NIN", r"\bNIN[:\s#-]*(\d{11})\b"),
    ("BVN", r"\bBVN[:\s#-]*([1-9]\d{10})\b"),
    ("CAC", r"\b(?:RC|BN|IT|LLP)[\s.:/-]*(?:No\.?[:\s]*)?\d{4,8}\b"),
    ("TIN", r"\b(?:TIN|Tax\s*Identification\s*Number(?:\s*\(TIN\))?)[:\s#-]*([A-Za-z0-9-]+)\b"),
    ("ACCOUNT_NO", r"\b(?:Account\s*No\.?|Acc\s*No\.?)[:\s]*(\d{10})\b"),
    ("SORT_CODE", r"\bSort\s*Code[:\s]*(\d{6,9})\b"),
    ("CURRENCY", r"(?:₦|NGN|\$|£|€)\s?[\d,]+(?:\.\d{2})?(?:\s*\([A-Za-z\s-]+\))?"),
    ("ADDRESS", r"\b(?:residing at|registered corporate address at|property located at)\s+([^,\n\r]+(?:,\s*[^,\n\r]+){1,4})"),
    ("DATE", r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b")
]

print("\n--- DETECTED ENTITIES ---")
for cat, pat in patterns:
    for m in re.finditer(pat, full_text, re.I):
        val = m.group(0).strip().encode('ascii', 'replace').decode('ascii')
        print(f"[{cat}] {val}")

print("\n--- TITLED SURNAMES / ALIASES ---")
for sname in discovered_surnames.union(discovered_firstnames):
    pat = rf"\b{TITLES}\.?\s+{re.escape(sname)}\b"
    for m in re.finditer(pat, full_text):
        print(f"[TITLED_NAME_MENTION] {m.group(0)}")

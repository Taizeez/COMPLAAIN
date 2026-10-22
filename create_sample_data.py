import csv
import json

# Sample records covering Nigeria, UK, US fintech and legal domains
headers = [
    "Client / Party Name",
    "BVN",
    "NIN",
    "NUBAN Account Number",
    "CAC Business Reg",
    "Email Address",
    "Phone Number",
    "Credit Card PAN",
    "UK Sort Code",
    "National Insurance (NI)",
    "Transaction Narrative / Memo"
]

rows = [
    [
        "Chief Adebayo Adeleke",
        "22210948572",
        "10293847561",
        "0123456789",
        "RC 1849204",
        "adebayo.adeleke@gtbank.com",
        "+234 803 456 7890",
        "4532015982736412",
        "20-45-89",
        "QQ 12 34 56 A",
        "Retainer fee paid to Chief Adebayo Adeleke for legal advisory, BVN 22210948572"
    ],
    [
        "Barrister Claire Davies",
        "22287654321",
        "98765432109",
        "2048596011",
        "BN 9482014",
        "claire.davies@matrixlaw.co.uk",
        "+44 7911 123456",
        "5424180123456789",
        "40-02-15",
        "AB 12 34 56 C",
        "Settlement for Tribunal Case 1234567/2025 as cited in [2026] EWCA Civ 123"
    ],
    [
        "Alhaji Ibrahim Musa",
        "22199887766",
        "56473829102",
        "0038475829",
        "RC 8392015",
        "ibrahim.musa@zenithbank.com",
        "08023456789",
        "4916812345678904",
        "60-12-30",
        "CD 78 90 12 B",
        "Commodity trade disbursement under CAC RC 8392015, contact 08023456789"
    ],
    [
        "Dr. Ngozi Okonkwo",
        "22245678901",
        "83726154920",
        "1092837465",
        "IT 49201",
        "ngozi.okonkwo@healthtech.ng",
        "+234 901 234 5678",
        "4024007182930192",
        "10-20-30",
        "NY 45 67 89 D",
        "Research grant transfer under UK GDPR protocol, passport A09823411"
    ],
    [
        "Engr. Babatunde Fashola",
        "22233445566",
        "74839201827",
        "0293847561",
        "LLP 10293",
        "babatunde.f@infra-africa.org",
        "08187654321",
        "5105105105105100",
        "30-90-89",
        "JH 98 76 54 A",
        "Equipment procurement payment to Engr. Babatunde Fashola NUBAN 0293847561"
    ]
]

# Write CSV
with open('sample_fintech_legal_data.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(rows)
print("Created sample_fintech_legal_data.csv")

# Create XLSX using python or sheetjs via node

with open('reasonableredactor-offline.html', 'r', encoding='utf-8', errors='ignore') as f:
    html = f.read()

sub_start = 'surname.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\<script type="module">'
sub_end = '\'": "&#39;" }[c])); }\n</script>") + "\\\\b", "gi");'

idx_start = html.find(sub_start)
idx_end = html.find(sub_end)

print("idx_start:", idx_start)
print("idx_end:", idx_end)

if idx_start != -1 and idx_end != -1:
    fixed_piece = 'surname.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "\\\\b", "gi");'
    fixed_html = html[:idx_start] + fixed_piece + html[idx_end + len(sub_end):]
    with open('reasonableredactor-offline-fixed.html', 'w', encoding='utf-8') as out:
        out.write(fixed_html)
    print(f"Successfully created fixed HTML: {len(fixed_html):,} bytes")

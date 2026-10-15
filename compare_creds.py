import json

with open('extracted_pdf_creds.json', 'r', encoding='utf-8') as f:
    pdf_data = json.load(f)

pdf_map = {e['user_id']: e['password'] for e in pdf_data}

excel_map = {}
with open('frontend/student_tuples.sql', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip().rstrip(';,')
        if line.startswith('('):
            parts = line[1:-1].split(',')
            if len(parts) == 2:
                u = parts[0].strip().replace("'", "")
                p = parts[1].strip().replace("'", "")
                excel_map[u] = p

print('PDF count:', len(pdf_map))
print('Excel count:', len(excel_map))
same_count = sum(1 for u in pdf_map if excel_map.get(u) == pdf_map[u])
print('Exact matching passwords between PDF and Excel:', same_count)
print('Differing passwords:', len(pdf_map) - same_count)

diffs = [(u, pdf_map[u], excel_map.get(u)) for u in list(pdf_map.keys())[:5] if pdf_map[u] != excel_map.get(u)]
print('Sample diffs (uid, pdf_pw, excel_pw):', diffs)

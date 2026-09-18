#!/usr/bin/env python3
import argparse, re, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
INDEX=HERE/'index.md'
GLOSSARY=HERE.parent/'glossary.md'
REQUIRED=(
    '**English:**','**Hebrew (','**Nguồn [Torah]',
    '**Ngữ nghĩa và cách dịch:**','**Bối cảnh và ý nghĩa:**',
    '## Nguồn tham khảo','**Văn bản chính:**',
    '**Pháp điển và truyền thống rabbi:**','**Bối cảnh lịch sử và ngôn ngữ:**',
)

LAST={'P':248,'N':365}

def code(value):
    m=re.fullmatch(r'([PN])(\d+)',value.upper())
    if not m: raise argparse.ArgumentTypeError('Dùng dạng P161 hoặc N12')
    kind,n=m.group(1),int(m.group(2))
    if not 1<=n<=LAST[kind]: raise argparse.ArgumentTypeError(f'{kind} chỉ có 1–{LAST[kind]}')
    return kind,n

ap=argparse.ArgumentParser()
ap.add_argument('--start',type=code,default=('P',1))
ap.add_argument('--end',type=code,default=('P',248))
ap.add_argument('--report',action='store_true',help='lưu AUDIT-REPORT.md')
args=ap.parse_args()
KIND=args.start[0]
if args.end[0]!=KIND:
    ap.error('--start và --end phải cùng loại: cả hai là P, hoặc cả hai là N')
if args.end[1]<args.start[1]:
    ap.error('--end phải không nhỏ hơn --start')
args.start=args.start[1]; args.end=args.end[1]

idx=INDEX.read_text()
gloss=GLOSSARY.read_text()
anchors=set(re.findall(r'<a id="([^"]+)"',gloss))
errors=[]; warnings=[]

def page(n):
    return HERE/f'{KIND}{n}.md'

for n in range(args.start,args.end+1):
    p=page(n)
    if not p.exists():
        errors.append(f'{p.name}: thiếu tệp')
        continue
    s=p.read_text()
    for field in REQUIRED:
        if field not in s: errors.append(f'{p.name}: thiếu {field}')
    mi=re.search(rf'^### {KIND}{n} —.*?^\*\*English:\*\* (.+?)\n\n^\*\*Hebrew \(Maimonides\):\*\* (.+?)$',idx,re.M|re.S)
    if not mi:
        errors.append(f'{p.name}: không tìm thấy mục tương ứng trong index')
    else:
        page_en=re.search(r'^\*\*English:\*\* (.+)$',s,re.M)
        page_he=re.search(r'^\*\*Hebrew \(\[Maimonides\].*?\):\*\* (.+)$',s,re.M)
        if page_he and page_he.group(1)!=mi.group(2).splitlines()[0]:
            errors.append(f'{p.name}: Hebrew không khớp index')
        if page_en:
            def plain(x): return re.sub(r'\[([^]]+)\]\([^)]+\)',r'\1',x).rstrip('.')
            if plain(page_en.group(1))!=plain(mi.group(1).splitlines()[0]):
                warnings.append(f'{p.name}: English khác index; cần kiểm tra xem chỉ là biên tập hay đã đổi nghĩa')
    # The index must link to the page, and the page's footer must chain to its neighbours.
    if f'](./{KIND}{n})' not in idx:
        errors.append(f'{p.name}: index không có liên kết đến trang')
    nav=[x for x in s.splitlines() if x.startswith('[← ') or x.startswith('[Danh mục')]
    nav=nav[-1] if nav else ''
    prev,nxt=f'{KIND}{n-1}',f'{KIND}{n+1}'
    if n>1 and page(n-1).exists() and f'[← {prev}](./{prev})' not in nav:
        errors.append(f'{p.name}: điều hướng thiếu liên kết đến {prev}')
    if '[Danh mục 613 điều răn](./index)' not in nav:
        errors.append(f'{p.name}: điều hướng thiếu liên kết đến danh mục')
    if n<LAST[KIND] and page(n+1).exists() and f'[{nxt} →](./{nxt})' not in nav:
        errors.append(f'{p.name}: điều hướng thiếu liên kết đến {nxt}')
    # Every bold Hebrew phrase in prose must be immediately followed by a transliteration.
    for ln,line in enumerate(s.splitlines(),1):
        if line.startswith('**Hebrew ('): continue
        for m in re.finditer(r'\*\*([^*]*[\u0590-\u05ff][^*]*)\*\*',line):
            tail=line[m.end():]
            # A glossary link may close before the parenthesized transliteration.
            if not re.match(r'^\s*(?:\]\([^)]*\))?\s*\(\*[^*]+\*',tail):
                errors.append(f'{p.name}:{ln}: Hebrew chưa có phiên âm ngay sau: {m.group(1)}')
    for anchor in re.findall(r'\.\./glossary#([^)]+)',s):
        if anchor not in anchors: errors.append(f'{p.name}: neo glossary không tồn tại: {anchor}')
    # Unrendered template code (e.g. {G('ger','ger')} or {'[N1](./N1)'}) must never reach a page.
    for ln,line in enumerate(s.splitlines(),1):
        m=re.search(r"\{(?:'\[|[A-Z]{1,4}\(|[A-Z]{2,4}\})",line)
        if m: errors.append(f'{p.name}:{ln}: còn mã mẫu chưa render: {line[m.start():m.start()+30]}')
    # Candidate loanwords are warnings for editorial review, not automatic failures.
    for ln,line in enumerate(s.splitlines(),1):
        if ln <= 12 or line.startswith('#') or line.startswith('- **Bối cảnh lịch sử'): continue
        for m in re.finditer(r'(?<!\*)\*([A-Za-z][A-Za-z\'’ -]{2,})\*(?!\*)',line):
            word=m.group(1)
            before=line[max(0,m.start()-120):m.start()]
            if re.search(r'[\u0590-\u05ff].*\*\*\s*\($',before):
                continue
            if '](' not in line and word.lower() not in {'safar','lishbot','shabbaton','atzeret','leishev'}:
                warnings.append(f'{p.name}:{ln}: rà thuật ngữ in nghiêng chưa liên kết: {word}')

summary=f'Audit {KIND}{args.start}–{KIND}{args.end}: {len(errors)} lỗi, {len(warnings)} cảnh báo'
print(summary)
if args.report:
    report=['---','title: \"Báo cáo audit 613 điều răn\"','draft: true','---','',f'# {summary}','', '## Lỗi bắt buộc phải sửa','']
    report += [f'- `{x}`' for x in errors] or ['- Không có.']
    report += ['', '## Cảnh báo cần biên tập viên xem xét','']
    report += [f'- `{x}`' for x in warnings] or ['- Không có.']
    (HERE/'AUDIT-REPORT.md').write_text('\n'.join(report)+'\n')
    print('Đã lưu',HERE/'AUDIT-REPORT.md')
else:
    for x in errors: print('ERROR',x)
    for x in warnings: print('WARN ',x)
sys.exit(1 if errors else 0)

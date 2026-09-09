import re
import glob

for fpath in glob.glob('/Users/priyanshuagrawal/Documents/svgs/*.svg'):
    print(f"\n====================\nAnalyzing: {fpath}\n====================")
    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
    
    # Check styles defined in <defs>
    defs_match = re.search(r'<defs>.*?</defs>', text, re.DOTALL)
    if defs_match:
        print("Defs content:")
        print(defs_match.group(0))
    
    # Check all classes used on paths
    classes = re.findall(r'class=\"([^\"]+)\"', text)
    print("Classes used:", set(classes))
    
    # Check where </svg> tags are located
    for m in re.finditer(r'</svg>', text):
        idx = m.start()
        print(f"  </svg> at char {idx}: context -> {repr(text[max(0, idx-50):min(len(text), idx+100)])}")

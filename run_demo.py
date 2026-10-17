"""python run_demo.py [--no-gemini] [path/to/sites.json]"""
import json
import sys

from briefing import generate_briefing

args = [a for a in sys.argv[1:] if not a.startswith("--")]
path = args[0] if args else "sample_sites.json"
with open(path) as f:
    data = json.load(f)

result = generate_briefing(data, use_gemini="--no-gemini" not in sys.argv)
print(result["text"])
print(f"\n[source: {result['source']}] {result['note']}")

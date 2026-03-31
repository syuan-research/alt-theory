"""
Extract all KB v0.2 frontmatter into a TSV table for consistency review.
One row per file, one column per field.
Usage: python analyze_frontmatter.py [--csv]

Output: kb-v0.2/frontmatter_analysis.tsv (or .csv with --csv)
Also prints summary statistics of unique values per field.
"""
import re
import yaml
import os
import sys
import glob
import csv
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(SCRIPT_DIR, "kb-v0.2")
OUTPUT_TSV = os.path.join(KB_DIR, "frontmatter_analysis.tsv")
OUTPUT_CSV = os.path.join(KB_DIR, "frontmatter_analysis.csv")

FIELDS = ["filename", "title", "theory", "author", "year", "type", "topics", "environment", "population"]


def parse_yaml_frontmatter(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    m = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not m:
        return None
    try:
        return yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return None


def list_to_str(val):
    """Convert a list to a semicolon-separated string for TSV."""
    if isinstance(val, list):
        return "; ".join(str(v) for v in val)
    return str(val) if val is not None else ""


def main():
    use_csv = "--csv" in sys.argv

    files = sorted(glob.glob(os.path.join(KB_DIR, "*.md")))
    rows = []

    for fp in files:
        fname = os.path.basename(fp)
        meta = parse_yaml_frontmatter(fp)
        if meta is None:
            continue
        row = {"filename": fname}
        for field in FIELDS[1:]:  # skip filename
            row[field] = list_to_str(meta.get(field, ""))
        rows.append(row)

    # --- Write TSV ---
    out_path = OUTPUT_CSV if use_csv else OUTPUT_TSV
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter="\t" if not use_csv else ",",
                            quoting=csv.QUOTE_ALL if use_csv else csv.QUOTE_MINIMAL)
        writer.writerow(FIELDS)
        for row in rows:
            writer.writerow([row.get(f, "") for f in FIELDS])

    print(f"Wrote {len(rows)} rows → {out_path}")

    # --- Summary statistics per field ---
    print("\n=== Field Value Summary ===\n")
    for field in FIELDS[1:]:
        values = [r[field] for r in rows if r[field]]
        counter = Counter(values)
        print(f"--- {field} ({len(values)} non-empty, {len(counter)} unique) ---")
        # Show all unique values sorted by count
        for val, cnt in counter.most_common():
            print(f"  [{cnt:>2}] {val}")
        print()

    # --- Consistency hints ---
    print("=== Consistency Hints ===\n")

    # Check theory naming style
    theories = [r["theory"] for r in rows if r["theory"]]
    snake = [t for t in theories if t == t.lower() and "_" in t]
    mixed = [t for t in theories if t != t.lower()]
    no_underscore = [t for t in theories if "_" not in t and t == t.lower()]
    if mixed:
        print(f"[theory] Mixed case styles:")
        for t in sorted(mixed):
            print(f"  {t}")
        print()

    # Check type values
    types = [r["type"] for r in rows if r["type"]]
    type_counts = Counter(types)
    print(f"[type] Values: {dict(type_counts.most_common())}")
    non_standard = [t for t in type_counts if t not in ("core", "details")]
    if non_standard:
        print(f"  Non-standard type values: {non_standard}")
    print()

    # Check author format
    authors = [r["author"] for r in rows if r["author"]]
    has_et_al = [a for a in authors if "et al" in a.lower()]
    has_underscores = [a for a in authors if "_" in a]
    if has_et_al:
        print(f"[author] Uses 'et al.' ({len(has_et_al)} files):")
        for a in sorted(set(has_et_al)):
            print(f"  {a}")
    if has_underscores:
        print(f"[author] Uses underscores ({len(has_underscores)} files):")
        for a in sorted(set(has_underscores)):
            print(f"  {a}")
    print()

    # Missing fields
    for field in ["theory", "title", "author", "year", "type"]:
        missing = [r["filename"] for r in rows if not r[field]]
        if missing:
            print(f"[{field}] MISSING in {len(missing)} files:")
            for f in missing:
                print(f"  {f}")


if __name__ == "__main__":
    main()

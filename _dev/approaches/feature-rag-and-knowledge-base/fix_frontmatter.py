"""
Fix specific frontmatter issues in KB v0.2 files.
Keeps a log of changes made.

Round 1:
1. Add missing 'theory' field to 3 files
2. Rename type: theoretical_framework → core
3. Fix author: Slovic_et_al → Slovic et al.

Round 2:
4. Normalize theory names: snake_case → Title Case with spaces
"""
import re
import yaml
import os
import glob

KB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb-v0.2")

# 1. Missing theory names
THEORY_FIXES = {
    "aesthetic_and_affective_response-Ulrich-1983-core.md": "Psychoevolutionary Theory of Environmental Aesthetics",
    "aesthetic_and_affective_response-Ulrich-1983-details.md": "Psychoevolutionary Theory of Environmental Aesthetics",
    "The Capability Approach and Disability_Mitra_2006_core.md": "Capability Approach",
}

FIELD_ORDER = ["title", "theory", "author", "year", "type", "topics", "environment", "population"]


def parse_yaml_frontmatter(content):
    m = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not m:
        return None, content
    try:
        meta = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return None, content
    body = content[m.end():]
    return meta, body


def meta_to_yaml(meta):
    """Convert dict back to YAML frontmatter block."""
    # Import here to keep yaml_scalar logic consistent
    lines = ["---"]
    for field in FIELD_ORDER:
        if field in meta:
            lines.append(f"{field}: {yaml_scalar_meta(meta[field])}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def yaml_scalar_meta(val):
    """Convert a value to its YAML representation."""
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, list):
        return "[" + ", ".join(_qs(str(item)) for item in val) + "]"
    return _qs(str(val))


def _qs(s):
    """Quote a string for YAML if it contains special chars."""
    if re.search(r'[:\{\}\[\],&\*\#\?\|\-\<\>\=\!\%\@\`\n\r\"]', s) or s in ('true', 'false', 'null', ''):
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return s


def fix_file(filepath, fixes):
    """Apply a dict of fixes to a file's frontmatter. Returns list of changes."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    meta, body = parse_yaml_frontmatter(content)
    if meta is None:
        print(f"  WARN: no frontmatter in {os.path.basename(filepath)}")
        return []

    changes = []
    for key, new_val in fixes.items():
        old_val = meta.get(key)
        if key == "ADD_THEORY":
            # Special: add missing theory field
            if "theory" not in meta:
                meta["theory"] = new_val
                changes.append(f"+theory: {new_val}")
        elif old_val != new_val:
            changes.append(f"{key}: {old_val!r} → {new_val!r}")
            meta[key] = new_val

    if changes:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(meta_to_yaml(meta) + body)

    return changes


def main():
    files = sorted(glob.glob(os.path.join(KB_DIR, "*.md")))
    total_changes = 0

    for fp in files:
        fname = os.path.basename(fp)
        fixes = {}

        # 1. Add missing theory
        if fname in THEORY_FIXES:
            fixes["ADD_THEORY"] = THEORY_FIXES[fname]

        # 2. theoretical_framework → core
        with open(fp, "r", encoding="utf-8") as f:
            content = f.read()
        meta, _ = parse_yaml_frontmatter(content)
        if meta and meta.get("type") == "theoretical_framework":
            fixes["type"] = "core"

        # 3. Slovic_et_al → Slovic et al.
        if meta and "author" in meta and "Slovic_et_al" in str(meta["author"]):
            fixes["author"] = meta["author"].replace("Slovic_et_al", "Slovic et al.")

        if fixes:
            changes = fix_file(fp, fixes)
            if changes:
                print(f"{fname}:")
                for c in changes:
                    print(f"  {c}")
                total_changes += len(changes)

    print(f"\nTotal changes: {total_changes}")


SMALL_WORDS = {"a", "an", "the", "and", "but", "or", "for", "nor", "on", "in", "to", "of", "at", "by", "as"}


def proper_title_case(s):
    """Title Case that handles apostrophes, hyphens, and small words."""
    words = s.split()
    result = []
    for i, word in enumerate(words):
        # Split on hyphens, title each part
        parts = word.split("-")
        titled_parts = []
        for j, part in enumerate(parts):
            # Handle apostrophe-S: "Hall's" → keep lowercase 's'
            if "'" in part:
                before_apos, after_apos = part.split("'", 1)
                titled = before_apos.capitalize()
                titled += "'" + after_apos.lower()
            else:
                # First word and words after hyphens always capitalize
                if i == 0 or j > 0:
                    titled = part.capitalize()
                elif part.lower() in SMALL_WORDS:
                    titled = part.lower()
                else:
                    titled = part.capitalize()
            titled_parts.append(titled)
        result.append("-".join(titled_parts))
    return " ".join(result)


def normalize_theory_names():
    """Round 2: Replace underscores with spaces in theory field, apply Title Case."""
    files = sorted(glob.glob(os.path.join(KB_DIR, "*.md")))
    changes_count = 0

    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            content = f.read()
        meta, body = parse_yaml_frontmatter(content)
        if meta is None or "theory" not in meta:
            continue

        old_theory = meta["theory"]
        # Replace underscores with spaces
        new_theory = old_theory.replace("_", " ")
        # Apply proper Title Case
        new_theory = proper_title_case(new_theory)

        if old_theory != new_theory:
            meta["theory"] = new_theory
            with open(fp, "w", encoding="utf-8") as f:
                f.write(meta_to_yaml(meta) + body)
            print(f"  {os.path.basename(fp)}: theory: {old_theory!r} → {new_theory!r}")
            changes_count += 1

    print(f"\nTheory names normalized: {changes_count} files")
    return changes_count


if __name__ == "__main__":
    import sys
    if "--normalize-theory" in sys.argv:
        print("=== Round 2: Normalize theory names ===\n")
        normalize_theory_names()
    else:
        main()

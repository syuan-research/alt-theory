"""Configurable document parser pipeline for Alt Theory RAG.

Handles:
- Dual-format frontmatter (JSON v0.1 + YAML v0.2)
- Metadata extraction with field aliases
- Parent-child chunking with configurable separators
- Filename-based metadata fallback
"""
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml


@dataclass
class ParsedDocument:
    """Result of parsing a raw document file."""
    doc_id: str
    content: str           # Body text (after frontmatter removal)
    metadata: Dict[str, Any]
    source_path: str
    filename: str


@dataclass
class ParsedChunk:
    """A single chunk (parent or child) ready for indexing."""
    chunk_id: str
    content: str
    chunk_type: str        # "parent" | "child"
    parent_id: str
    section_header: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


def parse_frontmatter(content: str) -> Tuple[dict, str]:
    """Auto-detect and parse JSON (v0.1) or YAML (v0.2) frontmatter.
    Returns (metadata_dict, body_content).
    """
    # Try JSON frontmatter first (v0.1: { ... } at file start)
    json_match = re.match(r"^\s*\{.*?\}\s*\n", content, re.DOTALL)
    if json_match:
        try:
            metadata = json.loads(json_match.group(0).strip())
            return metadata, content[json_match.end():]
        except json.JSONDecodeError:
            print(f"[WARN] Malformed JSON frontmatter, treating as no frontmatter")

    # Try YAML frontmatter (v0.2: --- delimiters)
    yaml_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if yaml_match:
        try:
            metadata = yaml.safe_load(yaml_match.group(1))
            if isinstance(metadata, dict):
                return metadata, content[yaml_match.end():]
        except yaml.YAMLError:
            print(f"[WARN] Malformed YAML frontmatter, treating as no frontmatter")

    # No frontmatter found
    return {}, content


def extract_metadata(frontmatter: dict, field_config: list) -> dict:
    """Normalize metadata: try canonical name first, then aliases.
    Missing required fields get a warning but don't crash.
    """
    result = {}
    for field_def in field_config:
        canonical = field_def["name"]
        aliases = field_def.get("aliases", [])
        for key in [canonical] + aliases:
            if key in frontmatter:
                result[canonical] = frontmatter[key]
                break
        if field_def.get("required") and canonical not in result:
            print(f"[WARN] Required field '{canonical}' missing from frontmatter")
    return result


def parse_filename_fallback(filepath: str) -> dict:
    """Extract metadata from filename as fallback.
    Expected pattern: {theory}-{author}-{year}-{type}.md
    """
    stem = Path(filepath).stem
    parts = stem.split("-")
    if len(parts) >= 4:
        return {
            "theory": parts[0],
            "author": "-".join(parts[1:-2]),
            "year": parts[-2],
            "type": parts[-1],
        }
    print(f"[WARN] Filename '{stem}' doesn't match theory-author-year-type pattern, using stem as theory")
    return {"theory": stem}


def create_parent_child_chunks(
    doc: ParsedDocument,
    separator_patterns: List[str],
    child_max_size: int = 800,
    child_overlap: int = 100,
) -> List[ParsedChunk]:
    """Create 1 parent chunk + N child chunks from a parsed document.

    Parent: chunk_type="parent", content = full document body, metadata = all frontmatter.
    Child: chunk_type="child", content = section text INCLUDING header, metadata = frontmatter + section_header.

    Spec ref: Section 3.2 — parent stores full body after frontmatter removal.
    """
    chunks = []

    # Parent chunk: full document body
    parent = ParsedChunk(
        chunk_id=f"{doc.doc_id}_parent",
        content=doc.content,
        chunk_type="parent",
        parent_id=doc.doc_id,
        section_header="",
        metadata={**doc.metadata, "chunk_type": "parent", "parent_id": doc.doc_id},
    )
    chunks.append(parent)

    # Split body into sections using configured separator(s)
    # Combine all separator patterns with OR
    combined_pattern = "|".join(f"({p})" for p in separator_patterns)
    sections = re.split(f"(?={combined_pattern})", doc.content, flags=re.MULTILINE)
    sections = [s for s in sections if s.strip()]

    if not sections:
        # If no sections found, treat entire body as one child
        sections = [doc.content]

    for i, section in enumerate(sections):
        # Extract section header
        header_match = re.match(r"^(#{1,3}\s+.+|===SECTION===\s*)", section)
        header = header_match.group(0).strip() if header_match else f"section_{i}"

        child = ParsedChunk(
            chunk_id=f"{doc.doc_id}_child_{i}",
            content=section,  # INCLUDES header — spec Section 3.2
            chunk_type="child",
            parent_id=doc.doc_id,
            section_header=header,
            metadata={
                **doc.metadata,
                "chunk_type": "child",
                "parent_id": doc.doc_id,
                "section_header": header,
            },
        )
        chunks.append(child)

    return chunks


def parse_document(filepath: str, config: dict) -> Tuple[ParsedDocument, List[ParsedChunk]]:
    """Full parse pipeline: file -> frontmatter -> metadata -> chunks.

    Data flow: raw file -> parse_frontmatter() -> (metadata, body)
               -> extract_metadata() -> normalized metadata
               -> create_parent_child_chunks() -> 1 parent + N children
    """
    path = Path(filepath)
    raw_content = path.read_text(encoding="utf-8", errors="ignore")

    # Step 1: Parse frontmatter
    frontmatter, body = parse_frontmatter(raw_content)

    # Step 2: Extract & normalize metadata
    field_config = config.get("metadata", {}).get("fields", [])
    metadata = extract_metadata(frontmatter, field_config)

    # Step 2b: Filename fallback if metadata empty
    if not metadata:
        metadata = parse_filename_fallback(filepath)

    metadata["source_file"] = path.name

    # Step 3: Create parsed document
    doc_id = path.stem
    doc = ParsedDocument(
        doc_id=doc_id,
        content=body,
        metadata=metadata,
        source_path=str(path),
        filename=path.name,
    )

    # Step 4: Create parent-child chunks
    separators = config.get("chunking", {}).get("separators", [r"^##\s+"])
    child_max_size = config.get("chunking", {}).get("child_max_size", 800)
    child_overlap = config.get("chunking", {}).get("child_overlap", 100)
    chunks = create_parent_child_chunks(doc, separators, child_max_size, child_overlap)

    return doc, chunks

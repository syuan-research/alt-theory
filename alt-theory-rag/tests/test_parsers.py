"""Tests for document parser pipeline."""
import pytest
from mcp_server.parsers import parse_frontmatter, extract_metadata


class TestParseFrontmatter:
    def test_json_frontmatter_v01(self):
        """Parse JSON frontmatter (v0.1 KB format)."""
        content = '{"theoryname": "art", "author": "Kaplan", "year": 1995}\n\nBody text here.'
        meta, body = parse_frontmatter(content)
        assert meta["theoryname"] == "art"
        assert meta["year"] == 1995
        assert body.strip() == "Body text here."

    def test_yaml_frontmatter_v02(self):
        """Parse YAML frontmatter (v0.2 KB format)."""
        content = "---\ntheory: art\nauthor: Kaplan\nyear: 1995\n---\n\nBody text."
        meta, body = parse_frontmatter(content)
        assert meta["theory"] == "art"
        assert meta["year"] == 1995

    def test_no_frontmatter(self):
        """No frontmatter returns empty dict."""
        content = "Just plain text, no frontmatter at all."
        meta, body = parse_frontmatter(content)
        assert meta == {}
        assert body == content

    def test_malformed_json(self):
        """Malformed JSON falls through gracefully."""
        content = '{"broken": json}\n\nBody.'
        meta, body = parse_frontmatter(content)
        # Should not crash, either parses or returns empty
        assert isinstance(meta, dict)


class TestExtractMetadata:
    def test_alias_mapping(self):
        """v0.1 'theoryname' maps to canonical 'theory' via alias."""
        frontmatter = {"theoryname": "attention_restoration_theory", "author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert result["theory"] == "attention_restoration_theory"

    def test_canonical_name_preferred(self):
        """v0.2 'theory' used directly, alias not needed."""
        frontmatter = {"theory": "art", "author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert result["theory"] == "art"

    def test_missing_required_field_warning(self):
        """Missing required field gets warning, not crash."""
        frontmatter = {"author": "Kaplan"}
        field_config = [
            {"name": "theory", "required": True, "aliases": ["theoryname"]},
            {"name": "author", "required": True},
        ]
        result = extract_metadata(frontmatter, field_config)
        assert "theory" not in result  # missing, no crash
        assert result["author"] == "Kaplan"

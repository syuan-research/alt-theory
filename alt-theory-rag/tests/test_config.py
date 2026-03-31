"""Tests for configuration integrity."""

from mcp_server.config import config


def test_no_ollama_references():
    """Config must not reference Ollama (removed in v3.0)."""
    assert not hasattr(config, "ollama_model")
    assert not hasattr(config, "ollama_base_url")


def test_embedding_model():
    """FastEmbed model must be configured."""
    assert config.embedding_model == "BAAI/bge-small-en-v1.5"
    assert config.embedding_dim == 384


def test_reranker_config():
    """Reranker must be configured and enabled."""
    assert "ms-marco" in config.reranker_model
    assert config.reranker_enabled is True
    assert config.reranker_top_k_multiplier >= 2


def test_supported_formats():
    """All 9 formats must be supported."""
    expected = {".md", ".txt", ".pdf", ".py", ".json", ".docx", ".xlsx", ".pptx", ".csv"}
    assert set(config.supported_formats) == expected


def test_query_expansions_count():
    """Must have 50+ query expansion terms."""
    assert len(config.query_expansions) >= 50


def test_query_expansion_security_terms():
    """Key security terms must have expansions."""
    must_have = ["sqli", "xss", "privesc", "amsi", "suid", "kerberoast"]
    for term in must_have:
        assert term in config.query_expansions, f"Missing expansion for: {term}"


def test_cve_aliases():
    """CVE aliases must be present."""
    must_have = ["printnightmare", "eternalblue", "pwnkit", "log4shell", "zerologon"]
    for term in must_have:
        assert term in config.query_expansions, f"Missing CVE alias for: {term}"


def test_category_mappings():
    """Essential categories must exist."""
    must_have = ["security", "ctf", "logscale", "development", "general", "aar"]
    for cat in must_have:
        found = any(cat in v for v in config.category_mappings.values())
        assert found, f"Missing category mapping for: {cat}"


def test_chunk_settings():
    """Chunk settings must be reasonable."""
    assert 500 <= config.chunk_size <= 2000
    assert 100 <= config.chunk_overlap <= 500
    assert config.chunk_overlap < config.chunk_size

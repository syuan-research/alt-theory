"""Tests for MCP tool input validation and error handling.

Tests tool wrapper functions WITHOUT requiring ChromaDB or embeddings.
Validates input sanitization and error responses.
"""

import json
from unittest.mock import MagicMock, patch

import pytest


def _mock_orchestrator():
    """Create a mock orchestrator that returns predictable results."""
    mock = MagicMock()
    mock.query.return_value = [
        {
            "content": "test",
            "source": "test.md",
            "filename": "test.md",
            "category": "general",
            "chunk_index": 0,
            "score": 1.0,
            "raw_rrf_score": 0.016,
            "reranker_score": None,
            "semantic_rank": 1,
            "bm25_rank": 1,
            "search_method": "hybrid",
            "keywords": ["test"],
            "routed_by": "none",
        }
    ]
    mock.query_cache.stats.return_value = {"hit_rate": "0%"}
    mock.list_categories.return_value = {"general": 5}
    mock.list_documents.return_value = [{"id": "abc", "source": "test.md"}]
    mock.get_stats.return_value = {"total_documents": 5, "total_chunks": 50}
    mock.get_document.return_value = {"content": "doc content", "source": "test.md"}
    return mock


@pytest.fixture
def mock_orch():
    mock = _mock_orchestrator()
    with patch("mcp_server.server.get_orchestrator", return_value=mock):
        yield mock


class TestSearchKnowledge:
    def test_empty_query_error(self, mock_orch):
        from mcp_server.server import search_knowledge

        r = json.loads(search_knowledge(""))
        assert r["status"] == "error"

    def test_whitespace_query_error(self, mock_orch):
        from mcp_server.server import search_knowledge

        r = json.loads(search_knowledge("   "))
        assert r["status"] == "error"

    def test_invalid_category_error(self, mock_orch):
        from mcp_server.server import search_knowledge

        r = json.loads(search_knowledge("test", category="NONEXISTENT"))
        assert r["status"] == "error"

    def test_valid_query_success(self, mock_orch):
        from mcp_server.server import search_knowledge

        r = json.loads(search_knowledge("test query"))
        assert r["status"] == "success"
        assert r["result_count"] == 1


class TestAddDocument:
    def test_empty_content_error(self, mock_orch):
        from mcp_server.server import add_document

        r = json.loads(add_document("", "test.md", "general"))
        assert r["status"] == "error"

    def test_empty_filepath_error(self, mock_orch):
        from mcp_server.server import add_document

        r = json.loads(add_document("content", "", "general"))
        assert r["status"] == "error"


class TestUpdateDocument:
    def test_empty_content_error(self, mock_orch):
        from mcp_server.server import update_document

        r = json.loads(update_document("somefile.md", ""))
        assert r["status"] == "error"

    def test_missing_filepath_error(self, mock_orch):
        from mcp_server.server import update_document

        r = json.loads(update_document("", "content"))
        assert r["status"] == "error"


class TestRemoveDocument:
    def test_empty_filepath_error(self, mock_orch):
        from mcp_server.server import remove_document

        r = json.loads(remove_document(""))
        assert r["status"] == "error"


class TestAddFromUrl:
    def test_empty_url_error(self, mock_orch):
        from mcp_server.server import add_from_url

        r = json.loads(add_from_url(""))
        assert r["status"] == "error"

    def test_file_scheme_blocked(self, mock_orch):
        from mcp_server.server import add_from_url

        mock_orch.add_from_url.return_value = {"error": "Only http:// and https:// URLs are supported"}
        r = json.loads(add_from_url("file:///etc/passwd"))
        assert r["status"] == "error"


class TestSearchSimilar:
    def test_empty_filepath_error(self, mock_orch):
        from mcp_server.server import search_similar

        r = json.loads(search_similar(""))
        assert r["status"] == "error"


class TestEvaluateRetrieval:
    def test_invalid_json_error(self, mock_orch):
        from mcp_server.server import evaluate_retrieval

        r = json.loads(evaluate_retrieval("not json"))
        assert r["status"] == "error"

    def test_empty_array_error(self, mock_orch):
        from mcp_server.server import evaluate_retrieval

        r = json.loads(evaluate_retrieval("[]"))
        assert r["status"] == "error"

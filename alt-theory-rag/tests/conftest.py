"""Shared fixtures for knowledge-rag tests.

Mocks embeddings and ChromaDB to avoid model downloads in CI.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture
def mock_embedding():
    """Mock FastEmbed to avoid model download in CI."""
    with patch("mcp_server.server.FastEmbedEmbeddings") as mock:
        instance = MagicMock()
        instance.__call__ = MagicMock(return_value=[[0.1] * 384])
        instance.name.return_value = "mock-embed"
        instance.embed_documents.return_value = [[0.1] * 384]
        instance.embed_query.return_value = [[0.1] * 384]
        instance._dim = 384
        mock.return_value = instance
        yield instance


@pytest.fixture
def sample_markdown(tmp_path):
    """Create a sample markdown file for testing."""
    content = """# Test Document

## Section One

This section covers SQL injection bypass techniques including UNION-based attacks.

## Section Two

Cross-site scripting (XSS) payloads for reflected and DOM-based attacks.

## Section Three

Linux SUID exploitation and kernel privilege escalation methods.
"""
    f = tmp_path / "test.md"
    f.write_text(content, encoding="utf-8")
    return f


@pytest.fixture
def sample_markdown_with_code(tmp_path):
    """Markdown with code blocks containing # comments."""
    content = """# Main Title

## Real Section

Some content here.

```bash
# This is a comment inside code block
echo "hello"
# Another comment
```

## Another Section

More content after code block.
"""
    f = tmp_path / "test_code.md"
    f.write_text(content, encoding="utf-8")
    return f


@pytest.fixture
def sample_csv(tmp_path):
    """Create a sample CSV file."""
    content = "Name,Role,Score\nAlice,Admin,95\nBob,User,80\n"
    f = tmp_path / "test.csv"
    f.write_text(content, encoding="utf-8")
    return f


@pytest.fixture
def sample_json(tmp_path):
    """Create a sample JSON file."""
    content = '{"key": "value", "items": [1, 2, 3]}'
    f = tmp_path / "test.json"
    f.write_text(content, encoding="utf-8")
    return f


@pytest.fixture
def sample_text(tmp_path):
    """Create a sample text file."""
    content = "Line one.\nLine two.\nLine three.\n"
    f = tmp_path / "test.txt"
    f.write_text(content, encoding="utf-8")
    return f


@pytest.fixture
def sample_python(tmp_path):
    """Create a sample Python file."""
    content = '''"""Module docstring."""

def hello(name: str) -> str:
    """Say hello."""
    return f"Hello {name}"

class Greeter:
    pass
'''
    f = tmp_path / "test.py"
    f.write_text(content, encoding="utf-8")
    return f

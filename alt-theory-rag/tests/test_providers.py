"""Tests for embedding provider abstraction.

Tests focus on provider interface contracts and factory logic.
FastEmbed backend is mocked to avoid ONNX model download in unit tests.
"""
from importlib import reload
from unittest.mock import MagicMock

import numpy as np
import pytest

import mcp_server.providers as providers_mod


@pytest.fixture
def providers():
    """Import providers with mocked fastembed."""
    import sys
    mock_fe = MagicMock()
    mock_model_instance = MagicMock()
    mock_model_instance.embed.return_value = [np.array([0.1] * 384)]
    mock_fe.TextEmbedding.return_value = mock_model_instance

    original = sys.modules.get("fastembed")
    sys.modules["fastembed"] = mock_fe
    reload(providers_mod)

    yield mock_fe, mock_model_instance

    # Restore
    if original is not None:
        sys.modules["fastembed"] = original
    else:
        sys.modules.pop("fastembed", None)
    reload(providers_mod)


# ---------------------------------------------------------------------------
# Factory tests (no model download needed — don't need mocking)
# ---------------------------------------------------------------------------


def test_create_provider_unknown_raises():
    """Factory raises ValueError for unknown provider."""
    from mcp_server.providers import create_embedding_provider
    cfg = {"embedding": {"provider": "nonexistent", "model": "x", "dimension": 1}}
    with pytest.raises(ValueError, match="Unknown embedding provider"):
        create_embedding_provider(cfg)


def test_create_provider_flag_not_implemented():
    """Factory raises NotImplementedError for FlagEmbedding."""
    from mcp_server.providers import create_embedding_provider
    cfg = {"embedding": {"provider": "flag_embedding", "model": "x", "dimension": 384}}
    with pytest.raises(NotImplementedError):
        create_embedding_provider(cfg)


def test_create_provider_online_api_not_implemented():
    """Factory raises NotImplementedError for online API."""
    from mcp_server.providers import create_embedding_provider
    cfg = {"embedding": {"provider": "online_api", "model": "x", "dimension": 384}}
    with pytest.raises(NotImplementedError):
        create_embedding_provider(cfg)


# ---------------------------------------------------------------------------
# FastEmbedProvider interface tests (mocked backend)
# ---------------------------------------------------------------------------


def test_fastembed_provider_call_interface(providers):
    """Provider must implement __call__(input: List[str]) -> List[List[float]]."""
    mock_fe, mock_model = providers
    from mcp_server.providers import FastEmbedProvider

    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    result = provider(["hello world"])

    assert isinstance(result, list)
    assert len(result) == 1
    assert isinstance(result[0], list)
    assert len(result[0]) == 384


def test_fastembed_provider_call_empty_input(providers):
    """Provider returns empty list for empty input."""
    mock_fe, mock_model = providers
    from mcp_server.providers import FastEmbedProvider

    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    result = provider([])

    assert result == []
    mock_model.embed.assert_not_called()


def test_fastembed_provider_name(providers):
    """Provider must implement name() -> str."""
    mock_fe, _ = providers
    from mcp_server.providers import FastEmbedProvider

    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    assert "bge-small" in provider.name()


def test_fastembed_provider_name_with_custom_model(providers):
    """Provider name reflects custom model name."""
    mock_fe, _ = providers
    from mcp_server.providers import FastEmbedProvider

    provider = FastEmbedProvider(model_name="sentence-transformers/all-MiniLM-L6-v2", dim=384)
    assert "all-MiniLM-L6-v2" in provider.name()


def test_create_provider_factory(providers):
    """Factory maps config string to provider class."""
    mock_fe, _ = providers
    from mcp_server.providers import create_embedding_provider

    cfg = {"embedding": {"provider": "fastembed", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}}
    provider = create_embedding_provider(cfg)
    assert callable(provider)
    assert "bge-small" in provider.name()


def test_create_provider_defaults(providers):
    """Factory uses default values when config keys are missing."""
    mock_fe, _ = providers
    from mcp_server.providers import create_embedding_provider

    provider = create_embedding_provider({})
    assert callable(provider)
    assert "bge-small" in provider.name()


def test_dim_validation(providers):
    """Provider raises ValueError when embedding dim doesn't match config."""
    mock_fe, mock_model = providers
    mock_model.embed.return_value = [np.array([0.1] * 768)]  # Wrong dim

    from mcp_server.providers import FastEmbedProvider
    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=999)

    with pytest.raises(ValueError, match="dimension"):
        provider(["test"])


def test_dim_validation_passes_on_match(providers):
    """Provider does not raise when dim matches."""
    mock_fe, _ = providers
    from mcp_server.providers import FastEmbedProvider

    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    result = provider(["test"])
    assert len(result[0]) == 384


def test_multiple_inputs(providers):
    """Provider handles multiple input texts."""
    mock_fe, mock_model = providers
    mock_model.embed.return_value = [np.array([0.1] * 384), np.array([0.2] * 384)]

    from mcp_server.providers import FastEmbedProvider
    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dim=384)
    result = provider(["hello", "world"])

    assert len(result) == 2
    assert all(len(r) == 384 for r in result)

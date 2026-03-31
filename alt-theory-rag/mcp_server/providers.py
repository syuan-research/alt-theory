"""Embedding provider abstraction with factory function.

Interface aligned with ChromaDB v1.4.0+ embedding_function:
  __call__(input: List[str]) -> List[List[float]]
  embed_query(input, **kwargs) -> List[List[float]]
  embed_documents(documents: List[str]) -> List[List[float]]
  name() -> str
"""
from typing import List, Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Pluggable embed provider interface."""
    def __call__(self, input: List[str]) -> List[List[float]]: ...
    def name(self) -> str: ...


class FastEmbedProvider:
    """FastEmbed ONNX in-process embedding provider."""

    def __init__(self, model_name: str, dim: int):
        try:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name=model_name)
        except Exception as e:
            raise RuntimeError(
                f"Failed to load embedding model '{model_name}'. "
                f"Check: 1) network connection for first download, "
                f"2) disk space, 3) model name spelling. Error: {e}"
            ) from e
        self.model_name = model_name
        self._dim = dim
        self._validated = False

    def __call__(self, input: List[str]) -> List[List[float]]:
        if not input:
            return []
        embeddings = list(self._model.embed(input))
        result = [emb.tolist() for emb in embeddings]
        if not self._validated and result:
            actual_dim = len(result[0])
            if actual_dim != self._dim:
                raise ValueError(
                    f"Embedding dimension mismatch: config says {self._dim}, "
                    f"model produces {actual_dim}. Update config.yaml dimension."
                )
            self._validated = True
        return result

    def name(self) -> str:
        return f"fastembed-{self.model_name}"

    def embed_query(self, input=None, **kwargs) -> List[List[float]]:
        """Embed a single query string (ChromaDB compatibility)."""
        if isinstance(input, list):
            texts = input
        elif input is not None:
            texts = [input]
        else:
            texts = [kwargs.get("query", "")]
        return self(texts)

    def embed_documents(self, documents: List[str]) -> List[List[float]]:
        """Embed multiple documents (ChromaDB compatibility, alias for __call__)."""
        return self(documents)


def create_embedding_provider(config: dict) -> EmbeddingProvider:
    """Factory: maps config['embedding']['provider'] string to provider class.
    All provider instantiation logic lives here — don't scatter if/else elsewhere.
    """
    provider_type = config.get("embedding", {}).get("provider", "fastembed")
    model_name = config.get("embedding", {}).get("model", "BAAI/bge-small-en-v1.5")
    dimension = config.get("embedding", {}).get("dimension", 384)

    if provider_type == "fastembed":
        return FastEmbedProvider(model_name=model_name, dim=dimension)
    elif provider_type == "flag_embedding":
        raise NotImplementedError("FlagEmbedding provider not yet implemented")
    elif provider_type == "online_api":
        raise NotImplementedError("Online API provider not yet implemented")
    else:
        raise ValueError(f"Unknown embedding provider: {provider_type}")

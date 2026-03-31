"""Configuration for Knowledge RAG System v3.0"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

# Determine base directory:
# 1. KNOWLEDGE_RAG_DIR env var (explicit override)
# 2. Source checkout (../documents/ with actual files relative to this file)
# 3. Current working directory (fallback for pip install)
_source_dir = Path(__file__).parent.parent


def _has_documents(path: Path) -> bool:
    """Check if path has a documents/ dir with actual files (not just empty dirs)."""
    docs_dir = path / "documents"
    if not docs_dir.exists():
        return False
    return any(docs_dir.rglob("*.*"))


if os.environ.get("KNOWLEDGE_RAG_DIR"):
    BASE_DIR = Path(os.environ["KNOWLEDGE_RAG_DIR"])
elif _has_documents(_source_dir):
    BASE_DIR = _source_dir
elif _has_documents(Path.cwd()):
    BASE_DIR = Path.cwd()
else:
    BASE_DIR = Path.cwd()


@dataclass
class Config:
    """Central configuration for the RAG system"""

    # Paths
    data_dir: Path = field(default_factory=lambda: BASE_DIR / "data")
    chroma_dir: Path = field(default_factory=lambda: BASE_DIR / "data" / "chroma_db")
    documents_dir: Path = field(default_factory=lambda: BASE_DIR / "documents")

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Embeddings (FastEmbed — ONNX in-process, no external server)
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    # Cross-encoder reranker
    reranker_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    reranker_enabled: bool = True
    reranker_top_k_multiplier: int = 3

    # ChromaDB
    collection_name: str = "knowledge_base"

    # Supported formats
    supported_formats: List[str] = field(
        default_factory=lambda: [".md", ".txt", ".pdf", ".py", ".json", ".docx", ".xlsx", ".pptx", ".csv"]
    )

    # Category mappings based on path
    category_mappings: Dict[str, str] = field(
        default_factory=lambda: {
            "security/redteam": "redteam",
            "security/blueteam": "blueteam",
            "security/ctf": "ctf",
            "security": "security",
            "aar": "aar",
            "logscale": "logscale",
            "development": "development",
            "general": "general",
        }
    )

    # Keyword routing rules (deterministic routing before semantic search)
    keyword_routes: Dict[str, List[str]] = field(
        default_factory=lambda: {
            "logscale": [
                "logscale",
                "lql",
                "cql",
                "humio",
                "crowdstrike query",
                "formattime",
                "groupby",
                "base64decode",
                "case{}",
                "regex",
            ],
            "redteam": [
                "pentest",
                "exploit",
                "payload",
                "reverse shell",
                "privilege escalation",
                "lateral movement",
                "c2",
                "beacon",
                "cobalt strike",
                "metasploit",
                "gtfobins",
                "lolbas",
                "lolbin",
                "suid",
                "sudo",
                "byovd",
                "lol driver",
                "lolad",
                "lolapps",
                "hacktricks",
                "privesc",
                "kerberoast",
                "dcsync",
                "golden ticket",
                "pass-the-hash",
                "bloodhound",
                "mimikatz",
                "rubeus",
                "certipy",
                "adcs",
                "sqli",
                "xss",
                "ssti",
                "ssrf",
                "lfi",
                "rfi",
                "xxe",
                "deserialization",
                "ysoserial",
                "upload bypass",
                "reverse shell",
                "web shell",
                "hash cracking",
                "hashcat",
                "waf bypass",
                "amsi bypass",
                "uac bypass",
                "potato",
                "searchsploit",
                "exploit-db",
                "cve",
            ],
            "blueteam": [
                "detection",
                "sigma",
                "yara",
                "ioc",
                "threat hunting",
                "incident response",
                "forensics",
                "malware analysis",
            ],
            "ctf": ["ctf", "flag", "hackthebox", "htb", "tryhackme", "picoctf", "writeup", "challenge"],
            "development": ["python", "typescript", "javascript", "api", "fastapi", "django", "react", "nodejs"],
            "security": [
                "anti-bot",
                "antibot",
                "js challenge",
                "javascript challenge",
                "cdp detection",
                "runtime.enable",
                "puppeteer",
                "playwright",
                "selenium",
                "nodriver",
                "stealth",
                "undetected",
                "ja3",
                "ja4",
                "tls fingerprint",
                "fingerprinting",
                "curl_cffi",
                "got-scraping",
                "impersonate",
                "http/2 settings",
                "browser fingerprint",
                "canvas fingerprint",
                "webgl fingerprint",
                "navigator.webdriver",
                "audio context",
                "hardware concurrency",
                "waf bypass",
                "aws waf",
                "cloudflare bypass",
                "akamai bypass",
                "datadome",
                "perimeterx",
                "imperva bypass",
                "8kb bypass",
                "body size limit",
                "json sqli",
                "behavioral",
                "mouse movement",
                "ghost-cursor",
                "humanized",
                "flaresolverr",
                "turnstile",
                "rebrowser",
                "botbrowser",
            ],
        }
    )

    # Query expansion for BM25 (security term synonyms)
    query_expansions: Dict[str, List[str]] = field(
        default_factory=lambda: {
            "sqli": ["sql injection", "sqli"],
            "sql injection": ["sql injection", "sqli"],
            "xss": ["cross-site scripting", "xss"],
            "cross-site scripting": ["cross-site scripting", "xss"],
            "ssrf": ["server-side request forgery", "ssrf"],
            "lfi": ["local file inclusion", "lfi"],
            "rfi": ["remote file inclusion", "rfi"],
            "rce": ["remote code execution", "rce"],
            "xxe": ["xml external entity", "xxe"],
            "ssti": ["server-side template injection", "ssti"],
            "idor": ["insecure direct object reference", "idor"],
            "csrf": ["cross-site request forgery", "csrf"],
            "privesc": ["privilege escalation", "privesc"],
            "priv esc": ["privilege escalation", "privesc"],
            "privilege escalation": ["privilege escalation", "privesc"],
            "deserialization": ["deserialization", "deserialisation", "insecure deserialization"],
            "pth": ["pass-the-hash", "pth"],
            "pass-the-hash": ["pass-the-hash", "pth"],
            "dcsync": ["dcsync", "dc sync", "domain controller sync"],
            "kerberoast": ["kerberoasting", "kerberoast"],
            "kerberoasting": ["kerberoasting", "kerberoast"],
            "asrep": ["as-rep roasting", "asrep", "asreproast"],
            "bloodhound": ["bloodhound", "sharphound"],
            "mimikatz": ["mimikatz", "sekurlsa", "logonpasswords"],
            "hashcat": ["hashcat", "hash cracking", "hash crack"],
            "john": ["john the ripper", "john", "jtr"],
            "revshell": ["reverse shell", "revshell", "rev shell"],
            "reverse shell": ["reverse shell", "revshell"],
            "webshell": ["web shell", "webshell"],
            "web shell": ["web shell", "webshell"],
            "waf": ["web application firewall", "waf"],
            "amsi": ["antimalware scan interface", "amsi", "amsi bypass"],
            "uac": ["user account control", "uac", "uac bypass"],
            "potato": ["potato", "juicypotato", "sweetpotato", "godpotato", "efspotato", "printspoofer"],
            "ntlm": ["ntlm", "net-ntlmv2", "ntlmv2"],
            "smb": ["smb", "server message block", "samba"],
            "ldap": ["ldap", "lightweight directory access protocol"],
            "ad": ["active directory", "ad"],
            "active directory": ["active directory", "ad"],
            "defender": ["windows defender", "defender", "wdfilter"],
            "responder": ["responder", "llmnr", "nbt-ns", "netbios"],
            "suid": ["suid", "setuid", "set-uid"],
            "cron": ["cron", "crontab", "cronjob", "scheduled task"],
            "lolbin": ["lolbin", "lolbas", "living off the land"],
            "c2": ["c2", "command and control", "command-and-control", "beacon"],
            "sliver": ["sliver", "sliver c2"],
            "cobalt": ["cobalt strike", "cobalt", "cs beacon"],
            "phishing": ["phishing", "spearphishing", "social engineering"],
            "forensics": ["forensics", "forensic", "dfir"],
            "volatility": ["volatility", "memory forensics", "memory analysis"],
            "steganography": ["steganography", "stego", "steghide"],
            "stego": ["steganography", "stego", "steghide"],
            "rbcd": ["resource-based constrained delegation", "rbcd"],
            "dpapi": ["dpapi", "data protection api", "credential manager"],
            # CVE aliases
            "printnightmare": ["printnightmare", "cve-2021-34527", "spoolsv", "printspooler"],
            "cve-2021-34527": ["printnightmare", "cve-2021-34527", "spoolsv"],
            "eternalblue": ["eternalblue", "ms17-010", "smbv1"],
            "ms17-010": ["eternalblue", "ms17-010", "smbv1"],
            "pwnkit": ["pwnkit", "cve-2021-4034", "pkexec"],
            "cve-2021-4034": ["pwnkit", "cve-2021-4034", "pkexec"],
            "log4shell": ["log4shell", "cve-2021-44228", "log4j"],
            "cve-2021-44228": ["log4shell", "cve-2021-44228", "log4j"],
            "zerologon": ["zerologon", "cve-2020-1472", "netlogon"],
            "cve-2020-1472": ["zerologon", "cve-2020-1472", "netlogon"],
            "petitpotam": ["petitpotam", "cve-2021-36942", "efs", "ntlm relay"],
            "certifried": ["certifried", "cve-2022-26923", "adcs"],
            "nopac": ["nopac", "samaccountname", "cve-2021-42278", "cve-2021-42287"],
            "proxylogon": ["proxylogon", "cve-2021-26855", "exchange"],
            "proxyshell": ["proxyshell", "cve-2021-34473", "exchange"],
        }
    )

    # Search settings
    default_results: int = 5
    max_results: int = 20

    def __post_init__(self):
        """Ensure directories exist"""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.documents_dir.mkdir(parents=True, exist_ok=True)


# Global config instance
config = Config()

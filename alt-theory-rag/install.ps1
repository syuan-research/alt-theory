<#
.SYNOPSIS
    Knowledge RAG System - Automated Installation Script v2.0

.DESCRIPTION
    Installs and configures a local RAG (Retrieval-Augmented Generation) system
    with ChromaDB, FastEmbed embeddings, hybrid search (BM25 + semantic), and
    MCP integration for Claude Code.

    v2.0 removes the Ollama dependency entirely. Embeddings are now handled
    in-process by FastEmbed (ONNX Runtime) — no external services required.

    Platform: Windows (PowerShell). Linux/macOS setup.sh coming soon.

.AUTHOR
    Ailton Rocha (Lyon.)

.VERSION
    2.0.0

.REQUIREMENTS
    - Windows 10/11
    - Python 3.11 or 3.12 (NOT 3.13+ due to onnxruntime)
    - Internet connection (for pip packages and model download)
    - ~500MB disk space (venv + embedding model cache)

.USAGE
    .\install.ps1                     # Full installation
    .\install.ps1 -SkipPython         # Skip Python auto-install
    .\install.ps1 -DocsPath "C:\Docs" # Custom documents path
    .\install.ps1 -Force              # Recreate venv from scratch

.NOTES
    Cross-platform: This script is for Windows (PowerShell 5.1+).
    A setup.sh for Linux/macOS is planned for a future release.
#>

[CmdletBinding()]
param(
    [switch]$SkipPython,
    [string]$InstallPath = $PSScriptRoot,
    [string]$DocsPath = "",
    [switch]$Force
)

# ============================================================================
# CONFIGURATION
# ============================================================================

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$CONFIG = @{
    PythonVersion      = "3.12"
    PythonMinVersion   = "3.11"
    PythonInstallerUrl = "https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe"
    EmbeddingModel     = "BAAI/bge-small-en-v1.5"
    RequirementsFile   = "requirements.txt"
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Banner {
    $banner = @"

    ╔═══════════════════════════════════════════════════════════════════╗
    ║                                                                   ║
    ║   ██╗  ██╗███╗   ██╗ ██████╗ ██╗    ██╗██╗     ███████╗██████╗   ║
    ║   ██║ ██╔╝████╗  ██║██╔═══██╗██║    ██║██║     ██╔════╝██╔══██╗  ║
    ║   █████╔╝ ██╔██╗ ██║██║   ██║██║ █╗ ██║██║     █████╗  ██║  ██║  ║
    ║   ██╔═██╗ ██║╚██╗██║██║   ██║██║███╗██║██║     ██╔══╝  ██║  ██║  ║
    ║   ██║  ██╗██║ ╚████║╚██████╔╝╚███╔███╔╝███████╗███████╗██████╔╝  ║
    ║   ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚══╝╚══╝ ╚══════╝╚══════╝╚═════╝   ║
    ║                                                                   ║
    ║                    RAG SYSTEM INSTALLER v2.0                      ║
    ║         Local Semantic Search for Claude Code (FastEmbed)         ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝

"@
    Write-Host $banner -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message, [string]$Status = "INFO")

    $colors = @{
        "INFO"  = "Cyan"
        "OK"    = "Green"
        "WARN"  = "Yellow"
        "ERROR" = "Red"
        "SKIP"  = "DarkGray"
    }

    $symbols = @{
        "INFO"  = "[*]"
        "OK"    = "[+]"
        "WARN"  = "[!]"
        "ERROR" = "[-]"
        "SKIP"  = "[~]"
    }

    Write-Host "$($symbols[$Status]) " -ForegroundColor $colors[$Status] -NoNewline
    Write-Host $Message
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PythonPath {
    # Check common Python installation paths
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe"
    )

    foreach ($path in $paths) {
        if (Test-Path $path) {
            return $path
        }
    }

    # Try to find via py launcher
    try {
        $pyPath = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($pyPath -and (Test-Path $pyPath)) {
            return $pyPath
        }

        $pyPath = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($pyPath -and (Test-Path $pyPath)) {
            return $pyPath
        }
    } catch {}

    # Try PATH
    try {
        $pyPath = (Get-Command python -ErrorAction SilentlyContinue).Source
        if ($pyPath) {
            $version = & $pyPath --version 2>&1
            if ($version -match "3\.(11|12)") {
                return $pyPath
            }
        }
    } catch {}

    return $null
}

# ============================================================================
# INSTALLATION STEPS
# ============================================================================

function Install-Python {
    Write-Host "`n=== PYTHON INSTALLATION ===" -ForegroundColor Yellow

    $pythonPath = Get-PythonPath

    if ($pythonPath) {
        $version = & $pythonPath --version 2>&1
        Write-Step "Python found: $version at $pythonPath" "OK"
        return $pythonPath
    }

    Write-Step "Python 3.11/3.12 not found. Installing..." "WARN"

    $installerPath = "$env:TEMP\python-installer.exe"

    Write-Step "Downloading Python installer..." "INFO"
    Invoke-WebRequest -Uri $CONFIG.PythonInstallerUrl -OutFile $installerPath

    Write-Step "Running Python installer (this may take a few minutes)..." "INFO"
    $installArgs = "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0"
    Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait

    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    # Refresh environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    $pythonPath = Get-PythonPath
    if ($pythonPath) {
        Write-Step "Python installed successfully!" "OK"
        return $pythonPath
    } else {
        throw "Python installation failed. Please install Python 3.11 or 3.12 manually."
    }
}

function Setup-ProjectStructure {
    Write-Host "`n=== PROJECT STRUCTURE ===" -ForegroundColor Yellow

    # Create main directory
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
        Write-Step "Created: $InstallPath" "OK"
    } else {
        Write-Step "Directory exists: $InstallPath" "OK"
    }

    # Create subdirectories
    $dirs = @(
        "mcp_server",
        "documents",
        "documents\security",
        "documents\logscale",
        "documents\development",
        "documents\general",
        "documents\aar",
        "data",
        "data\chroma_db",
        ".claude"
    )

    foreach ($dir in $dirs) {
        $fullPath = Join-Path $InstallPath $dir
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        }
    }

    Write-Step "Directory structure created" "OK"
}

function Setup-VirtualEnvironment {
    param([string]$PythonPath)

    Write-Host "`n=== VIRTUAL ENVIRONMENT ===" -ForegroundColor Yellow

    $venvPath = Join-Path $InstallPath "venv"
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $venvPip = Join-Path $venvPath "Scripts\pip.exe"

    # Create venv if needed
    if (-not (Test-Path $venvPython) -or $Force) {
        if ($Force -and (Test-Path $venvPath)) {
            Write-Step "Removing existing venv (--Force)..." "WARN"
            Remove-Item $venvPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-Step "Creating virtual environment..." "INFO"
        & $PythonPath -m venv $venvPath
        Write-Step "Virtual environment created" "OK"
    } else {
        Write-Step "Virtual environment exists" "OK"
    }

    # Upgrade pip
    Write-Step "Upgrading pip..." "INFO"
    & $venvPython -m pip install --upgrade pip --quiet

    # Install packages from requirements.txt
    $reqFile = Join-Path $InstallPath $CONFIG.RequirementsFile
    if (Test-Path $reqFile) {
        Write-Step "Installing dependencies from $($CONFIG.RequirementsFile)..." "INFO"
        & $venvPip install -r $reqFile --quiet
        if ($LASTEXITCODE -eq 0) {
            Write-Step "All dependencies installed!" "OK"
        } else {
            throw "Failed to install dependencies from $($CONFIG.RequirementsFile). Check the output above."
        }
    } else {
        Write-Step "$($CONFIG.RequirementsFile) not found at $reqFile" "ERROR"
        throw "Missing $($CONFIG.RequirementsFile). Ensure you cloned the repository correctly."
    }

    return $venvPython
}

function Install-EmbeddingModel {
    param([string]$VenvPython)

    Write-Host "`n=== EMBEDDING MODEL (FastEmbed) ===" -ForegroundColor Yellow

    $model = $CONFIG.EmbeddingModel
    Write-Step "Pre-downloading embedding model: $model" "INFO"
    Write-Step "This downloads ~130MB on first run (cached in ~/.cache/fastembed/)" "INFO"

    try {
        & $VenvPython -c "from fastembed import TextEmbedding; TextEmbedding('$model')" 2>&1 | ForEach-Object {
            if ($_ -match "error|Error|ERROR|Traceback") {
                Write-Step "$_" "ERROR"
            }
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Step "Embedding model '$model' ready!" "OK"
        } else {
            Write-Step "Model download may have failed. The server will retry on first start." "WARN"
        }
    } catch {
        Write-Step "Model pre-download failed: $_" "WARN"
        Write-Step "The server will auto-download the model on first start." "WARN"
    }
}

function Check-SourceFiles {
    Write-Host "`n=== SOURCE FILES ===" -ForegroundColor Yellow

    # __init__.py
    $initPath = Join-Path $InstallPath "mcp_server\__init__.py"
    if (-not (Test-Path $initPath)) {
        '"""Knowledge RAG MCP Server Package"""' | Out-File -FilePath $initPath -Encoding utf8
    }

    # config.py
    $configPath = Join-Path $InstallPath "mcp_server\config.py"
    if (Test-Path $configPath) {
        Write-Step "Found: config.py" "OK"
    } else {
        Write-Step "config.py not found - please ensure you cloned the repository" "WARN"
    }

    # ingestion.py
    $ingestionPath = Join-Path $InstallPath "mcp_server\ingestion.py"
    if (Test-Path $ingestionPath) {
        Write-Step "Found: ingestion.py" "OK"
    } else {
        Write-Step "ingestion.py not found - please ensure you cloned the repository" "WARN"
    }

    # server.py
    $serverPath = Join-Path $InstallPath "mcp_server\server.py"
    if (Test-Path $serverPath) {
        Write-Step "Found: server.py" "OK"
    } else {
        Write-Step "server.py not found - please ensure you cloned the repository" "WARN"
    }

    # requirements.txt
    $reqPath = Join-Path $InstallPath "requirements.txt"
    if (Test-Path $reqPath) {
        Write-Step "Found: requirements.txt" "OK"
    } else {
        Write-Step "requirements.txt not found" "WARN"
    }
}

function Setup-MCPConfiguration {
    param([string]$VenvPython)

    Write-Host "`n=== MCP CONFIGURATION ===" -ForegroundColor Yellow

    # Use cmd /c wrapper to ensure working directory is set correctly
    $escapedPath = $InstallPath.Replace("\", "\\")

    $mcpConfig = @{
        mcpServers = @{
            "knowledge-rag" = @{
                type    = "stdio"
                command = "cmd"
                args    = @("/c", "cd /d $escapedPath && .\venv\Scripts\python.exe -m mcp_server.server")
                env     = @{}
            }
        }
    }

    $mcpJson = $mcpConfig | ConvertTo-Json -Depth 10

    # Project-level config
    $projectMcpPath = Join-Path $InstallPath ".claude\mcp.json"
    $mcpJson | Out-File -FilePath $projectMcpPath -Encoding utf8
    Write-Step "Created: .claude\mcp.json (project)" "OK"

    # Global config
    $globalClaudeDir = "$env:USERPROFILE\.claude"
    if (-not (Test-Path $globalClaudeDir)) {
        New-Item -ItemType Directory -Path $globalClaudeDir -Force | Out-Null
    }

    $globalMcpPath = Join-Path $globalClaudeDir "mcp.json"

    # Merge with existing config if present
    if (Test-Path $globalMcpPath) {
        try {
            $existingConfig = Get-Content $globalMcpPath -Raw | ConvertFrom-Json -AsHashtable
            $existingConfig.mcpServers["knowledge-rag"] = $mcpConfig.mcpServers["knowledge-rag"]
            $existingConfig | ConvertTo-Json -Depth 10 | Out-File -FilePath $globalMcpPath -Encoding utf8
            Write-Step "Updated: ~/.claude/mcp.json (global - merged)" "OK"
        } catch {
            $mcpJson | Out-File -FilePath $globalMcpPath -Encoding utf8
            Write-Step "Created: ~/.claude/mcp.json (global - fresh)" "OK"
        }
    } else {
        $mcpJson | Out-File -FilePath $globalMcpPath -Encoding utf8
        Write-Step "Created: ~/.claude/mcp.json (global)" "OK"
    }
}

function Show-Summary {
    param([string]$VenvPython)

    $docsFullPath = Join-Path $InstallPath "documents"

    $summary = @"

    ╔═══════════════════════════════════════════════════════════════════╗
    ║                    INSTALLATION COMPLETE!                         ║
    ╚═══════════════════════════════════════════════════════════════════╝

    Installation Path:  $InstallPath
    Python (venv):      $VenvPython
    Embedding Model:    $($CONFIG.EmbeddingModel) (FastEmbed, in-process)
    Embedding Cache:    ~/.cache/fastembed/

    ┌─────────────────────────────────────────────────────────────────┐
    │ NEXT STEPS                                                       │
    ├─────────────────────────────────────────────────────────────────┤
    │                                                                  │
    │ 1. Add documents to: $docsFullPath\
    │    - security\     -> Security/pentest content                   │
    │    - logscale\     -> LogScale/LQL queries                       │
    │    - development\  -> Code/dev documentation                     │
    │    - aar\          -> After Action Reviews                       │
    │    - general\      -> Other documents                            │
    │                                                                  │
    │ 2. Restart Claude Code to load the MCP server                    │
    │    (server auto-indexes documents on startup)                    │
    │                                                                  │
    │ 3. Available MCP Tools (12):                                     │
    │    - search_knowledge(query, max_results, category, hybrid_alpha)│
    │    - get_document(filepath)                                      │
    │    - reindex_documents(force, full_rebuild)                      │
    │    - list_categories()                                           │
    │    - list_documents(category)                                    │
    │    - get_index_stats()                                           │
    │    - add_document(content, filepath, category)                   │
    │    - update_document(filepath, content)                          │
    │    - remove_document(filepath, delete_file)                      │
    │    - add_from_url(url, category, title)                          │
    │    - search_similar(filepath, max_results)                       │
    │    - evaluate_retrieval(test_cases)                              │
    │                                                                  │
    └─────────────────────────────────────────────────────────────────┘

    No external services required. FastEmbed runs in-process.
    Just restart Claude Code and start searching.

"@

    Write-Host $summary -ForegroundColor Green
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

try {
    Write-Banner

    Write-Step "Install path: $InstallPath" "INFO"
    Write-Step "Platform: Windows (PowerShell $($PSVersionTable.PSVersion))" "INFO"
    Write-Host ""

    # Admin check
    if (-not $SkipPython) {
        if (-not (Test-Administrator)) {
            Write-Step "Some installations may require administrator privileges" "WARN"
        }
    }

    # Step 1: Python
    if ($SkipPython) {
        Write-Step "Skipping Python installation (-SkipPython)" "SKIP"
        $pythonPath = Get-PythonPath
        if (-not $pythonPath) {
            throw "Python 3.11/3.12 not found. Run without -SkipPython to auto-install."
        }
        $version = & $pythonPath --version 2>&1
        Write-Step "Using: $version at $pythonPath" "OK"
    } else {
        $pythonPath = Install-Python
    }

    # Step 2: Project structure
    Setup-ProjectStructure

    # Step 3: Virtual environment + dependencies
    $venvPython = Setup-VirtualEnvironment -PythonPath $pythonPath

    # Step 4: Pre-download embedding model
    Install-EmbeddingModel -VenvPython $venvPython

    # Step 5: Verify source files
    Check-SourceFiles

    # Step 6: MCP configuration
    Setup-MCPConfiguration -VenvPython $venvPython

    # Summary
    Show-Summary -VenvPython $venvPython

    Write-Host "Installation completed successfully!" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "`n[-] Installation failed: $_" -ForegroundColor Red
    Write-Host "Please check the error above and try again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

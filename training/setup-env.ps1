# Training environment bootstrap (Windows / PowerShell 5.1+ or pwsh 7+)
#
# Usage (from repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File training/setup-env.ps1
#   or: npm run train:env
#
# Creates <repo>/.venv-train (gitignored, ~5GB). Does NOT touch the Anaconda base env.
# NOTE: this file must stay ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI when
#       there is no BOM, and non-ASCII bytes corrupt string quoting => the script breaks.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.venv-train'
$py = Join-Path $venv 'Scripts\python.exe'
$tsinghua = 'https://pypi.tuna.tsinghua.edu.cn/simple'

# Pinned on purpose: torch 2.14.1+cu126 fails on this machine (WinError 1114 loading c10.dll).
# 2.8.0+cu126 is verified working here (RTX 4060 Laptop, driver 591.59). Bump only after testing.
$torchVersion = '2.8.0'
$cuIndex = 'https://download.pytorch.org/whl/cu126'

Write-Host "==> repo:  $root"
Write-Host "==> venv:  $venv"

if (-not (Test-Path $py)) {
    Write-Host '[1/4] creating venv'
    python -m venv $venv
} else {
    Write-Host '[1/4] venv exists, skip'
}

Write-Host '[2/4] upgrading pip / wheel / setuptools'
& $py -m pip install --upgrade pip wheel setuptools -i $tsinghua --quiet

Write-Host "[3/4] installing PyTorch $torchVersion (CUDA 12.6) - about 2.9GB, do not interrupt"
& $py -m pip install "torch==$torchVersion" --index-url $cuIndex

Write-Host '[4/4] installing training stack'
& $py -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt') -i $tsinghua

Write-Host ''
Write-Host '==> verify'
& $py -c "import torch, transformers, peft, trl, bitsandbytes; print('torch', torch.__version__); print('cuda_available', torch.cuda.is_available()); print('device', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'); print('transformers', transformers.__version__); print('peft', peft.__version__); print('trl', trl.__version__)"

Write-Host ''
Write-Host '==> freeze actual versions to requirements.lock.txt'
& $py -m pip freeze | Out-File -Encoding utf8 (Join-Path $PSScriptRoot 'requirements.lock.txt')
Write-Host 'done.'

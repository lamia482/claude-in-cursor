#!/usr/bin/env bash
# 一键检测并安装 Node.js / npm / Git，然后执行 node setup.js 部署
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MIN_NODE_MAJOR=18
# 官方二进制包版本（LTS）；用于 NodeSource 不支持的 RHEL 系发行版（如 EulerOS）
NODE_BINARY_VERSION="${NODE_BINARY_VERSION:-20.19.2}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { printf '%b%s%b\n' "$BLUE" "$*" "$NC"; }
log_ok() { printf '%b%s%b\n' "$GREEN" "$*" "$NC"; }
log_warn() { printf '%b%s%b\n' "$YELLOW" "$*" "$NC"; }
log_err() { printf '%b%s%b\n' "$RED" "$*" "$NC"; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  if ! command_exists node; then
    echo 0
    return
  fi
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

need_sudo() {
  [[ "$(id -u)" -ne 0 ]]
}

run_sudo() {
  if need_sudo; then
    if ! command_exists sudo; then
      log_err "需要 root 权限安装系统依赖，请使用 sudo 重新运行本脚本"
      exit 1
    fi
    sudo "$@"
  else
    "$@"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux) echo "linux" ;;
    *)
      log_err "install.sh 仅支持 macOS 与 Linux，Windows 请直接运行: node setup.js"
      exit 1
      ;;
  esac
}

detect_linux_distro() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
    return
  fi
  echo "unknown"
}

# 按发行版 / ID_LIKE / 可用包管理器选择安装路径（避免未知 RHEL 系误走 nvm）
detect_linux_install_family() {
  local id="" id_like=""
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    id="${ID:-}"
    id_like="${ID_LIKE:-}"
  fi

  case "$id" in
    ubuntu|debian|linuxmint|pop) echo "debian"; return ;;
    fedora|rhel|centos|rocky|almalinux|ol|euleros|openeuler|kylin|uos|anolis) echo "rhel"; return ;;
    alpine) echo "alpine"; return ;;
    arch|manjaro) echo "arch"; return ;;
  esac

  if [[ "$id_like" == *debian* || "$id_like" == *ubuntu* ]]; then
    echo "debian"
    return
  fi
  if [[ "$id_like" == *rhel* || "$id_like" == *fedora* || "$id_like" == *centos* ]]; then
    echo "rhel"
    return
  fi

  if command_exists dnf || command_exists yum; then
    echo "rhel"
    return
  fi
  if command_exists apt-get; then
    echo "debian"
    return
  fi
  if command_exists apk; then
    echo "alpine"
    return
  fi
  if command_exists pacman; then
    echo "arch"
    return
  fi

  echo "unknown"
}

detect_node_binary_platform() {
  case "$(uname -m)" in
    x86_64) echo "linux-x64" ;;
    aarch64|arm64) echo "linux-arm64" ;;
    *)
      log_err "不支持的 CPU 架构: $(uname -m)，请手动安装 Node.js >= ${MIN_NODE_MAJOR}"
      exit 1
      ;;
  esac
}

# NodeSource RPM 脚本仅识别 /etc/redhat-release、Amazon Linux、openEuler 等
nodesource_rpm_supported() {
  [[ -f /etc/redhat-release ]] && return 0
  [[ -f /etc/openEuler-release ]] && return 0
  grep -q "Amazon Linux" /etc/system-release 2>/dev/null && return 0
  return 1
}

install_node_via_binary() {
  local platform version tarball tmpdir url downloaded=0

  platform="$(detect_node_binary_platform)"
  version="$NODE_BINARY_VERSION"
  tarball="node-v${version}-${platform}.tar.xz"
  tmpdir="$(mktemp -d)"

  log_info "通过官方二进制包安装 Node.js v${version} (${platform})..."

  if command_exists dnf || command_exists yum; then
    local pkg_mgr="dnf"
    command_exists dnf || pkg_mgr="yum"
    run_sudo "$pkg_mgr" install -y curl tar xz
  elif command_exists apt-get; then
    run_sudo apt-get install -y curl tar xz-utils
  fi

  local urls=(
    "https://nodejs.org/dist/v${version}/${tarball}"
    "https://npmmirror.com/mirrors/node/v${version}/${tarball}"
  )

  for url in "${urls[@]}"; do
    log_info "尝试下载: ${url}"
    if curl -fsSL --connect-timeout 30 --max-time 600 -o "$tmpdir/$tarball" "$url"; then
      downloaded=1
      break
    fi
    log_warn "下载失败，尝试下一个源..."
  done

  if [[ "$downloaded" -ne 1 ]]; then
    rm -rf "$tmpdir"
    log_err "无法下载 Node.js 二进制包（请检查网络或手动安装）"
    log_err "  https://nodejs.org/dist/v${version}/${tarball}"
    exit 1
  fi

  run_sudo tar -xJf "$tmpdir/$tarball" -C /usr/local --strip-components=1
  rm -rf "$tmpdir"

  export PATH="/usr/local/bin:$PATH"
  hash -r 2>/dev/null || true

  if ! command_exists node || [[ "$(node_major_version)" -lt $MIN_NODE_MAJOR ]]; then
    log_err "二进制包安装后 Node.js 仍不可用"
    exit 1
  fi

  log_ok "✓ Node.js $(node -v | sed 's/^v//') 已通过二进制包安装到 /usr/local"
}

install_homebrew_if_missing() {
  if command_exists brew; then
    return 0
  fi

  log_info "未检测到 Homebrew，正在安装..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi

  if ! command_exists brew; then
    log_err "Homebrew 安装失败，请手动安装: https://brew.sh"
    exit 1
  fi
}

install_node_via_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    log_info "通过 nvm 安装 Node.js ${MIN_NODE_MAJOR}+..."
    if ! curl -fsSL --connect-timeout 30 --max-time 180 \
      https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; then
      log_err "nvm 安装失败（无法访问 GitHub，常见于内网/防火墙环境）"
      log_err "请手动安装 Node.js >= ${MIN_NODE_MAJOR} 后重新运行: node setup.js"
      log_err "  - 官方二进制: https://nodejs.org/dist/latest-v20.x/"
      log_err "  - RHEL/EulerOS: curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs"
      log_err "  - 或使用系统/内网 yum 源: yum install -y nodejs npm"
      exit 1
    fi
  fi

  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"

  if ! nvm install --lts; then
    log_err "nvm 下载 Node.js 失败（网络超时或无法访问 nodejs.org）"
    log_err "请手动安装 Node.js >= ${MIN_NODE_MAJOR} 后重新运行: node setup.js"
    exit 1
  fi
  nvm use --lts

  if ! command_exists node; then
    log_err "nvm 安装 Node.js 失败"
    exit 1
  fi
}

install_node_macos() {
  install_homebrew_if_missing
  log_info "通过 Homebrew 安装 Node.js..."
  brew install node
}

install_git_macos() {
  install_homebrew_if_missing
  log_info "通过 Homebrew 安装 Git..."
  brew install git
}

install_node_linux_debian() {
  if command_exists apt-get; then
    log_info "通过 apt 安装 Node.js 与 npm..."
    run_sudo apt-get update -qq
    run_sudo apt-get install -y curl ca-certificates gnupg git

    if ! command_exists node || [[ "$(node_major_version)" -lt $MIN_NODE_MAJOR ]]; then
      log_info "系统源 Node 版本过低，改用 NodeSource 安装 Node.js 20..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | run_sudo bash -
      run_sudo apt-get install -y nodejs
    fi
    return 0
  fi
  install_node_via_nvm
}

install_git_linux_debian() {
  if command_exists git; then
    return 0
  fi
  run_sudo apt-get update -qq
  run_sudo apt-get install -y git
}

install_node_linux_rhel() {
  if command_exists dnf || command_exists yum; then
    local pkg_mgr="dnf"
    command_exists dnf || pkg_mgr="yum"

    log_info "通过 ${pkg_mgr} 安装 Node.js、npm 与 Git..."
    run_sudo "$pkg_mgr" install -y curl git

    if ! command_exists node || [[ "$(node_major_version)" -lt $MIN_NODE_MAJOR ]]; then
      if nodesource_rpm_supported; then
        log_info "系统源 Node 版本过低，改用 NodeSource 安装 Node.js 20..."
        if curl -fsSL --connect-timeout 30 --max-time 180 \
          https://rpm.nodesource.com/setup_20.x | run_sudo bash - \
          && run_sudo "$pkg_mgr" install -y nodejs; then
          :
        else
          log_warn "NodeSource 安装失败，改用官方二进制包..."
          install_node_via_binary
        fi
      else
        local distro
        distro="$(detect_linux_distro)"
        log_warn "当前发行版 (${distro}) 不受 NodeSource RPM 脚本支持，改用官方二进制包..."
        if command_exists node && [[ "$(node_major_version)" -lt $MIN_NODE_MAJOR ]]; then
          log_warn "移除系统旧版 nodejs 包，避免 PATH 冲突..."
          run_sudo "$pkg_mgr" remove -y nodejs npm 2>/dev/null || true
        fi
        install_node_via_binary
      fi
    fi
    return 0
  fi
  install_node_via_nvm
}

install_git_linux_rhel() {
  if command_exists git; then
    return 0
  fi
  local pkg_mgr="dnf"
  command_exists dnf || pkg_mgr="yum"
  run_sudo "$pkg_mgr" install -y git
}

install_node_linux() {
  local distro family
  distro="$(detect_linux_distro)"
  family="$(detect_linux_install_family)"

  case "$family" in
    debian)
      install_node_linux_debian
      ;;
    rhel)
      if [[ "$distro" != "fedora" && "$distro" != "rhel" && "$distro" != "centos" ]]; then
        log_info "检测到 RHEL 系发行版 (${distro})，使用 yum/dnf 安装 Node.js..."
      fi
      install_node_linux_rhel
      ;;
    alpine)
      log_info "通过 apk 安装 Node.js、npm 与 Git..."
      run_sudo apk add --no-cache nodejs npm git
      ;;
    arch)
      log_info "通过 pacman 安装 Node.js、npm 与 Git..."
      run_sudo pacman -Sy --noconfirm nodejs npm git
      ;;
    *)
      log_warn "未识别的 Linux 发行版 (${distro})，尝试 nvm 安装 Node.js..."
      install_node_via_nvm
      if ! command_exists git; then
        log_warn "请手动安装 Git: https://git-scm.com/download/linux"
      fi
      ;;
  esac
}

install_git_linux() {
  if command_exists git; then
    return 0
  fi

  local family
  family="$(detect_linux_install_family)"
  case "$family" in
    debian)
      install_git_linux_debian
      ;;
    rhel)
      install_git_linux_rhel
      ;;
    alpine)
      run_sudo apk add --no-cache git
      ;;
    arch)
      run_sudo pacman -Sy --noconfirm git
      ;;
    *)
      log_warn "请手动安装 Git: https://git-scm.com/download/linux"
      ;;
  esac
}

ensure_node() {
  local major
  major="$(node_major_version)"

  if [[ "$major" -ge $MIN_NODE_MAJOR ]] && command_exists npm; then
    log_ok "✓ Node.js $(node -v | sed 's/^v//') 与 npm $(npm -v) 已就绪"
    return 0
  fi

  if [[ "$major" -gt 0 && "$major" -lt $MIN_NODE_MAJOR ]]; then
    log_warn "Node.js 版本过低 (当前 v$(node -v | sed 's/^v//'))，需要 >= ${MIN_NODE_MAJOR}"
  else
    log_warn "未检测到 Node.js / npm"
  fi

  local os
  os="$(detect_os)"
  if [[ "$os" == "macos" ]]; then
    install_node_macos
  else
    install_node_linux
  fi

  major="$(node_major_version)"
  if [[ "$major" -lt $MIN_NODE_MAJOR ]] || ! command_exists npm; then
    log_err "Node.js >= ${MIN_NODE_MAJOR} 或 npm 仍不可用，请手动安装后重试"
    exit 1
  fi

  log_ok "✓ Node.js $(node -v | sed 's/^v//') 与 npm $(npm -v) 已安装"
}

ensure_git() {
  if command_exists git; then
    log_ok "✓ Git $(git --version | awk '{print $3}') 已安装"
    return 0
  fi

  log_warn "未检测到 Git，正在安装..."

  local os
  os="$(detect_os)"
  if [[ "$os" == "macos" ]]; then
    install_git_macos
  else
    install_git_linux
  fi

  if command_exists git; then
    log_ok "✓ Git $(git --version | awk '{print $3}') 已安装"
  else
    log_warn "⚠️ Git 未安装；macOS/Linux 可继续，但 Windows 部署需要 Git"
  fi
}

main() {
  export PATH="/usr/local/bin:$PATH"

  log_info ""
  log_info "========================================"
  log_info "  claude-in-cursor 环境检测与一键部署"
  log_info "========================================"
  log_info ""

  local os arch
  os="$(detect_os)"
  arch="$(uname -m)"
  log_info "检测到系统: ${os} / ${arch}"
  log_info ""

  ensure_node
  ensure_git

  log_info ""
  log_info "开始执行 node setup.js（含 skill.yaml → ~/.agents/skills 同步）..."
  log_info ""

  exec node setup.js
}

main "$@"

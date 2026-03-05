#!/bin/bash
# Build the Rust sidecar binary (vibe-audio) for local whisper.cpp transcription.
# Requires: Rust toolchain (rustup, cargo)
# On macOS ARM64, automatically enables Metal acceleration.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_DIR="$PROJECT_DIR/src-sidecar"
OUTPUT_DIR="$PROJECT_DIR/resources/bin"

echo "Building vibe-audio sidecar..."
echo "  Source: $SIDECAR_DIR"
echo "  Output: $OUTPUT_DIR"

# Check for Rust
if ! command -v cargo &>/dev/null; then
  echo "Error: Rust toolchain not found. Install from https://rustup.rs"
  exit 1
fi

# Build
cd "$SIDECAR_DIR"
cargo build --release

# Copy binary
mkdir -p "$OUTPUT_DIR"
cp "target/release/vibe-audio" "$OUTPUT_DIR/vibe-audio"

echo "Done. Binary at: $OUTPUT_DIR/vibe-audio"
echo "Size: $(du -h "$OUTPUT_DIR/vibe-audio" | cut -f1)"

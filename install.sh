#!/bin/bash
set -e

INSTALL_DIR="/usr/local/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v bun &> /dev/null; then
  echo "Error: bun is required. Install it with: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

echo "Installing crux to $INSTALL_DIR/crux..."

sudo tee "$INSTALL_DIR/crux" > /dev/null << EOF
#!/bin/bash
exec bun run "$SCRIPT_DIR/src/index.ts" "\$@"
EOF

sudo chmod +x "$INSTALL_DIR/crux"

echo "✓ crux installed successfully! Run 'crux' from anywhere."

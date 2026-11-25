#!/usr/bin/env bash
# Builds the WordPress plugin zip (folder orange-door/, main file orange-door.php).
#   scripts/build-wp-plugin.sh            -> wp-plugin/build/orange-door-<ver>.zip         (v1 behaviour, agent OFF)
#   scripts/build-wp-plugin.sh --agent    -> wp-plugin/build/orange-door-<ver>-agent.zip   (agent ON: for a STAGING site)
set -euo pipefail
cd "$(dirname "$0")/.."

AGENT=0; [[ "${1:-}" == "--agent" ]] && AGENT=1
VERSION=$(grep -m1 "^ \* Version:" wp-plugin/orangedoor.php | sed 's/.*Version: *//')
OUT=wp-plugin/build
STAGE=$(mktemp -d)
mkdir -p "$STAGE/orange-door/includes" "$OUT"

cp wp-plugin/orangedoor.php "$STAGE/orange-door/orange-door.php"
cp wp-plugin/includes/*.php "$STAGE/orange-door/includes/"

if [[ $AGENT == 1 ]]; then
  # Flip only the default; a wp-config.php define() still wins.
  sed -i.bak "s/define( 'OD_AGENT_ENABLED', false )/define( 'OD_AGENT_ENABLED', true )/" "$STAGE/orange-door/orange-door.php"
  rm "$STAGE/orange-door/orange-door.php.bak"
  grep -q "define( 'OD_AGENT_ENABLED', true )" "$STAGE/orange-door/orange-door.php" || { echo "failed to enable agent" >&2; exit 1; }
  NAME="orange-door-$VERSION-agent.zip"
else
  NAME="orange-door-$VERSION.zip"
fi

for f in "$STAGE"/orange-door/*.php "$STAGE"/orange-door/includes/*.php; do php -l "$f" >/dev/null; done
rm -f "$OUT/$NAME"
(cd "$STAGE" && zip -qr "$OLDPWD/$OUT/$NAME" orange-door)
rm -rf "$STAGE"
echo "$OUT/$NAME"
unzip -l "$OUT/$NAME" | tail -n +4

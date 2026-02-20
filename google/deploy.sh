#!/bin/bash

# Deploy script for Google Docs grammar checker add-on
# Runs everything inside Docker: build, compile, clasp login, push, and optional versioning.
#
# Usage:
#   ./deploy.sh            # Build image (if needed), compile, login, push
#   ./deploy.sh --rebuild  # Force rebuild of the Docker image first

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="divvun-google-deploy"
CLASP_CREDS="$HOME/.clasprc.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

step_num=0
total_steps=8

step() {
    step_num=$((step_num + 1))
    echo ""
    echo -e "${BOLD}[${step_num}/${total_steps}]${NC} $1"
}

ok()   { echo -e "      ${GREEN}✓${NC} $1"; }
fail() { echo -e "      ${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "      ${YELLOW}!${NC} $1"; }

# Parse arguments
FORCE_REBUILD=false
for arg in "$@"; do
    case "$arg" in
        --rebuild) FORCE_REBUILD=true ;;
        -h|--help)
            echo "Usage: $0 [--rebuild]"
            echo ""
            echo "Deploys the Google Docs grammar checker add-on via Docker."
            echo ""
            echo "Steps:"
            echo "  1. Build Docker image (Node 22 + clasp 3)"
            echo "  2. Update version date in grammarcheck.ts"
            echo "  3. Compile TypeScript and copy assets to build/"
            echo "  4. Login to clasp (OAuth, opens browser)"
            echo "  5. Push build/ to Google Apps Script"
            echo "  6. Create version and update deployment"
            echo "  7. Verify deployment"
            echo "  8. Prompt to update Marketplace SDK listing"
            echo ""
            echo "Options:"
            echo "  --rebuild   Force rebuild of the Docker image"
            echo "  -h, --help  Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Run '$0 --help' for usage."
            exit 1
            ;;
    esac
done

# Run a command inside Docker with the source directory mounted.
docker_run() {
    local mount_mode="${1:-ro}"
    shift
    docker run --rm \
        -v "${SCRIPT_DIR}:/app:${mount_mode}" \
        -w /app \
        "$IMAGE_NAME" \
        "$@"
}

# Run a command inside Docker with credentials mounted and interactive TTY.
docker_run_with_creds() {
    docker run --rm -it \
        --network host \
        -v "${SCRIPT_DIR}:/app" \
        -v "${CLASP_CREDS}:/root/.clasprc.json" \
        -w /app \
        "$IMAGE_NAME" \
        "$@"
}

# ── Step 1: Build Docker image ──────────────────────────────────────────────

step "Building Docker image..."

if [ "$FORCE_REBUILD" = true ]; then
    warn "Forcing rebuild (--rebuild)"
    docker build --no-cache -t "$IMAGE_NAME" "$SCRIPT_DIR"
    ok "Image rebuilt"
elif docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    ok "Image already exists (use --rebuild to force)"
else
    docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
    ok "Image built"
fi

# ── Step 2: Update version date ─────────────────────────────────────────────

step "Updating version date..."

TODAY="$(date +%Y-%m-%d)"
CURRENT_VERSION="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "${SCRIPT_DIR}/grammarcheck.ts")"
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION="unknown"
fi

if [ "$CURRENT_VERSION" = "$TODAY" ]; then
    ok "Version already set to ${TODAY}"
else
    sed -i.bak "s/^const VERSION = '.*';$/const VERSION = '${TODAY}';/" "${SCRIPT_DIR}/grammarcheck.ts"
    rm -f "${SCRIPT_DIR}/grammarcheck.ts.bak"
    ok "Version: ${CURRENT_VERSION} → ${TODAY}"
fi

# ── Step 3: Compile TypeScript ──────────────────────────────────────────────

step "Compiling TypeScript..."

# Clean previous build
rm -rf "${SCRIPT_DIR}/build"

# Compile TS → JS into build/
if docker_run rw npx tsc; then
    ok "TypeScript compiled"
else
    fail "Compilation failed. Fix errors before deploying."
fi

# Copy HTML templates and Apps Script manifest into build/
cp "${SCRIPT_DIR}"/*.html "${SCRIPT_DIR}/appsscript.json" "${SCRIPT_DIR}/build/"
ok "Copied HTML and appsscript.json to build/"

# Show what will be pushed
echo ""
echo "      Files in build/:"
for f in "${SCRIPT_DIR}"/build/*; do
    echo "      └─ $(basename "$f")"
done

# ── Step 4: clasp login ─────────────────────────────────────────────────────

step "Logging in to clasp..."

needs_login=true

if [ -f "$CLASP_CREDS" ]; then
    # Check if the credentials file has a refresh token
    if grep -q "refresh_token" "$CLASP_CREDS" 2>/dev/null; then
        ok "Found existing credentials in ${CLASP_CREDS}"
        needs_login=false
    fi
fi

if [ "$needs_login" = true ]; then
    warn "Opening browser for Google OAuth..."
    warn "Authenticate with the account that owns the Apps Script project."
    echo ""

    # Ensure the credentials file exists with valid JSON so Docker can mount it
    # as a file (not a directory) and clasp doesn't crash parsing it.
    if [ ! -f "$CLASP_CREDS" ] || [ ! -s "$CLASP_CREDS" ]; then
        echo '{}' > "$CLASP_CREDS"
    fi

    # Run clasp login interactively with host networking for the OAuth callback
    if docker run --rm -it \
        --network host \
        -v "${SCRIPT_DIR}:/app" \
        -v "${CLASP_CREDS}:/root/.clasprc.json" \
        -w /app \
        "$IMAGE_NAME" \
        clasp login; then
        ok "Login successful"
    else
        fail "Login failed"
    fi
fi

# ── Step 5: clasp push ──────────────────────────────────────────────────────

step "Pushing to Google Apps Script..."

if docker_run_with_creds clasp push --force; then
    ok "Code pushed successfully"
else
    fail "Push failed"
fi

# ── Step 6: Create version and update deployment ────────────────────────────

step "Creating version and updating deployment..."

# Create an immutable version
VERSION_OUTPUT="$(docker run --rm \
    --network host \
    -v "${SCRIPT_DIR}:/app" \
    -v "${CLASP_CREDS}:/root/.clasprc.json" \
    -w /app \
    "$IMAGE_NAME" \
    clasp version "v${TODAY}" 2>&1)"

VERSION_NUM="$(echo "$VERSION_OUTPUT" | sed -n 's/Created version \([0-9]*\).*/\1/p')"

if [ -z "$VERSION_NUM" ]; then
    echo "$VERSION_OUTPUT"
    fail "Failed to create version"
fi

ok "Created version ${VERSION_NUM}: v${TODAY}"

# Find all non-HEAD deployments (--json is a global flag, must come before subcommand)
DEPLOYMENTS_JSON="$(docker run --rm \
    --network host \
    -v "${SCRIPT_DIR}:/app" \
    -v "${CLASP_CREDS}:/root/.clasprc.json" \
    -w /app \
    "$IMAGE_NAME" \
    clasp --json deployments 2>&1)"

# Parse all versioned deployments in a single node invocation.
# Output format: one line per deployment as "DEPLOYMENT_ID\tINFO_STRING"
DEPLOY_LINES="$(echo "$DEPLOYMENTS_JSON" | docker run --rm -i "$IMAGE_NAME" node -e "
let d='';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
    try {
        const deps = JSON.parse(d);
        const versioned = deps.filter(x => x.versionNumber !== undefined);
        versioned.forEach(v => {
            const desc = v.description ? ' - ' + v.description : '';
            console.log(v.deploymentId + '\t@' + v.versionNumber + desc);
        });
    } catch (e) {
        process.stderr.write('Failed to parse deployments JSON: ' + e.message + '\n');
        process.stderr.write('Raw output: ' + d.slice(0, 500) + '\n');
        process.exit(1);
    }
});
")"

if [ -z "$DEPLOY_LINES" ]; then
    warn "No existing versioned deployments found"
    warn "Creating a new deployment..."
    if docker run --rm \
        --network host \
        -v "${SCRIPT_DIR}:/app" \
        -v "${CLASP_CREDS}:/root/.clasprc.json" \
        -w /app \
        "$IMAGE_NAME" \
        clasp deploy --versionNumber "$VERSION_NUM" --description "v${TODAY}"; then
        ok "Created new deployment at version ${VERSION_NUM}"
    else
        fail "Failed to create deployment"
    fi
else
    # Update each non-HEAD deployment
    UPDATED=0
    while IFS=$'\t' read -r DEP_ID DEP_INFO; do
        [ -z "$DEP_ID" ] && continue

        warn "Updating deployment ${DEP_ID:0:12}... (currently ${DEP_INFO})"

        if docker run --rm \
            --network host \
            -v "${SCRIPT_DIR}:/app" \
            -v "${CLASP_CREDS}:/root/.clasprc.json" \
            -w /app \
            "$IMAGE_NAME" \
            clasp update-deployment "$DEP_ID" --versionNumber "$VERSION_NUM" --description "v${TODAY}"; then
            ok "Updated to version ${VERSION_NUM}"
            UPDATED=$((UPDATED + 1))
        else
            fail "Failed to update deployment ${DEP_ID:0:12}..."
        fi
    done <<< "$DEPLOY_LINES"

    ok "Updated ${UPDATED} deployment(s)"
fi

# ── Step 7: Verify deployment ───────────────────────────────────────────────

step "Verifying deployment..."

# Show what version was pushed
PUSHED_VERSION="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "${SCRIPT_DIR}/build/grammarcheck.js")"
ok "Pushed version: ${PUSHED_VERSION:-unknown}"

# Show current deployments
echo ""
echo "      Deployments:"
docker run --rm \
    --network host \
    -v "${SCRIPT_DIR}:/app" \
    -v "${CLASP_CREDS}:/root/.clasprc.json" \
    -w /app \
    "$IMAGE_NAME" \
    clasp deployments 2>&1 | while IFS= read -r line; do
    echo "      ${line}"
done

ok "Deployment verified"

# ── Step 8: Marketplace SDK instructions ────────────────────────────────────

step "Update Google Workspace Marketplace listing"

GCP_PROJECT="divvun-gapps-grammar-checker"
SCRIPT_ID="MFVPDoxRYmAr2LDY-YoElkmOyc8oyZy1Z"
SDK_CONFIG_URL="https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com/googleapps_sdk?project=${GCP_PROJECT}"
SDK_PUBLISH_URL="https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com/googleapps_sdk_publish?project=${GCP_PROJECT}"

echo ""
echo -e "      ${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo -e "        ${RED}MANUAL STEPS REQUIRED${NC} — Google Workspace Marketplace SDK"
echo -e "        (No API exists to automate this)"
echo -e "      ${BOLD}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "        Account:      ${BOLD}divvunuit@gmail.com${NC}"
echo -e "        GCP project:  ${BOLD}${GCP_PROJECT}${NC}"
echo -e "        Script ID:    ${BOLD}${SCRIPT_ID}${NC}"
echo -e "        New version:  ${GREEN}${BOLD}${VERSION_NUM}${NC}  (v${TODAY})"
echo ""
echo -e "        ${BOLD}── Steps ──────────────────────────────────────────────────${NC}"
echo ""
echo -e "        ${BOLD}1.${NC} Open the Marketplace SDK App Configuration page:"
echo ""
echo -e "           ${YELLOW}${SDK_CONFIG_URL}${NC}"
echo ""
echo -e "        ${BOLD}2.${NC} Update ${BOLD}Docs add-on script version${NC} to: ${GREEN}${BOLD}${VERSION_NUM}${NC}"
echo ""
echo -e "        ${BOLD}3.${NC} Click ${BOLD}Save Draft${NC} at the bottom of the page"
echo ""
echo -e "        ${BOLD}4.${NC} Open the Marketplace SDK Publish page:"
echo ""
echo -e "           ${YELLOW}${SDK_PUBLISH_URL}${NC}"
echo ""
echo -e "        ${BOLD}5.${NC} Click ${BOLD}Publish${NC}"
echo ""
echo -e "        ${BOLD}── Note ───────────────────────────────────────────────────${NC}"
echo ""
echo -e "        If the URLs open the wrong Google account, append"
echo -e "        ${YELLOW}?auth_user=N&authuser=N${NC} (where N is the account index,"
echo -e "        e.g. 0, 1, 2) to select the correct one."
echo ""
echo -e "      ${BOLD}══════════════════════════════════════════════════════════════${NC}"

# Try to open the URL automatically on macOS
if command -v open >/dev/null 2>&1; then
    echo ""
    echo -n "      Open App Configuration page in browser? [Y/n] "
    read -r OPEN_BROWSER
    if [ "$OPEN_BROWSER" != "n" ] && [ "$OPEN_BROWSER" != "N" ]; then
        open "$SDK_CONFIG_URL"
        ok "Opened in browser"
    fi
fi

echo ""
echo -e "${GREEN}${BOLD}Done!${NC} Deployment complete (version ${VERSION_NUM}: v${TODAY})."

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo containing Sámi grammar checker add-ons for two different web office platforms:

- `google/` - Google Docs add-on (Google Apps Script)
- `msoffice/` - Microsoft Office Online add-in (React/TypeScript)

Each subfolder is a separate project with its own dependencies and build process.

## Common Commands

### Google Docs Add-on (`google/` directory)
```bash
cd google
npm install
npm run clasp login        # Login to Google Apps Script
npm run clasp push         # Deploy code to Apps Script
npm run clasp open         # Open script editor
```

### MS Office Add-in (`msoffice/` directory)
```bash
cd msoffice
npm install
npm start                  # Start development server on port 3000
npm run build             # Build for production
npm run lint              # Run TypeScript linting
npm run validate          # Validate Office manifest
npm run sideload          # Sideload add-in for testing
```

## Architecture

### Google Docs Add-on
- Built using Google Apps Script (TypeScript)
- Main entry point: `grammarcheck.ts`
- Uses Google Docs API to interact with documents
- Sidebar-based UI with HTML templates
- Deployed directly to Google's infrastructure

### MS Office Add-in
- React/TypeScript application with Office.js integration
- Entry point: `src/index.tsx`
- Key components in `src/components/`:
  - `App.tsx` - Main application component
  - `Checker.tsx` - Grammar checking functionality
  - `Settings.tsx` - User preferences
- Uses Office UI Fabric React for styling
- Self-hosted on api.giellalt.org (see Deployment)

## Grammar Checking API

Both add-ons use the same backend API at `https://api.giellalt.org/` for grammar checking services (beta: `https://beta.api.giellalt.org/`, selectable in Settings). The API supports multiple Sámi languages and returns error suggestions with localized descriptions.

The backend is `divvun-runtime` behind the `divvun-worker-*` services, deployed via ArgoCD from the `k0s-config` repo. `libdivvun` and `divvun-api` are **not** used — do not consult them when tracing API behaviour.

Note that the two APIs serve different language sets: `/languages` is authoritative, and a language available on production may be absent from beta.

## Development Environment Setup

### MS Office Add-in SSL Certificates
Development requires HTTPS. Use existing certificates in `certs/` or generate new ones:
```bash
cd msoffice/certs2
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 1024 -out ca.crt \
    -subj "/C=US/ST=State/L=City/O=YourOrganization/OU=Dev/CN=Localhost-CA"
```
Add the CA certificate to your browser's trusted authorities.

### Node version
The add-in builds on current Node (tested on 22). The old `node:10` Docker workaround is no
longer needed. Note that webpack 4 hardcodes md4 hashing, which OpenSSL 3 (Node 17+) refuses,
so the `start` and `build` scripts set `NODE_OPTIONS=--openssl-legacy-provider` via `cross-env`.
Removing that flag requires migrating to webpack 5.

## Deployment

### Google Docs
- Uses clasp to deploy to Google Apps Script
- Published via GSuite Marketplace and Chrome Web Store
- Script ID managed in `.clasp.json`

### MS Office
- Build production bundle with `npm run build`
- Deploy by copying `dist/` onto the NFS share, normally mounted at `/Volumes/pahkat`:
  `cp -R dist/ /Volumes/pahkat/msoffice/` (otherwise `divvun-cp:/srv/nfs/pahkat/msoffice`)
- Copy over the top — do NOT wipe first. `index.html` is cached for 24h, so clients
  still holding the old one need the old hashed bundles to remain.
- Traefik serves these files directly via the `statiq` plugin; no service restart needed
- Content-only updates need **no** Partner Center resubmission — Microsoft only holds the
  manifest, which points at `https://api.giellalt.org/msoffice/index.html`. Only URL,
  permission or add-in id changes require resubmitting.
- See `msoffice/README.md` for the full routing chain and Partner Center details

## Testing

Both add-ons can be tested using the API endpoints directly:
- Grammar check: `POST https://api.giellalt.org/grammar/[language-code]` with `{"text": "..."}`
  and an `Accept-Language` header controlling the language of `title`/`description`
- Available languages: `GET https://api.giellalt.org/languages`
- Error types: `GET https://api.giellalt.org/grammar/[language-code]/preferences`
- Production grammar languages: se (North Sámi), sma, smj, smn, fo
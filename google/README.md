# Sami Grammar Checker for Google Docs

The grammar checker is an add-on to Google Docs.

# Requirements

- Docker and Docker Compose

# Development setup

We use Docker to provide a consistent development environment regardless of your platform (macOS, Linux, Windows, Apple Silicon, etc.).

## Quick Start with Docker

1. **Build the development environment:**
   ```bash
   ./docker-dev.sh rebuild
   ```
   (This ensures you have the correct clasp version 2.3.0 that works with Node.js 10)

2. **Start the development environment:**
   ```bash
   ./docker-dev.sh start
   ```

3. **Login to Google Apps Script:**
   ```bash
   ./docker-dev.sh clasp login
   ```
   This will open a browser window for Google OAuth authentication. The Docker container uses host networking, so the OAuth callback will work seamlessly. Make sure to enable the Apps Script API at https://script.google.com/home/usersettings if you haven't already.

   Your credentials will be saved to `~/.clasp/` on your host machine and automatically mounted in the container.

4. **Create a new Apps Script project:**
   ```bash
   ./docker-dev.sh clasp create "Divvun Grammar Checker"
   ```
   Select 'docs' when prompted.

You'll get two links. The first is the doc that's setup for you to test in. The second one is the script repo. You can run the extension now in Extensions -> Google -> Grammar check

```
> divvun-gramcheck-google-docs@1.0.0 clasp /Users/srdkvr/source/divvun/divvun-gramcheck-web/google
> clasp "create" "Divvun Grammar Checker"

(node:27080) ExperimentalWarning: The fs.promises API is experimental
? Create which script? docs
Created new Google Doc: https://drive.google.com/open?id=1XI0osST4SEXsz0kmP-2DxTs3oyZ9n8-8p7r0Nb0Iaog
Created new Google Docs Add-on script: https://script.google.com/d/1IbhhyGrrMgQuPaJaRMy0E1vvDvIHGXGYcALsS4fV5-Pge96CTt-yUI4n/edit
```

5. **Push code to Apps Script:**
   ```bash
   ./docker-dev.sh clasp push
   ```

6. **Open the script editor:**
   ```bash
   ./docker-dev.sh clasp open
   ```

## Docker Development Commands

The `docker-dev.sh` script provides convenient commands for development:

- `./docker-dev.sh start` - Start the development environment
- `./docker-dev.sh stop` - Stop the development environment
- `./docker-dev.sh shell` - Access container shell for manual commands
- `./docker-dev.sh clasp [args]` - Run clasp commands (login, push, open, etc.)
- `./docker-dev.sh npm [args]` - Run npm commands
- `./docker-dev.sh logs` - Show container logs
- `./docker-dev.sh cleanup` - Remove container and image (full cleanup)
- `./docker-dev.sh help` - Show help with all available commands

## Legacy Setup (without Docker)

If you prefer to set up the environment manually:

- Node.js (> 9.0)
- npm
- Install clasp globally: `npm install -g @google/clasp`
- Run `npm install` in this directory
- Use `npm run clasp [command]` instead of the docker-dev.sh script


# Publishing

This project was setup using divvunuit@gmail.com. If you've done it right you should be able to see this doc https://script.google.com/home/projects/1LIO6pqCziYtTTzVFRQzA1SSCCie_5XTcnZxTHCyVvqyAugYSQiLLNQqb/edit

Make sure your .clasp.json file has the same id as the script on the site:
```bash
cat .clasp.json
{"scriptId":"1LIO6pqCziYtTTzVFRQzA1SSCCie_5XTcnZxTHCyVvqyAugYSQiLLNQqb"}
```

You can run `./docker-dev.sh clasp push` and test until you're good and happy. Once you're happy, you create a new version. Do that according to https://developers.google.com/apps-script/guides/versions#creating_a_version

When you've created the new version, change the script version on https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com/googleapps_sdk?project=divvun-gapps-grammar-checker&pli=1

If it's 3 and you created version 4.. you.. update the 3 to a 4. It deploys within minute


The Docs Add-on key is gonna be:
MFVPDoxRYmAr2LDY-YoElkmOyc8oyZy1Z


The add-on needs to be published in two places:
1) GSuite Marketplace
2) Chrome Web Store

For 1) follow the instructions in https://developers.google.com/gsuite/add-ons/how-tos/publishing-editor-addons#publishing_instructions to add the "Marketplace SDK" to the project and configure the listing options there, and add the script id + version to use.

For 2) a Chrome Web Store listing needs to be created in the Chrome Web Store Developer Dashboard at https://chrome.google.com/webstore/devconsole/. This can be done from the script editor by publishing the script as a docs addon. In order to publish the addon a signup fee needs to be paid in the developer dashboard.


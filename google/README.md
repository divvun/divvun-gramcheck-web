# Sami Grammar Checker for Google Docs

The grammar checker is an add-on to Google Docs.

# Requirements

- Node.js (> 9.0)
- npm

# Development setup

- Install [nvm](https://github.com/creationix/nvm)
- Install a recent node, e.g. ```nvm install v10.14.2 && nvm use v10.14.2```
- Install [clasp](https://github.com/google/clasp) in order to build and deploy to Google's App Scripts backend.

Steps to build and deploy for your account on google:

- npm install
- clasp login (this step will open a browser on your machine to do some verification)
- clasp create (this seems optional)
- Enable Apps Script API at https://script.google.com/home/usersettings if you haven't (the next step will ask you to do this anyway)
- npm run push
- npm run open

The last step will open the App Script in Google's online editor where you can select from the menu `Run > Test as add-on...`. There you can set the script to be available for your Google user for testing purposes.

# Publishing

The add-on needs to be published in two places:
1) GSuite Marketplace
2) Chrome Web Store

For 1) follow the instructions in https://developers.google.com/gsuite/add-ons/how-tos/publishing-editor-addons#publishing_instructions to add the "Marketplace SDK" to the project and configure the listing options there, and add the script id + version to use.

For 2) a Chrome Web Store listing needs to be created in the Chrome Web Store Developer Dashboard at https://chrome.google.com/webstore/devconsole/. This can be done from the script editor by publishing the script as a docs addon. In order to publish the addon a signup fee needs to be paid in the developer dashboard.


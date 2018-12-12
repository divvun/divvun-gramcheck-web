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
- clasp create
- npm run push
- npm run open

The last step will open the App Script in Google's online editor where you can select from the menu `Run > Test as add-on...`. There you can set the script to be available for your Google user for testing purposes.

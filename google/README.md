# Sami Grammar Checker for Google Docs

The grammar checker is an add-on to Google Docs.

# Requirements

- Node.js (> 9.0)
- npm

# Development setup

This uses [clasp](https://github.com/google/clasp) in order to build and deploy to Google's App Scripts backend.

Steps to build:

1. npm install
2. npm run clasp login
3. npm run push
4. npm run open

The last step will open the App Script in Google's online editor where you can select from the menu `Run > Test as add-on...`. There you can set the script to be available for your Google user for testing purposes.

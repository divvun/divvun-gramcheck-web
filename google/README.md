# Sami Grammar Checker for Google Docs

The grammar checker is an add-on to Google Docs.

# Requirements

- Node.js (> 9.0)
- npm

# Development setup

- Install [nvm](https://github.com/creationix/nvm)
- Install a recent node, e.g. ```nvm install v10.14.2 && nvm use v10.14.2```
- Install [clasp](https://github.com/google/clasp) in order to build and deploy to Google's App Scripts backend.

If the above fails or tries something silly like downloading the source and compiling, .. and you're running on an M1 (or M*) mac, you can `arch -x86_64 /bin/zsh` first to run everything through rosetta.

Steps to build and deploy for your account on google:

- npm install
- npm run clasp login (this step will open a browser on your machine to do some verification)
- Enable Apps Script API at https://script.google.com/home/usersettings if you haven't (the next step will ask you to do this anyway)
- npm run clasp create (select 'docs')
- npm run push
- npm run open

`clasp create` will create a new doc for you. In that doc you'll see a new extension called "Google -> Grammar check".

The last step will open the App Script in Google's online editor. You used to be able to select from the menu `Run > Test as add-on...`, but that doesn't seem to be a thing anymore.

# Testing

Here. Have a sentence in davvisámegiella. There's two paragraphs on purpose. You want to make sure consecutive paragraphs are highlighted and fixed even though the errors are exactly the same. The sentence contains a quoted bit of Norwegian that triggers the grammar checker. 

```
Su váldofágadutkamuš lei sosiálapedagogihkas, fáddán ”Samisk barneoppdragelse og kjønnssosialisering”, Oslo 1986.

Su váldofágadutkamuš lei sosiálapedagogihkas, fáddán ”Samisk barneoppdragelse og kjønnssosialisering”, Oslo 1986.

```

# Publishing

The add-on needs to be published in two places:
1) GSuite Marketplace
2) Chrome Web Store

For 1) follow the instructions in https://developers.google.com/gsuite/add-ons/how-tos/publishing-editor-addons#publishing_instructions to add the "Marketplace SDK" to the project and configure the listing options there, and add the script id + version to use.

For 2) a Chrome Web Store listing needs to be created in the Chrome Web Store Developer Dashboard at https://chrome.google.com/webstore/devconsole/. This can be done from the script editor by publishing the script as a docs addon. In order to publish the addon a signup fee needs to be paid in the developer dashboard.


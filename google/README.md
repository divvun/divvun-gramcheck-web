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

- `npm install`
- `npm run clasp login` (this step will open a browser on your machine to do some verification. )
- Enable Apps Script API at https://script.google.com/home/usersettings if you haven't (the next step will ask you to do this anyway)
- `npm run clasp create "Divvun Grammar Checker"` (select 'docs')

You'll get two links. The first is the doc that's setup for you to test in. The second one is the script repo. You can run the extension now in Extensions -> Google -> Grammar check

```
> divvun-gramcheck-google-docs@1.0.0 clasp /Users/srdkvr/source/divvun/divvun-gramcheck-web/google
> clasp "create" "Divvun Grammar Checker"

(node:27080) ExperimentalWarning: The fs.promises API is experimental
? Create which script? docs
Created new Google Doc: https://drive.google.com/open?id=1XI0osST4SEXsz0kmP-2DxTs3oyZ9n8-8p7r0Nb0Iaog
Created new Google Docs Add-on script: https://script.google.com/d/1IbhhyGrrMgQuPaJaRMy0E1vvDvIHGXGYcALsS4fV5-Pge96CTt-yUI4n/edit
```

- `npm run push` (push code to the script repo )
- `npm run open` (open the script repo in online editor)


# Publishing

This project was setup using divvunuit@gmail.com. If you've done it right you should be able to see this doc https://script.google.com/home/projects/1LIO6pqCziYtTTzVFRQzA1SSCCie_5XTcnZxTHCyVvqyAugYSQiLLNQqb/edit

First you want to create a new version. Do that according to https://developers.google.com/apps-script/guides/versions#creating_a_version

Make sure your .clasp.json file has the same id as the script you just created. 
```bash
cat .clasp.json
{"scriptId":"1LIO6pqCziYtTTzVFRQzA1SSCCie_5XTcnZxTHCyVvqyAugYSQiLLNQqb"}
```

The key is gonna be:
MFVPDoxRYmAr2LDY-YoElkmOyc8oyZy1Z

When you create the new version, change the script version on https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com/googleapps_sdk?project=divvun-gapps-grammar-checker&pli=1

If it's 3 and you created version 4.. you.. update the 3 to a 4. 


The add-on needs to be published in two places:
1) GSuite Marketplace
2) Chrome Web Store

For 1) follow the instructions in https://developers.google.com/gsuite/add-ons/how-tos/publishing-editor-addons#publishing_instructions to add the "Marketplace SDK" to the project and configure the listing options there, and add the script id + version to use.

For 2) a Chrome Web Store listing needs to be created in the Chrome Web Store Developer Dashboard at https://chrome.google.com/webstore/devconsole/. This can be done from the script editor by publishing the script as a docs addon. In order to publish the addon a signup fee needs to be paid in the developer dashboard.


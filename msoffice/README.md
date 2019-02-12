# Sami Grammar Checker for MS Office Online

The grammar checker is an add-on to MS Office Online and more specifically Word.

# Requirements

- Node.js (> 9.0)
- npm

You will also need to add the self-signed certificate to your chain of trust. If you're using Chrome/Safari for Windows or macOS you can follow the instructions here: https://github.com/OfficeDev/generator-office/blob/master/src/docs/ssl.md
If you're using Firefox you can go to `Preferences` > `Privacy & Security`, then scroll to the bottom and under the `Certificates` section click on the `View Certificates` button. In the opened modal window, under the `Authorities` tab,
click `Import...` and select the file `certs/ca.crt`.

# Development setup

Steps to run this in a development environment:

1. npm install
2. npm start

This will have you running a local server at port 3000. Then depending on which Word you want to test,
you need to provide the `manifest.xml` file to Word in a different way.

## Online

You need to upload the manifest file in order to test the add-in. Follow the instructions on https://docs.microsoft.com/en-us/office/dev/add-ins/testing/sideload-office-add-ins-for-testing#sideload-an-office-add-in-in-office-online

## iPad and Mac

In order to provide your `manifest.xml` follow these instructions:
https://docs.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-ipad-and-mac

If you want to debug on the iPad or Mac, follow these instructions to get access to some debug tools and the console:
https://docs.microsoft.com/en-us/office/dev/add-ins/testing/debug-office-add-ins-on-ipad-and-mac

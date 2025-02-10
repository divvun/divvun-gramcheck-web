# Divvun grammar checker for web word processors

This repo hosts the Divvun grammar checkers for Google Docs and the web version of Microsoft Word.

You can find the respective codebases in the subfolders.

## Add-on admin links

(require admin user name etc):

- [Google](https://console.cloud.google.com/apis/dashboard?project=divvun-gapps-grammar-checker)
- [MS Office](https://partner.microsoft.com/nb-no/dashboard/office/products/c280f9cf-93a4-4916-b322-f6d3c13d955a/overview)


# Testing

Here. Have a sentence in davvisámegiella. There's two paragraphs on purpose. You want to make sure consecutive paragraphs are highlighted and fixed even though the errors are exactly the same. The sentence contains a quoted bit of Norwegian that triggers the grammar checker. 

> Su váldofágadutkamuš lei sosiálapedagogıihkas, fáddán ”Samisk barneoppdragelse og kjønnssosialisering”, Oslo 1986. 
>
> Su váldofágadutkamuš lei sosiálapedagogıihkas, fáddán  Su og váldofágadutkamuš lei sosiálapedagogihkas, fáddán ”Samisk barneoppdragelse og kjønnssosialisering”, Oslo 1986. 

It is now possible to test the API directly in the web broswer, by using a URL of the pattern `https://api-giellalt.uit.no/grammar/XXX`, where XXX is the ISO 639 code. Here are links to some grammar checkers for easy test access:

- [Faroese/føroyskt](https://api-giellalt.uit.no/grammar/fo)
- [Irish/gaeilge](https://api-giellalt.uit.no/grammar/ga)
- [Greenlandic//kalaallisut](https://api-giellalt.uit.no/grammar/kl)
- [Norwegian bokmål](https://api-giellalt.uit.no/grammar/nb)
- [North Sámi/Davvisámigiella](https://api-giellalt.uit.no/grammar/se)
- [South Sámi/Åarjelsaemien gïele](https://api-giellalt.uit.no/grammar/sma)
- [Lule Sámi/Julevsámegiella](https://api-giellalt.uit.no/grammar/smj)
- [Inari Sámi/Anarâškielâ](https://api-giellalt.uit.no/grammar/smn)
- [Skolt Sámi/Nuõrttsääʹmǩiõll](https://api-giellalt.uit.no/grammar/sms)

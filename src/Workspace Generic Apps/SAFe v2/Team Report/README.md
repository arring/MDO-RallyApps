CANNOT TEST/DEVELOP THIS EXTERNALLY
=============================
	- since not in iframe, we must send jsonp GET requests to post data to rally with cookies
	- since using GET requests, c_Dependencies is in the URL, which causes it to be too long
	- end up getting (413) Request Entity Too Large Errors when saving dependencies :(
	- sigh, time to develop the copy/paste way into Rally

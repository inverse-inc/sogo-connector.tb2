/* -*- Mode: java; tab-width: 2; c-tab-always-indent: t; indent-tabs-mode: t; c-basic-offset: 2 -*- */

function jsInclude(files, target) {
	var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader);
	for (var i = 0; i < files.length; i++) {
		try {
			loader.loadSubScript(files[i], target);
		}
		catch(e) {
			dump("CardDavAutoCompleteSession.js: failed to include '" + files[i] + "'\n" + e + "\n");
		}
	}
}

jsInclude(["chrome://sogo-connector/content/general/webdav.inverse.ca.js",
					 "chrome://sogo-connector/content/general/vcards.utils.js"]);

/***********************************************************
constants
***********************************************************/

// reference to the interface defined in inverseJSEnumerator.idl
//const inverseIJSEnumerator = CI.inverseIJSEnumerator;

// reference to the required base interface that all components must support
// const CI = Components.interfaces;
// const nsISupports = CI.nsISupports;
// const nsICardDAVAutoCompleteSession = CI.nsICardDAVAutoCompleteSession;

// const CONTRACT_ID = "@mozilla.org/autocompleteSession;1?type=carddav";
// const CLASS_ID = Components.ID("{882c2ce0-f7a2-4894-bce7-a119fb6f3c5c}");
// const CLASS_NAME = "Implementation of nsICardDAVAutoCompleteSession";

/***********************************************************
class definition
***********************************************************/

//class constructor
function CardDavAutoCompleteSession() {
	dump("CardDavAutoCompleteSession constructor!\n");
};

CardDavAutoCompleteSession.prototype = {
 mUrl: null,
 get serverURL() { return this.mUrl; },
 set serverURL(value) { this.mUrl = value },
 onAutoComplete: function(searchString, previousSearchResult, listener) {
	 dump("**************************************************************\n");
	 dump("CardDavAutoCompleteSession.prototype.onAutoComplete\n");
	 dump("**************************************************************\n");
 },
 onStartLookup: function (searchString, previousSearchResult, listener) {
	 dump("CardDavAutoCompleteSession.onStartLookup\n");
	 if (!listener) {
		 dump("NULL listener in CardDavAutoCompleteSession.prototype.onStartLookup\n");
		 // 		 listener.onAutoComplete( null, -1);//nsIAutoCompleteStatus::failed
	 }
	 else {
		 var url = getABDavURL(this.mUrl.spec);
		 if (url) {
			 var doc = cardDavReport(url, searchString);
			 var nodeList = doc.getElementsByTagName("addressbook-data");

			 // To support customs fields introduced in importFromVcard for FreeBuzy
			 var customFieldsArray;// // TODO: when the overhaul of the vcard parsing is done, this will have to be handle differently!!!

			 var resultsHash = {};
			 //Adding cards to array
			 var resultArray = Components.classes["@mozilla.org/supports-array;1"]
				 .createInstance(Components.interfaces.nsISupportsArray);
			 for (var i = 0; i < nodeList.length; i++) {
				 customFieldsArray = new Array();
				 dump("\n= autocomplete vcard : ============================\n");
				 dump(nodeList.item(i).textContent.toString());
				 dump("\n===================================================\n");
				 var card = importFromVcard(nodeList.item(i).textContent.toString(),
																		null, customFieldsArray);
				 var fn = card.displayName;
				 var email = card.primaryEmail;
				 if (email.length)
					 resultArray.AppendElement(formatAutoCompleteItem(fn, email));
				 email = card.secondEmail;
				 if (email.length)
					 resultArray.AppendElement(formatAutoCompleteItem(fn, email));
			 }

			 dump("=======> resultArray.Count: " + resultArray.Count() + "\n");

			 if (nodeList.length > 0) {
				 var matchFound = 1; //nsIAutoCompleteStatus::matchFound

				 var results =
				 Components.classes["@mozilla.org/autocomplete/results;1"]
					 .createInstance(Components.interfaces.nsIAutoCompleteResults);
				 //results.items = resultArray.QueryInterface(Components.interfaces.nsICollection);
				 results.items = resultArray;

				 results.defaultItemIndex = 0;
				 results.searchString = searchString;

				 listener.onAutoComplete(results, matchFound);
			 }
			 else {
				 var noMatch = 0; //nsIAutoCompleteStatus::noMatch
				 listener.onAutoComplete(null, noMatch);
			 }
		 }
		 else {
			 dump("no url in CardDavAutoCompleteSession.prototype.onStartLookup\n");
			 listener.onAutoComplete( null, -1);//nsIAutoCompleteStatus::failed
		 }
	 }
 },
 onStopLookup: function() {
	 dump("CardDavAutoCompleteSession.prototype.onStopLookup\n");
 },
 QueryInterface: function(aIID) {
	 if (!aIID.equals(Components.interfaces.nsICardDAVAutoCompleteSession)
			 && !aIID.equals(Components.interfaces.nsIAutoCompleteSession)
			 && !aIID.equals(Components.interfaces.nsISupports))
		 throw Components.results.NS_ERROR_NO_INTERFACE;
	 return this;
 }
};

function formatAutoCompleteItem (fn, email) {
	var item = Components.classes["@mozilla.org/autocomplete/item;1"]
		.createInstance(Components.interfaces.nsIAutoCompleteItem);
	item.className = "remote-abook";
	item.comment = fn;
// 	item.param = searchString;
	if (fn.length)
		item.value = fn + " <" + email + ">";
	else
		item.value = email;

	return item;
}

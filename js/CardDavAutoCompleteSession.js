/* CardDavAutoCompleteSession.js - This file is part of "SOGo Connector", a Thunderbird extension.
 *
 * Copyright: Inverse inc., 2006-2010
 *    Author: Robert Bolduc, Wolfgang Sourdeau
 *     Email: support@inverse.ca
 *       URL: http://inverse.ca
 *
 * "SOGo Connector" is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 as published by
 * the Free Software Foundation;
 *
 * "SOGo Connector" is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * "SOGo Connector"; if not, write to the Free Software Foundation, Inc., 51
 * Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
 */

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

    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);
    try {
        var attribute = prefService
            .getCharPref("sogo-connector.autoComplete.commentAttribute");
        if (attribute && attribute.length > 0) {
            this.commentAttribute = attribute;
            // dump("comment attribute: " + attribute + "\n");
        }
    }
    catch(e) {
    }
};

CardDavAutoCompleteSession.prototype = {
    active: false,
    listener: null,
    searchString: null,
    lastRequest: 0,
    commentAttribute: null,

    mUrl: null,
    get serverURL() { return this.mUrl; },
    set serverURL(value) { this.mUrl = value },

    onAutoComplete: function(searchString, previousSearchResult, listener) {
        dump("CardDavAutoCompleteSession.prototype.onAutoComplete: " + searchString
             + "\n");
    },
    onStartLookup: function (searchString, previousSearchResult, listener) {
        dump("CardDavAutoCompleteSession.onStartLookup\n");
        if (listener) {
            if (this.mUrl) {
                var url = this.mUrl.spec;
                if (url) {
                    this.active = true;
                    this.listener = listener;
                    this.searchString = searchString;
                    this.lastRequest = AsyncCardDavReport(url, searchString, this);
                }
                else {
                    dump("no url in CardDavAutoCompleteSession.prototype.onStartLookup\n");
                    listener.onAutoComplete(null, -1);//nsIAutoCompleteStatus::failed
                }
            }
            else {
                dump("no mUrl in CardDavAutoCompleteSession.prototype.onStartLookup\n");
                listener.onAutoComplete(null, -1);//nsIAutoCompleteStatus::failed
            }
        }
        else {
            dump("NULL listener in CardDavAutoCompleteSession.prototype.onStartLookup\n");
            // 		 listener.onAutoComplete( null, -1);//nsIAutoCompleteStatus::failed
        }
    },
    onStopLookup: function() {
        this.active = false;
        // 	 dump("CardDavAutoCompleteSession.prototype.onStopLookup\n");
    },
    onDAVQueryComplete: function(status, result, headers, data) {
        if (this.active && data == this.lastRequest && result) {
            // dump("on dav query complete... " + new Date() + "\n");
            var resultArray = Components.classes["@mozilla.org/supports-array;1"]
                                        .createInstance(Components.interfaces.nsISupportsArray);

            var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                                   .createInstance(Components.interfaces.nsIDOMParser);
            var domResult = parser.parseFromString(result, "text/xml");
            var nodeList = domResult.getElementsByTagName("addressbook-data");
            for (var i = 0; i < nodeList.length; i++) {
                var customFields = {};
                var card = importFromVcard(nodeList[i].textContent, customFields);
                var fn = card.displayName;
                var email = card.primaryEmail;
                var comment = null;
                if (this.commentAttribute)
                    comment = card[this.commentAttribute];
                if (email.length)
                    resultArray.AppendElement(formatAutoCompleteItem(fn, email, comment));
                email = card.secondEmail;
                if (email.length)
                    resultArray.AppendElement(formatAutoCompleteItem(fn, email, comment));
            }

            // 		 dump("=======> resultArray.Count: " + resultArray.Count() + "\n");

            if (nodeList.length > 0) {
                var matchFound = 1; //nsIAutoCompleteStatus::matchFound

                var results = Components.classes["@mozilla.org/autocomplete/results;1"]
                                        .createInstance(Components.interfaces.nsIAutoCompleteResults);
                results.items = resultArray;
                results.defaultItemIndex = 0;
                results.searchString = this.searchString;

                dump("sending result: " + new Date () + "\n");
                this.listener.onAutoComplete(results, matchFound);
            }
            else {
                var noMatch = 0; //nsIAutoCompleteStatus::noMatch
                this.listener.onAutoComplete(null, noMatch);
            }
        }
    },
    QueryInterface: function(aIID) {
        if (!aIID.equals(Components.interfaces.nsICardDAVAutoCompleteSession)
            && !aIID.equals(Components.interfaces.nsIAutoCompleteSession)
            && !aIID.equals(Components.interfaces.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;
        return this;
    }
};

function formatAutoCompleteItem (fn, email, comment) {
    var item = Components.classes["@mozilla.org/autocomplete/item;1"]
                         .createInstance(Components.interfaces.nsIAutoCompleteItem);
    item.className = "remote-abook";
    if (!comment)
        comment = "";
    item.comment = comment;
    // dump("comment: " + comment + "\n");
    // 	item.param = searchString;
    if (fn.length)
        item.value = fn + " <" + email + ">";
    else
        item.value = email;

    return item;
}

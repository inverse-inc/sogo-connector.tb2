/* autocomplete-common.js - This file is part of "SOGo Connector", a Thunderbird extension.
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

var SISetupLdapAutoCompleteSessionOld;

/*
 * This overlay adds cardDAV functionalities to autoCompletion
 */

function autoCompleteDirectoryIsCardDav() {
    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);
    var autocompleteDirectory = prefService.getCharPref("ldap_2.autoComplete.directoryServer");
    var uri = null;
    if (autocompleteDirectory && autocompleteDirectory.length) {
        try {
            dump("autocompleteDirectory: " + autocompleteDirectory + "\n");
            uri = prefService.getCharPref(autocompleteDirectory +".uri");
        }
        catch(e) {
        }
    }

    return (uri && uri.indexOf("carddav://") == 0);
}

function setupCardDavAutoCompleteSession() {
    var autocompleteDirectory;
    // 	var prevAutocompleteDirectory = gCurrentAutocompleteDirectory;

    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);
    var autocompleteLdap = prefService.getBoolPref("ldap_2.autoComplete.useDirectory");
    if (autocompleteLdap) {
        autocompleteDirectory
            = prefService.getCharPref("ldap_2.autoComplete.directoryServer");
    }
    else
        autocompleteDirectory = null;

    // 	if (gCurrentIdentity.overrideGlobalPref)
    // 		autocompleteDirectory = gCurrentIdentity.directoryServer;

    // use a temporary to do the setup so that we don't overwrite the
    // global, then have some problem and throw an exception, and leave the
    // global with a partially setup session.	we'll assign the temp
    // into the global after we're done setting up the session
    //
    var cardDAVSession;
    if (gLDAPSession)
        cardDAVSession = gLDAPSession;
    else
        cardDAVSession = Components.classes["@mozilla.org/autocompleteSession;1?type=carddav"]
                                   .createInstance(Components.interfaces.nsIAutoCompleteSession);

    if (!autocompleteWidgetPrefix)
        throw("no autocomplete widget prefix defined");

    if (autocompleteDirectory && !gIsOffline) {
        gCurrentAutocompleteDirectory = autocompleteDirectory;

        // fill in the session params if there is a session
        if (cardDAVSession) {
            if (!gSessionAdded) {
                // if we make it here, we know that session initialization has
                // succeeded; add the session for all recipients, and
                // remember that we've done so
                var showComment = false;
                prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                        .getService(Components.interfaces.nsIPrefBranch);
                try {
                    var attribute = prefService.getCharPref("sogo-connector.autoComplete.commentAttribute");
                    if (attribute && attribute.length > 0)
                        showComment = true;
                }
                catch(e) {
                }

                for (var i = 1; i <= awGetMaxRecipients(); i++) {
                    var autoCompleteWidget
                        = document.getElementById(autocompleteWidgetPrefix + "#" + i);
                    if (autoCompleteWidget) {
                        autoCompleteWidget.addSession(cardDAVSession);
                        autoCompleteWidget.showCommentColumn = showComment;

                        // ldap searches don't insert a default entry with the default domain appended to it
                        // so reduce the minimum results for a popup to 2 in this case.
                        // 						autoCompleteWidget.minResultsForPopup = 2;
                    }
                }
                gSessionAdded = true;
            }
        }
    }
    else {
        if (gCurrentAutocompleteDirectory) {
            // Remove observer on the directory server since we are not doing Ldap autocompletion
            // 			.RemoveDirectorySettingsObserver(gCurrentAutocompleteDirectory);
            gCurrentAutocompleteDirectory = null;
        }
        if (gLDAPSession && gSessionAdded) {
            for (var i = 1; i <= awGetMaxRecipients(); i++) {
                var autoCompleteWidget
                    = document.getElementById(autocompleteWidgetPrefix + "#" + i);
                autoCompleteWidget.removeSession(gLDAPSession);
            }
            gSessionAdded = false;
        }
    }

    if (autocompleteDirectory) {
        // 			dump("******** autocompleteDirectory: " + autocompleteDirectory + "\n");
        // 			dump(gPrefs.getCharPref(autocompleteDirectory +".uri"));
        // 			dump("\n");
        var prefix = "carddav://";
        var uri = "" + gPrefs.getCharPref(autocompleteDirectory +".uri");
        var serverURL = Components.classes["@mozilla.org/network/standard-url;1"]
                                  .createInstance(Components.interfaces.nsIURL);
        serverURL.spec = uri.substring(prefix.length);
        // 		dump("uri: " + uri + "\n");
        // 			dump("serverURL.spec: " + serverURL.spec +"\n");
        cardDAVSession.QueryInterface(Components.interfaces.nsICardDAVAutoCompleteSession)
                      .serverURL = serverURL;
    }
    else
        dump("no autocomplete directory\n");

    gLDAPSession = cardDAVSession;
    gSetupLdapAutocomplete = true;
}

function SISetupLdapAutoCompleteSession() {
    // 	dump("override called\n");
    if (autoCompleteDirectoryIsCardDav())
        setupCardDavAutoCompleteSession();
    else
        SISetupLdapAutoCompleteSessionOld();
}

// See the ComposeLoad() function in Thunderbird 2.0. It warns
// you about the showComment kungfu.
function SIComposeLoad() {
    try {
        var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                    .getService(Components.interfaces.nsIPrefBranch);
        var attribute = prefService.getCharPref("sogo-connector.autoComplete.commentAttribute");
        if (attribute && attribute.length > 0)
            document.getElementById('addressCol2#1').showCommentColumn = true;
    }
    catch(e) {
    }

    ComposeLoad();
}

function SIOnAutoCompleteLoadListener() {
    SISetupLdapAutoCompleteSessionOld = setupLdapAutocompleteSession;
    setupLdapAutocompleteSession = SISetupLdapAutoCompleteSession;
}

window.addEventListener("load", SIOnAutoCompleteLoadListener, false);

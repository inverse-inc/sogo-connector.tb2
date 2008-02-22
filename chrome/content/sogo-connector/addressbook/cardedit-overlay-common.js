/* -*- Mode: java; tab-width: 2; c-tab-always-indent: t; indent-tabs-mode: t; c-basic-offset: 2 -*- */
/********************************************************************************
 Copyright:	Inverse groupe conseil, 2006-2007
 Author: 		Robert Bolduc
 Email:		support@inverse.ca
 URL:			http://inverse.ca

 This file is part of "SOGo Connector" a Thunderbird extension.

    "SOGo Connector" is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as published by
    the Free Software Foundation;

    "SOGo Connector" is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with "SOGo Connector"; if not, write to the Free Software
    Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 ********************************************************************************/

/* <!--  <script type="application/x-javascript"
    src="chrome://sogo-connector/content/general/mozilla.utils.inverse.ca.js"/>
 <!== <script type="application/x-javascript" src="chrome://messenger/content/addressbook/abCardOverlay.js"/> ==>
  <script type="application/x-javascript"
    src="chrome://sogo-connector/content/general/implementors.addressbook.groupdav.js"/>
  <script type="application/x-javascript"
    src="chrome://sogo-connector/content/general/constants.addressbook.groupdav.js"/>
  <script type="application/x-javascript"
  src="chrome://sogo-connector/content/general/webdav_lib/webdavAPI.js"/> --> */

function jsInclude(files, target) {
	var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader);
	for (var i = 0; i < files.length; i++) {
		try {
			loader.loadSubScript(files[i], target);
		}
		catch(e) {
			dump("abCommonCardDialog.groupdav.overlay.js: failed to include '" + files[i] + "'\n" + e + "\n");
		}
	}
}

jsInclude(["chrome://sogo-connector/content/general/sync.addressbook.groupdav.js",
					 "chrome://sogo-connector/content/general/preference.service.addressbook.groupdav.js",
					 "chrome://sogo-connector/content/general/implementors.addressbook.groupdav.js"]);

/**********************************************************************************************
 *
 * This overlay marks the card as edited and tries to update the GroupDAV server if connected
 *
 **********************************************************************************************/

var documentDirty = false;

// Reference to the Addressbook window, to use functions in webdav.inverse.ca.js.
// This is necessary to allow the listener of webdavPutString  and the upload Observer to remain in scope
// since the dialog is closed before the listener can do its job.
var messengerWindow = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("mail:3pane");

var abWindow = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("mail:addressbook");

function getUri() {
	var uri;

	if (document.getElementById("abPopup"))
		uri = document.getElementById("abPopup").value;
	else if (window.arguments[0].abURI)
		uri = window.arguments[0].abURI;
	else
		uri = window.arguments[0].selectedAB;

	return uri;
}

function setDocumentDirty(boolValue) {
	documentDirty = boolValue;
}

function setGroupDavFields() {
	var card = gEditCard.card.QueryInterface(Components.interfaces.nsIAbMDBCard);
	var version = card.getStringAttribute("groupDavVersion");
	if (version && version != "") {
		var localUpdatePos = version.indexOf(LOCAL_UPDATE_FLAG);
		if (localUpdatePos == -1) {
		//Only add the flags if it's not already there
			card.setStringAttribute("groupDavVersion", version + LOCAL_UPDATE_FLAG);
		}
	}
// 	else {
// 		card.setStringAttribute("groupDavVersion"," ");
// 	}
// 	if (!card.getStringAttribute("groupDavKey")){
// 	// New Card, create key
// 		card.setStringAttribute("groupDavKey",GroupdavServerFactory.get(groupdavTypes.GroupDAV_Generic).getNewCardKey());
// 	}
}

function saveCard(isNewCard) {
	try {
		if (documentDirty
				&& isGroupdavDirectory(getUri())) {
			abWindow.UploadCard(gEditCard.card
													.QueryInterface(Components.interfaces.nsIAbMDBCard),
													getUri(), isNewCard);
			setDocumentDirty(false);
		}
		if (abWindow)
			abWindow.gSynchIsRunning = false;	
	}
	catch(e) {
		if (abWindow)
			abWindow.gSynchIsRunning = false;	
		messengerWindow.exceptionHandler(null, "saveCard", e);
	}
}

function inverseSetupFieldsEventHandlers(){
	var tabPanelElement = document.getElementById("abTabPanels");
	var menulists = tabPanelElement.getElementsByTagName("menulist");
	for (var i = 0; i < menulists.length; i++)
		menulists[i].addEventListener("mouseup", setDocumentDirty, true);

	var textboxes = tabPanelElement.getElementsByTagName("textbox"); 

	for (var i = 0; i < textboxes.length; i++)
		textboxes[i].addEventListener("change", setDocumentDirty, true);
}

function inverseInitEventHandlers() {
	if (isGroupdavDirectory(getUri()))
		RegisterSaveListener(setGroupDavFields);
	inverseSetupFieldsEventHandlers();
}

function isLDAPDirectory(uri) {
	var ab = GetDirectoryFromURI(uri);

	return (ab.isRemote && !isCardDavDirectory(uri));
}

window.addEventListener("load", inverseInitEventHandlers, false);	
/* vcards.utils.js - This file is part of "SOGo Connector", a Thunderbird extension.
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
            dump("vcards.utils.js: failed to include '" + files[i] +
                 "'\n" + e
                 + "\nFile: " + e.fileName
                 + "\nLine: " + e.lineNumber + "\n\n Stack:\n\n" + e.stack);
        }
    }
}

jsInclude(["chrome://inverse-library/content/uuid.js",
           "chrome://inverse-library/content/quoted-printable.js"]);

if (isMoreColsInstalled()) {
    try {
        jsInclude(["chrome://inverse-library/content/photo.js"]);
    }
    catch(e) {
    }
}

function escapedForCards(theString) {
    theString = theString.replace(/\\/g, "\\\\");
    theString = theString.replace(/,/g, "\\,");
    theString = theString.replace(/;/g, "\\;");
    theString = theString.replace(/,/g, "\\,");
    //  theString.replace(/\n/g, "\\n,");
    //  theString.replace(/\r/g, "\\r,");

    return theString;
}

function unescapedFromCard(theString) {
    theString = theString.replace(/\\/g, "\\");
    theString = theString.replace(/\,/g, ",");
    theString = theString.replace(/\;/g, ";");
    theString = theString.replace(/\,/g, ",");
    //  theString.replace(/\\n/g, "\n,");
    //  theString.replace(/\\r/g, "\r,");

    return theString;
}

/* this method parses a versit directory:
 - normalizing the charset and encodings;
 - returning the lines as hashes filled with the tag, parameters and values
 accurately separated;
 No support yet for embedded directories (VCALENDAR) */
function versitParse(versitString) {
    var parseResult = new Array();
    var currentLine = {};
    var isEscaped = false;
    var type = 0; /* 0 = tag, 1 = parameters, 2 = value */
    var parameters = {};
    var values = new Array();

    var tag = "";
    var parameterName = "type";
    var parameter = "";
    var value = "";

    var currentChar = 0;
    while (currentChar < versitString.length) {
        var character = versitString[currentChar];
        if (isEscaped) {
            var lowerChar = character.toLowerCase();
            if (lowerChar == "n")
                character = "\n";
            else if (lowerChar == "r")
            character = "\r";
            else if (lowerChar == "t")
            character = "\t";
            else if (lowerChar == "b")
            character = "\b";

            if (type == 0)
                tag += character;
            else if (type == 1)
            parameter += character;
            else
                value += character;
            isEscaped = false;
        }
        else {
            if (character == "\\")
                isEscaped = true;
            else {
                if (type == 0) {
                    if (character == ";") {
                        currentLine["tag"] = tag.toLowerCase();
                        parameters = {};
                        parameterName = "type";
                        parameter = "";
                        type = 1;
                    }
                    else if (character == ":") {
                        currentLine["tag"] = tag.toLowerCase();
                        values = new Array();
                        value = "";
                        type = 2;
                    }
                    else if (character == "\r" && versitString[currentChar+1] == "\n") {
                        /* some implementations do not comply and fold their lines
                         qp-style but without escaping their crlf... */
                        var lastLine = parseResult[parseResult.length-1];
                        var values = lastLine["values"];
                        var lastValue = values[values.length-1];
                        if (lastValue[lastValue.length-1] == "=") {
                            values[values.length-1]
                                = lastValue.substr(0, lastValue.length-1) + tag;
                            tag = "";
                            currentChar++;
                        }
                        else {
                            /* TEST */
			    // skip to next valid line, egroupware fuckup? b64 encoded data might have
			    // additional crlf at end.
			    while (versitString[currentChar] == "\r" || versitString[currentChar] == "\n")
    				currentChar++;
    			    character = versitString[currentChar];

                            tag+=character;
                        }
                    }
                    else
                        tag += character;
                }
                else if (type == 1) {
                    if (character == "=") {
                        parameterName = parameter.toLowerCase();
                        parameter = "";
                    }
                    else if (character == ";") {
                        if (typeof parameters[parameterName] == "undefined")
                            parameters[parameterName] = new Array();
                        parameters[parameterName].push(parameter);
                        parameterName = "type";
                        parameter = "";
                    }
                    else if (character == ":") {
                        if (typeof parameters[parameterName] == "undefined")
                            parameters[parameterName] = new Array();
                        parameters[parameterName].push(parameter);
                        currentLine["parameters"] = parameters;
                        values = new Array();
                        value = "";
                        type = 2;
                    }
                    else
                        parameter += character;
                }
                else {
                    if (character != "\r") {
                        if (character == ";") {
                            values.push(value);
                            value = "";
                        }
                        else if (character == "\n") {
                            var nextChar = versitString[currentChar+1];
                            if (typeof nextChar != "undefined" && nextChar == " ")
                                currentChar++;
                            else {
                                // 								dump("tag: ^" + currentLine["tag"] + "$\n");
                                // 								dump("value: ^" + value + "$\n");
                                values.push(value);
                                currentLine["values"] = values;
                                parseResult.push(currentLine);
                                currentLine = {};
                                tag = "";
                                type = 0;
                            }
                        }
                        else
                            value += character;
                    }
                }
            }
        }
        currentChar++;
    }

    return parseResult;
}

/* VCARD */
/**************************************************************************
 * Function to import directly the vcard.
 *
 * outParameters must be an array, to enable the fonction to pass back the value
 * of custom fields that are not part of a Thunderbird card.
 *
 **************************************************************************/
function importFromVcard(vCardString, customFields) {
    var card = null;
    if (!vCardString || vCardString == "")
        dump("'vCardString' is empty\n" + backtrace() + "\n");
    else {
        var vcard = versitParse(vCardString);
        // 	var cardDump = dumpObject(vcard);
        // 	logInfo("vcard dump:\n" + cardDump);
        card = CreateCardFromVCF(vcard, customFields);

        // dump("card content:\n" + vCardString + "\n");
    }

    return card;
}

// outParameters must be an array, to enable the fonction to pass back the value
// of custom fields that are not part of a Thunderbird card.
function CreateCardFromVCF(vcard, outParameters) {
    var version = "2.1";
    var defaultCharset = "iso-8859-1"; /* 0 = latin 1, 1 = utf-8 */
    var card = Components.classes["@inverse.ca/addressbook/volatile-abcard;1"]
                         .createInstance(Components.interfaces.nsIAbCard).wrappedJSObject;

    outParameters["fburl"] = "";
    outParameters["uid"] = "";
    outParameters["groupDavVcardCompatibility"] = "";

    for (var i = 0; i < vcard.length; i++) {
        if (vcard[i]["tag"] == "version") {
            version = vcard[i]["values"][0];
        }
    }
    if (version[0] == "3")
        defaultCharset = "utf-8";

    var photo = false;
    for (var i = 0; i < vcard.length; i++) {
        var tag = vcard[i]["tag"];
        var charset = defaultCharset;
        var encoding = null;

        if (tag == "photo")
            photo = true;
        var parameters = vcard[i]["parameters"];
        if (parameters) {
            for (var parameter in parameters) {
                if (parameter == "encoding")
                    encoding = parameters[parameter][0].toLowerCase();
                if (parameter == "charset")
                    charset = parameters[parameter][0].toLowerCase();
            }
        }
        else
            parameters = {};

        var values = decodedValues(vcard[i]["values"], charset, encoding);
        InsertCardData(card, tag, parameters, values, outParameters);
    }

    // photo removed on serverside ?
    if(isMoreColsInstalled() && !photo)
	removeOldPhoto(getPhotoCode(card));

    return card;
}

var _insertCardMethods = {
    n: function(card, parameters, values) {
        if (values[0])
            card.lastName = values[0];
        if (values[1])
            card.firstName = values[1];
    },
    fn: function(card, parameters, values) {
        card.displayName = values[0];
    },
    nickname: function(card, parameters, values) {
        card.nickName = values[0];
    },
    org: function(card, parameters, values) {
        if (values[0])
            card.company = values[0];
        if (values[1])
            card.department = values[1];
    },
    tel: function(card, parameters, values) {
        var types = [];
        if (parameters["type"]) {
            var preTypes = parameters["type"].join(",").split(",");
            for each (var preType in preTypes) {
                types.push(preType.toUpperCase());
            }
        }
        var knownType = false;
        if (types.indexOf("FAX") > -1) {
            if (types.indexOf("WORK") > -1
                || card.faxNumber.length == 0)
                card.faxNumber = values[0];
            knownType = true;
        } else if (types.indexOf("CELL") > -1) {
            card.cellularNumber = values[0];
            knownType = true;
        } else if (types.indexOf("PAGER") > -1) {
            card.pagerNumber = values[0];
            knownType = true;
        } else if (types.indexOf("HOME") > -1) {
            card.homePhone = values[0];
            knownType = true;
        } else if (types.indexOf("WORK") > -1) {
            card.workPhone = values[0];
            knownType = true;
        }
        if (!knownType)
            if (card.workPhone.length == 0)
                card.workPhone = values[0];
        else if (card.homePhone.length == 0)
        card.homePhone = values[0];
    },
    adr: function(card, parameters, values) {
        var types = new Array();
        var preTypes;
        if (parameters["type"]) {
            preTypes = parameters["type"].join(",").split(",");
        } else {
            preTypes = null;
        }
        if (preTypes)
            for (var i = 0; i < preTypes.length; i++)
                types[i] = preTypes[i].toUpperCase();
        if (types.indexOf("WORK") > -1) {
            if (values[1])
                card.workAddress2 = values[1];
            if (values[2])
                card.workAddress = values[2];
            if (values[3])
                card.workCity = values[3];
            if (values[4])
                card.workState = values[4];
            if (values[5])
                card.workZipCode = values[5];
            if (values[6])
                card.workCountry = values[6];
        }
        else {
            if (values[1])
                card.homeAddress2 = values[1];
            if (values[2])
                card.homeAddress = values[2];
            if (values[3])
                card.homeCity = values[3];
            if (values[4])
                card.homeState = values[4];
            if (values[5])
                card.homeZipCode = values[5];
            if (values[6])
                card.homeCountry = values[6];
        }
    },
    email: function(card, parameters, values) {
        var types = new Array();
        var preTypes;
        if (parameters["type"]) {
            preTypes = parameters["type"].join(",").split(",");
        } else {
            preTypes = null;
        }
        if (preTypes)
            for (var i = 0; i < preTypes.length; i++)
                types[i] = preTypes[i].toUpperCase();
        if (types.indexOf("PREF") > -1 || types.indexOf("WORK") > -1) {
            card.primaryEmail = values[0];
        }
	else if (types.indexOf("HOME") > -1) {
            card.secondEmail = values[0];
        }
        else {
            if (card.primaryEmail.length)
                card.secondEmail = values[0];
            else
                card.primaryEmail = values[0];
        }
    },
    url: function(card, parameters, values) {
        var types = new Array();
        var preTypes;
        if (parameters["type"]) {
            preTypes = parameters["type"].join(",").split(",");
        } else {
            preTypes = null;
        }
        if (preTypes)
            for (var i = 0; i < preTypes.length; i++)
                types[i] = preTypes[i].toUpperCase();
        if (types.indexOf("WORK") > -1) {
            card.webPage1 = values[0];
        } else {
            card.webPage2 = values[0];
        }
    },
    title: function(card, parameters, values) {
        card.jobTitle = values[0];
    },
    bday: function(card, parameters, values) {
        // card.birthYear = values[0];
        // card.birthMonth = values[1];
        // card.birthDay = values[2];

        // TEST/
	// deal w/ different formats.
        if (values.length == 1) {
            // remove time
            var fullDate = values[0].split("T")[0];
	    var bdayparts = "";
	    if (fullDate.indexOf("-") > -1) {
		// regular rfc2426 format
		bdayparts = fullDate.split("-");
	    }
	    else if (fullDate.indexOf("/") > -1) {
		bdayparts = fullDate.split("/");
	    }
	    if (bdayparts.length > 0) {
		card.birthYear = bdayparts[0];
		card.birthMonth = bdayparts[1];
		card.birthDay = bdayparts[2];
            }
            else {
    		card.birthYear = fullDate.substr(0, 4);
    		card.birthMonth = fullDate.substr(4, 2);
    		card.birthDay = fullDate.substr(6, 2);
            }
        }
        else {
    	    card.birthYear = values[0];
    	    card.birthMonth = values[1];
    	    card.birthDay = values[2];
    	}
    },
    "x-aim": function(card, parameters, values) {
        card.aimScreenName = values[0];
    },
    "x-mozilla-html": function(card, parameters, values) {
        if (values[0].toLowerCase() == "true")
            card.preferMailFormat = 2;
        else
            card.preferMailFormat = 1;
    },
    note: function(card, parameters, values) {
        card.notes = values.join(";");
    },
    photo: function(card, parameters, values) {
        // TEST
        if (!isMoreColsInstalled())
            return;

        // urls are not handled
        if (parameters["value"])
            return;

        var photoType = parameters["type"][0].toLowerCase();
        var photoExt = "";
        if (photoType == 'jpeg') {
            photoExt = ".jpg";
        }
        else if (photoType == 'png') {
            photoExt = ".png";
        }
        else if (photoType == 'gif') {
            photoExt = ".gif";
        }

        if (photoExt != "")
            setTempPhoto(values[0], photoExt, card);
    },
    custom1: function(card, parameters, values) {
        card.custom1 = values[0];
    },
    custom2: function(card, parameters, values) {
        card.custom2 = values[0];
    },
    custom3: function(card, parameters, values) {
        card.custom3 = values[0];
    },
    custom4: function(card, parameters, values) {
        card.custom4 = values[0];
    },
    begin: function(card, parameters, values) {
    },
    end: function(card, parameters, values) {
    }
};

function InsertCardData(card, tag, parameters, values, outParameters) {
    // 	logInfo("InsertCardData: " + tag + "\n");

    if (typeof _insertCardMethods[tag] != "undefined")
        _insertCardMethods[tag](card, parameters, values);
    else
        outParameters[tag] = values.join(";");
}

function sanitizeBase64(value) {
    // dump("oldValue:\n" + value + "\n");
    value = value.replace("\r", "", "g");
    value = value.replace("\n", "", "g");
    value = value.replace("\t", "", "g");
    value = value.replace(" ", "", "g");

    // dump("newValue:\n" + value + "\n");

    return value;
}

function decodedValues(values, charset, encoding) {
    var newValues = [];

    var decoder = new QuotedPrintableDecoder();
    decoder.charset = charset;

    for (var i = 0; i < values.length; i++) {
        var decodedValue = null;
        if (encoding) {
            //  			dump("encoding: " + encoding + "\n");
            //  			dump("initial value: ^" + values[i] + "$\n");
            if (encoding == "quoted-printable") {
                decodedValue = decoder.decode(values[i]);
            }
            else if (encoding == "base64" || encoding == "b") {
                var saneb64Value = sanitizeBase64(values[i]);
                try {
                    decodedValue = window.atob(saneb64Value);
                }
                catch(e) {
                    dump("vcards.utils.js: failed to decode value '" + i +
                         "'\n" + e
                         + "\n" + saneb64Value
                         + "\nStack:\n\n" + e.stack);
                    decodedValue = "";
                }
            }
            else {
                dump("Unsupported encoding for vcard value: " + encoding);
                decodedValue = values[i];
            }
            //  			dump("decoded: " + decodedValue + "\n");
        }
        else
            decodedValue = values[i];
        if (charset == "utf-8"
            || (encoding && (encoding == "base64" || encoding == "b")))
            newValues.push(decodedValue);
        else {
            var converter = Components.classes["@mozilla.org/intl/utf8converterservice;1"]
                                      .getService(Components.interfaces.nsIUTF8ConverterService);
            newValues.push(converter.convertStringToUTF8(decodedValue, charset, false));
        }
    }

    // 	logInfo("newValues: " + dumpObject(newValues));

    return newValues;
}

function foldedLine(line) {
    var linePart = line.substr(0, 75);
    var newLine = linePart;
    var pos = linePart.length;
    var length = line.length - linePart.length;
    while (length > 0) {
        linePart = line.substr(pos, 74);
        newLine += "\r\n " + linePart;
        pos += linePart.length;
        length -= linePart.length;
    }

    return newLine;
}

function card2vcard(oldCard) {
    var card = oldCard.QueryInterface(Components.interfaces.nsIAbMDBCard);

    var data ="";
    var vCard = ("BEGIN:VCARD\r\n"
                 + "VERSION:3.0\r\n"
                 + "PRODID:-//Inverse inc.//SOGo Connector 1.0//EN\r\n");
    var uid = card.getStringAttribute("groupDavKey");
    if (!uid || uid == "")
        uid = new UUID();
    vCard += foldedLine("UID:"+ uid) + "\r\n";

    if ((card.lastName + card.firstName) != "")
        vCard += foldedLine("N:"+ card.lastName + ";" + card.firstName) + "\r\n";

    if (card.displayName != "")
        vCard += foldedLine("FN:" + card.displayName) + "\r\n";

    if ((card.company + card.department) != "")
        vCard += foldedLine("ORG:"+card.company+";"+card.department) +"\r\n";

    if (card.nickName != "")
        vCard += foldedLine("NICKNAME:"+card.nickName)+"\r\n";

    data = foldedLine("ADR;TYPE=work:;" + card.workAddress2
                      + ";" + card.workAddress + ";" + card.workCity
                      + ";" + card.workState + ";" + card.workZipCode
                      + ";" + card.workCountry) + "\r\n";
    if (data != "ADR;TYPE=work:;;;;;;\r\n")
        vCard += data;

    data = foldedLine("ADR;TYPE=home:;" + card.homeAddress2
                      + ";" + card.homeAddress + ";" + card.homeCity
                      + ";" + card.homeState + ";" + card.homeZipCode
                      + ";" + card.homeCountry) + "\r\n";
    if (data != "ADR;TYPE=home:;;;;;;\r\n")
        vCard += data;

    if (card.workPhone != "")
        vCard += foldedLine("TEL;TYPE=work:" + card.workPhone) + "\r\n";

    if (card.homePhone != "")
        vCard += foldedLine("TEL;TYPE=home:" + card.homePhone) + "\r\n";

    if (card.cellularNumber != "")
        vCard += foldedLine("TEL;TYPE=cell:" + card.cellularNumber) + "\r\n";

    if (card.faxNumber != "")
        vCard += foldedLine("TEL;TYPE=fax:" + card.faxNumber) + "\r\n";

    if (card.pagerNumber != "")
        vCard += foldedLine("TEL;TYPE=pager:" + card.pagerNumber) + "\r\n";

    if (card.preferMailFormat != "") {
        var value = "";
        switch (card.preferMailFormat) {
        case 0:
            break;
        case 2:
            value = "TRUE";
            break;
        case 1:
            value = "FALSE";
            break;
        }
        vCard += "X-MOZILLA-HTML:" + value + "\r\n";
    }
    if (card.primaryEmail != "")
        vCard += foldedLine("EMAIL;TYPE=work:" + card.primaryEmail) + "\r\n";

    if (card.secondEmail != "")
        vCard += foldedLine("EMAIL;TYPE=home:" + card.secondEmail) + "\r\n";

    if (card.webPage2 != "")
        vCard += foldedLine("URL;TYPE=home:" + card.webPage2) + "\r\n";

    if (card.jobTitle != "")
        vCard += foldedLine("TITLE:" + card.jobTitle) + "\r\n";

    if (card.webPage1 != "")
        vCard += foldedLine("URL;TYPE=work:" + card.webPage1) + "\r\n";

    if (card.birthYear != "" && card.birthMonth != "" && card.birthDay !="")
        vCard += foldedLine("BDAY:" + card.birthYear
                            + "-" + card.birthMonth
                            + "-" + card.birthDay) + "\r\n";

    if (card.custom1 != "")
        vCard += foldedLine("CUSTOM1:" + card.custom1) + "\r\n";

    if (card.custom2 != "")
        vCard += foldedLine("CUSTOM2:" + card.custom2) + "\r\n";

    if (card.custom3 != "")
        vCard += foldedLine("CUSTOM3:" + card.custom3) + "\r\n";

    if (card.custom4 != "")
        vCard += foldedLine("CUSTOM4:" + card.custom4) + "\r\n";

    if (card.notes != "") {
        var cleanedNote = foldedLine("NOTE:"
                                     + card.notes.replace(/\n/g, "\\" + "r\\" + "n")) + "\r\n";
        vCard += cleanedNote;
    }

    // TEST
    if (isMoreColsInstalled()) {
    	var photoFile = existsPhotoForCard(card);
    	if (photoFile) {
    	    var photoBASE64 = convertPhotoFileBase64(photoFile);
    	    var photoExt = photoFile.leafName.substring(photoFile.leafName.lastIndexOf(".")).toLowerCase();
    	    if (photoExt == ".jpg") {
    		photoExt = "JPEG";
            }
    	    else if (photoExt == ".png") {
    	        photoExt = "PNG";
            }
    	    else if (photoExt == ".gif") {
    	        photoExt = "GIF";
            }

            vCard += foldedLine("PHOTO;ENCODING=b;TYPE=" + photoExt
                                + ":" + photoBASE64) + "\r\n";
    	}
    }

    if (card.aimScreenName != "")
        vCard += foldedLine("X-AIM:" + card.aimScreenName) + "\r\n";

    var fbUrl = card.getStringAttribute("calFBURL");
    if (fbUrl && fbUrl.length > 0) {
        vCard += foldedLine("FBURL:" + fbUrl) + "\r\n";
    }

    var groupDavVcardCompatibilityField = card.getStringAttribute("groupDavVcardCompatibility");
    if (groupDavVcardCompatibilityField) {
        vCard += foldedLine(groupDavVcardCompatibilityField) + "\r\n";
    }
    vCard += "END:VCARD";

    return vCard;
}

/* VLIST */
function updateListFromVList(list, vListString, cards) {
    // 	var listCard = list.QueryInterface(Components.interfaces.nsIAbCard);
    list = list.QueryInterface(Components.interfaces.nsIAbDirectory);
    var listRsrc = list.QueryInterface(Components.interfaces.nsIRDFResource);
    var uriParts = listRsrc.Value.split("/");
    var parentURI = uriParts[0] + "//" + uriParts[2];
    // 	dump("updating list: uri: " + listRsrc.Value
    // 			 + "; parentURI: " + parentURI + "\n");
    // 	dump("content:\n" + vListString + "\n");

    var listUpdated = false;

    list.addressLists.Clear();
    var parsedString = versitParse(vListString);
    for (var i = 0; i < parsedString.length; i++) {
        var line = parsedString[i];
        if (line.tag == "fn")
            list.dirName = line.values[0];
        else if (line.tag == "nickname")
        list.listNickName = line.values[0];
        else if (line.tag == "description")
        list.description = line.values[0];
        else if (line.tag == "card") {
            var card = cards[line.values[0]];
            // 			dump("card '" + line.values[0] + "': ");
            if (!card) {
                var email = line.parameters["email"][0];
                if (email) {
                    listUpdated = true;
                    card = _findCardWithEmail(cards, email);
                }
            }
            if (card)
                list.addressLists.AppendElement(card);
            else {
                listUpdated = true;
                dump("card with uid '" + line.values[0]
                     + "' was not found in directory");
            }
        }
    }

    list.editMailListToDatabase(parentURI, null);

    return listUpdated;
}

function _findCardWithEmail(cards, email) {
    var card = null;

    var cmpEmail = email.toLowerCase();

    for (var k in cards) {
        if (cards[k].primaryEmail.toLowerCase() == cmpEmail)
            card = cards[k];
    }

    return card;
}

function list2vlist(uid, list) {
    list = list.QueryInterface(Components.interfaces.nsIAbDirectory);
    var vList = ("BEGIN:VLIST\r\n"
                 + "PRODID:-//Inverse inc.//SOGo Connector 1.0//EN\r\n"
                 + "VERSION:1.0\r\n"
                 + "UID:" + uid + "\r\n");
    vList += "FN:" + list.dirName + "\r\n";
    var data = "" + list.listNickName;
    if (data.length)
        vList += "NICKNAME:" + data + "\r\n";
    var data = "" + list.description;
    if (data.length)
        vList += "DESCRIPTION:" + data + "\r\n";

    var rdf = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                        .getService(Components.interfaces.nsIRDFService);
    var ds = Components.classes["@mozilla.org/rdf/datasource;1?name=addressdirectory"]
                       .getService(Components.interfaces.nsIRDFDataSource);
    var childSrc = rdf.GetResource("http://home.netscape.com/NC-rdf#CardChild");
    var cards = ds.GetTargets(list, childSrc, false);
    while (cards.hasMoreElements()) {
        var card = cards.getNext().QueryInterface(Components.interfaces.nsIAbCard);
        var mdbCard = card.QueryInterface(Components.interfaces.nsIAbMDBCard);
        var entry = "CARD";
        var key = "" + mdbCard.getStringAttribute("groupDavKey");
        if (!key.length)
            throw "card has no GroupDAV identifier key";
        if (card.primaryEmail.length)
            entry += ";EMAIL=" + card.primaryEmail;
        if (card.displayName.length)
            entry += ";FN=" + card.displayName;
        entry += ":" + key + "\r\n";
        vList += entry;
    }

    vList += "END:VLIST";

    // 	dump("vList:\n" + vList + "\n");

    return vList;
}

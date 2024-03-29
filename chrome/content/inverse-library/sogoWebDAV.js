/* sogoWebDAV.js - This file is part of "SOGo Connector", a Thunderbird extension.
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
            dump("sogoWebDAV.js: failed to include '" + files[i] +
                 "'\n" + e
                 + "\nFile: " + e.fileName
                 + "\nLine: " + e.lineNumber + "\n\n Stack:\n\n" + e.stack);
        }
    }
}

jsInclude(["chrome://inverse-library/content/uuid.js"]);

function backtrace(aDepth) {
    var depth = aDepth || 10;
    var stack = "";
    var frame = arguments.callee.caller;

    for (var i = 1; i <= depth && frame; i++) {
        stack += i+": "+ frame.name + "\n";
        frame = frame.caller;
    }

    return stack;
}

function XMLToJSONParser(doc) {
    this._buildTree(doc);
}

XMLToJSONParser.prototype = {
    _buildTree: function XMLToJSONParser_buildTree(doc) {
        var nodeName = doc.documentElement.localName;
        this[nodeName] = [this._translateNode(doc.documentElement)];

        // 		dump("Parsed XMLToJSON object: " + dumpObject(this) + "\n");
    },
    _translateNode: function XMLToJSONParser_translateNode(node) {
        var value = null;

        if (node.childNodes.length) {
            var textValue = "";
            var dictValue = {};
            var hasElements = false;
            for (var i = 0; i < node.childNodes.length; i++) {
                var currentNode = node.childNodes[i];
                var nodeName = currentNode.localName;
                if (currentNode.nodeType
                    == Components.interfaces.nsIDOMNode.TEXT_NODE)
                    textValue += currentNode.nodeValue;
                else if (currentNode.nodeType
                         == Components.interfaces.nsIDOMNode.ELEMENT_NODE) {
                    hasElements = true;
                    var nodeValue = this._translateNode(currentNode);
                    if (!dictValue[nodeName])
                        dictValue[nodeName] = [];
                    dictValue[nodeName].push(nodeValue);
                }
            }

            if (hasElements)
                value = dictValue;
            else
                value = textValue;
        }

        return value;
    }
};

function xmlEscape(text) {
    return text.replace("&", "&amp;", "g").replace("<", "&lt;", "g");
}

function xmlUnescape(text) {
    var s = (""+text).replace(/&lt;/g, "<", "g");
    s = s.replace(/&gt;/g, ">", "g");
    s = s.replace(/&amp;/g, "&",  "g");

    return s;
}

function _parseHeaders(rawHeaders) {
    var headers = {};

    if (rawHeaders) {
        var lines = rawHeaders.split("\n");
        var currentKey = null;

        for each (var line in lines) {
            if (line.length) {
                var firstChar = line.charCodeAt(0);
                if (firstChar != 32 && firstChar != 9) {
                    var keyEnd = line.indexOf(":");
                    currentKey = line.substr(0, keyEnd).toLowerCase();
                    var values = headers[currentKey];
                    if (!values) {
                        values = [];
                        headers[currentKey] = values;
                    }
                    values.push(line.substr(keyEnd + 2));
                }
            }
        }
    }

    return headers;
}

function onXMLRequestReadyStateChange(request) {
    // 	dump("xmlreadystatechange: " + request.readyState + "\n");
    if (request.readyState == 4) {
        if (request.client.target) {
            var status = 499;
            try {
                status = request.status;
            }
            catch(e) { dump("trapped exception: " + e + "\n"); }

            try {
                // 				dump("method: " + request.method + "\n");
                // 				dump("status code: " + request.readyState + "\n");
                var headers;
                var response;
                if (status == 499) {
                    headers = {};
                    response = "";
                    dump("received status 499 for url: " + request.client.url + "\n");
                }
                else {
                    headers = _parseHeaders(request.getAllResponseHeaders());
                    if (request.client.requestJSONResponse) {
                        var flatCType;
                        if (headers["content-type"]) {
                            flatCType = headers["content-type"][0];
                        } else {
                            flatCType = "";
                        }

                        /* The length must be > 0 to avoid attempts of passing empty
                         responses to the XML parser, which would trigger an
                         exception. */
                        var flatCLength;
                        if (headers["content-length"]) {
                            flatCLength = parseInt(headers["content-length"][0]);
                        } else {
                            if (request.responseText) {
                                /* The "Content-Length" header may not be present, for example
                                 with a chunked transfer encoding. In that case we deduce
                                 the length from the response string. */
                                flatCLength = request.responseText.length;
                            }
                            else {
                                dump("sogoWebDAV.js: response has no content-length"
                                     + " and no response text\n");
                                flatCLength = 0;
                            }
                        }
                        if ((flatCType.indexOf("text/xml") == 0
                             || flatCType.indexOf("application/xml") == 0)
                            && flatCLength > 0 && request.responseXML) {
                            var parser = new XMLToJSONParser(request.responseXML);
                            response = parser;
                        }
                        else {
                            response = null;
                        }
                    }
                    else
                        response = request.responseText;
                }

                request.client.target.onDAVQueryComplete(status,
                                                         response,
                                                         headers,
                                                         request.client.cbData);
            }
            catch(e) {
                dump("sogoWebDAV.js 1: an exception occured\n" + e + "\n"
                     + e.fileName + ":" + e.lineNumber + "\n");
            }
        }
        request.client = null;
        request.onreadystatechange = null;
    }
}

function sogoWebDAV(url, target, data, asynchronous) {
    this.url = url;
    this.target = target;
    this.cbData = data;
    this.requestJSONResponse = false;
    this.asynchronous = true; /* FIXME */
}

sogoWebDAV.prototype = {
    _sendHTTPRequest: function(method, parameters, headers) {
        var xmlRequest = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
                                   .createInstance(Components.interfaces.nsIXMLHttpRequest);

        xmlRequest.open(method, this.url, this.asynchronous);
        if (headers) {
            for (var header in headers)
                xmlRequest.setRequestHeader(header, headers[header]);
        }
        xmlRequest.url = this.url;
        xmlRequest.client = this;
        xmlRequest.method = method;

        var thisRequest = xmlRequest;
        xmlRequest.onreadystatechange = function() {
            onXMLRequestReadyStateChange(thisRequest);
        };

        xmlRequest.send(parameters);
    },

    load: function(operation, parameters) {
        if (operation == "GET") {
            this._sendHTTPRequest(operation);
        }
        else if (operation == "PUT") {
            this._sendHTTPRequest(operation, parameters.data,
                                  { "content-type": parameters.contentType });
        }
        else if (operation == "PROPFIND") {
            var headers = { "depth": (parameters.deep
                                      ? "1": "0"),
                            "content-type": "application/xml; charset=utf8" };
            var query = this._propfindQuery(parameters.props);
            dump("PROPFIND query: " + query);
            this._sendHTTPRequest(operation, query, headers);
        }
        else if (operation == "REPORT") {
            // 			dump("REPORT: " + parameters.deep);
            var headers = { "depth": (parameters.deep
                                      ? "1": "0"),
                            "Connection": "TE",
                            "TE": "trailers",
                            "content-type": "application/xml; charset=utf8" };
            this._sendHTTPRequest(operation, parameters.query, headers);
        }
        else if (operation == "POST") {
            this._sendHTTPRequest(operation, parameters);
        }
        else if (operation == "MKCOL") {
            this._sendHTTPRequest(operation, parameters);
        }
        else if (operation == "DELETE") {
            this._sendHTTPRequest(operation, parameters);
        }
        else if (operation == "PROPPATCH") {
            this._sendHTTPRequest(operation, parameters);
        }
        else if (operation == "OPTIONS") {
            this._sendHTTPRequest(operation, parameters);
        }
        else
            throw ("operation '" + operation + "' is not currently supported");
    },
    get: function() {
        this.load("GET");
    },
    put: function(data, contentType) {
        this.load("PUT", {data: data, contentType: contentType});
    },
    _propfindQuery: function(props) {
        var nsDict = { "DAV:": "D" };
        var propPart = "";
        var nsCount = 0;
        for each (var prop in props) {
            var propParts = prop.split(" ");
            var ns = propParts[0];
            var nsS = nsDict[ns];
            if (!nsS) {
                nsS = "x" + nsCount;
                nsDict[ns] = nsS;
                nsCount++;
            }
            propPart += "<" + nsS + ":" + propParts[1] + "/>";
        }
        var query = ("<?xml version=\"1.0\"?>\n"
                     + "<D:propfind");
        for (var ns in nsDict)
            query += " xmlns:" + nsDict[ns] + "=\"" + ns + "\"";
        query += ("><D:prop>" + propPart + "</D:prop></D:propfind>");

        return query;
    },
    options: function() {
        this.load("OPTIONS");
    },
    propfind: function(props, deep) {
        this.requestJSONResponse = true;
        if (typeof deep == "undefined")
            deep = true;
        this.load("PROPFIND", {props: props, deep: deep});
    },
    mkcol: function() {
        this.load("MKCOL");
    },
    delete: function() {
        this.load("DELETE");
    },
    report: function(query, deep) {
        if (typeof deep == "undefined")
            deep = true;
        this.load("REPORT", {query: query, deep: deep});
    },
    post: function(query) {
        this.load("POST", query);
    },
    proppatch: function(query) {
        this.requestJSONResponse = true;
        this.load("PROPPATCH", query);
    }
};

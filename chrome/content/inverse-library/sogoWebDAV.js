/* -*- Mode: java; tab-width: 2; c-tab-always-indent: t; indent-tabs-mode: t; c-basic-offset: 2 -*- */
var context = initContext();

function initContext() {
	var handler = Components.classes['@inverse.ca/context-manager;1']
		.getService(Components.interfaces.inverseIJSContextManager).wrappedJSObject;
	var newContext = handler.getContext("inverse.ca/sogoWebDAV");

	if (!newContext.sogoWebDAVPendingRequests) {
 		newContext.sogoWebDAVPendingRequests = new Array();
 		newContext.sogoWebDAVPending = false;
 	}

	return newContext;
}

function _processPending() {
	context.sogoWebDAVPending = false;
	dump("pending length: " + context.sogoWebDAVPendingRequests.length + "\n");
	if (context.sogoWebDAVPendingRequests.length) {
		// 		dump("processing next query...\n");
		var request = context.sogoWebDAVPendingRequests.shift();
		var newWebDAV = new sogoWebDAV(request.url, request.target,
																	 request.data, request.asynchronous);
		newWebDAV.load(request.operation, request.parameters);
	}
}

function onXmlRequestReadyStateChange(request) {
	// 	dump("xmlreadystatechange: " + request.readyState + "\n");
	if (request.readyState == 4) {
		request.target.onDAVQueryComplete(request.status,
																			request.responseText,
																			request.cbData);
		_processPending();
	};
}

function sogoWebDAV(url, target, data, asynchronous) {
  this.url = url;
  this.target = target;
  this.cbData = data;
  this.asynchronous = true; /* FIXME */
	this.testWebDAV();
}

sogoWebDAV.prototype = {
 realLoad: function(operation, parameters) {
// 		dump("dav operation: " + operation + "\n");
		context.sogoWebDAVPending = true;
    var webdavSvc = Components.classes['@mozilla.org/webdav/service;1']
    .getService(Components.interfaces.nsIWebDAVService);
    var requestor = new InterfaceRequestor();
    
    var url = Components.classes['@mozilla.org/network/standard-url;1']
    .getService(Components.interfaces.nsIURI);
    url.spec = this.url;

    var listener = new sogoWebDAVListener(this.target);
		listener.cbData = this.cbData;

		var ourClosure = Components.classes['@mozilla.org/supports-string;1']
		.createInstance(Components.interfaces.nsISupportsString);
		ourClosure.data = "sogoWebDAV";
    var resource
		= new sogoWebDAVResource(url.QueryInterface(Components.interfaces.nsIURL));
    if (operation == "GET")
      webdavSvc.getToString(resource, listener,
														requestor, ourClosure);
		else if (operation == "PUT") {
			var stream = Components.classes['@mozilla.org/io/string-input-stream;1']
				.createInstance(Components.interfaces.nsIStringInputStream);
			var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
				.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
			converter.charset = "UTF-8";
			var stringUTF8 = converter.ConvertFromUnicode(parameters.data);
			stream.setData(stringUTF8, stringUTF8.length);

			webdavSvc.put(resource, parameters.contentType, stream,
										listener, requestor, ourClosure);
		}
    else if (operation == "PROPFIND")
      webdavSvc.getResourceProperties(resource,
																			parameters.props.length,
																			parameters.props,
																			parameters.deep, listener,
																			requestor, ourClosure);
    else if (operation == "REPORT")
      webdavSvc.report(resource, parameters, false,
											 listener, requestor, ourClosure);
		else if (operation == "POST") {
			var xmlRequest = new XMLHttpRequest();
			xmlRequest.open("POST", this.url, this.asynchronous);
			xmlRequest.url = this.url;
			xmlRequest.onreadystatechange = function() {
				onXmlRequestReadyStateChange(xmlRequest);
			};
			xmlRequest.target = this.target;
			xmlRequest.cbData = this.cbData;
			xmlRequest.send(parameters);
		}
    else
      throw ("operation '" + operation + "' is not currently supported");
  },
 load: function(operation, parameters) {
    if (context.sogoWebDAVPending)
			context.sogoWebDAVPendingRequests.push({url: this.url,
																							target: this.target,
																							data: this.cbData,
																							asynchronous: this.asynchronous,
																							operation: operation,
																							parameters: parameters});
    else
      this.realLoad(operation, parameters);
  },
 propfind: function(props, deep) {
		if (typeof deep == "undefined")
			deep = true;
    this.load("PROPFIND", {props: props, deep: deep});
  },
 get: function() {
    this.load("GET");
  },
 put: function(data, contentType) {
		this.load("PUT", {data: data, contentType: contentType});
	},
 report: function(query) {
		var fullQuery = ('<?xml version="1.0" encoding="UTF-8"?>\n'
										 + query.toXMLString());
		var xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
		.getService(Components.interfaces.nsIDOMParser);
		var queryDoc = xParser.parseFromString(fullQuery, "application/xml");

		this.load("REPORT", queryDoc);
  },
 post: function(query) {
		var fullQuery = ('<?xml version="1.0" encoding="UTF-8"?>\n'
										 + query.toXMLString());
		var xParser = Components.classes['@mozilla.org/xmlextras/domparser;1']
		.getService(Components.interfaces.nsIDOMParser);
		var queryDoc = xParser.parseFromString(fullQuery, "application/xml");

		this.load("POST", queryDoc);
  },
 testWebDAV: function() {
		if (!context.webdavAvailability) {
			try {
				var webdavSvc = Components.classes['@mozilla.org/webdav/service;1']
				.getService(Components.interfaces.nsIWebDAVService);
				context.webdavAvailability = "available";
			}
			catch(e) {
				context.webdavAvailability = "unavailable";
			}
		}

		if (context.webdavAvailability == "unavailable")
			throw "@mozilla.org/webdav/service;1 is unavailable";
	}
};

function sogoWebDAVResource(url) {
	this.mResourceURL = url;
	this.mLockToken = "sogoWebDAV";
}

sogoWebDAVResource.prototype = {
 mResourceURL: {},
 get lockToken() {
	 return this.mLockToken;
 },
 get resourceURL() {
   return this.mResourceURL;
 },
 QueryInterface: function(iid) {
   if (iid.equals(Components.interfaces.nsIWebDAVResource)
			 || iid.equals(Components.interfaces.nsIWebDAVResourceWithLock)
			 || iid.equals(Components.interfaces.nsISupports)) {
     return this;
   }
   throw Components.interfaces.NS_ERROR_NO_INTERFACE;
 }
};

function sogoWebDAVListener(target) {
  this.target = target;
  this.result = null;
}

sogoWebDAVListener.prototype = {
 QueryInterface: function (aIID) {
    if (!aIID.equals(Components.interfaces.nsISupports)
				&& !aIID.equals(Components.interfaces.nsIWebDAVOperationListener)) {
      throw Components.results.NS_ERROR_NO_INTERFACE;
    }
    return this;
  },
 _isOurResource: function(resource) {
		var isOurs = false;
		var newrsrc;

		try {
			newrsrc
				= resource.QueryInterface(Components.interfaces.nsIWebDAVResourceWithLock);
			isOurs = (newrsrc.lockToken == "sogoWebDAV");
		}
		catch(e) {};

		return isOurs;
	},
 onOperationComplete: function(aStatusCode, aResource, aOperation,
															 aClosure) {
		if (this._isOurResource(aResource)) {
			this.target.onDAVQueryComplete(aStatusCode, this.result, this.cbData);
			this.result = null;
			_processPending();
		}
		else
			dump("skipping operation complete\n");
  },
 _isOurClosure: function(closure) {
		var isOurs = false;
		var newClosure;
		try {
			newClosure
				= closure.QueryInterface(Components.interfaces.nsISupportsString);
			if (newClosure.toString() == "sogoWebDAV")
				isOurs = true;
		}
		catch(e) {};

		return isOurs;
	},
 onOperationDetail: function(aStatusCode, aResource, aOperation, aDetail,
														 aClosure) {
		if (this._isOurClosure(aClosure)) {
// 			dump("detail resource: " + aResource.spec + "\n");
			var url = aResource.spec;
			// 		dump("status: " + aStatusCode + "; operation: " + aOperation + "\n");
			if (aStatusCode > 199 && aStatusCode < 300) {
				switch (aOperation) {
				case Components.interfaces.nsIWebDAVOperationListener.GET_TO_STRING:
					if (!this.result)
						this.result = "";
					var utf8String = "";
					var converter = Components.classes["@mozilla.org/intl/utf8converterservice;1"]
						.getService(Components.interfaces.nsIUTF8ConverterService);
					utf8String = converter.convertStringToUTF8(aDetail.QueryInterface(Components.interfaces.nsISupportsCString).toString(),
																										 "iso-8859-1", false);
					this.result += utf8String;
					break;
				case Components.interfaces.nsIWebDAVOperationListener.GET_PROPERTIES:
// 					dump("GET_PROPERTIES\n");
					if (!this.result)
						this.result = {};
					if (!this.result[url])
						this.result[url] = {};
					this.getProperties(this.result[url], aDetail);
					break;
				case Components.interfaces.nsIWebDAVOperationListener.REPORT:
					if (!this.result)
						this.result = new Array();
					this.result.push(aDetail);
					break;
				case Components.interfaces.nsIWebDAVOperationListener.PUT:
					this.result = aDetail;
					break;
				}
			}
    }
		else
			dump("skipping operation detail\n");
  },
 getProperties: function(hash, aDetail) {
    var text = "";

    var properties
    = aDetail.QueryInterface(Components.interfaces.nsIProperties);
    var count = {};
    var keys = properties.getKeys(count);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value
				= properties.get(key, Components.interfaces.nsISupportsString);
      hash[key] = value;
    }
  }
};

function InterfaceRequestor() {
}

InterfaceRequestor.prototype = { 
 QueryInterface: function (aIID) {
    if (!aIID.equals(Components.interfaces.nsISupports) &&
				!aIID.equals(Components.interfaces.nsIInterfaceRequestor)) {
      throw Components.results.NS_ERROR_NO_INTERFACE;
    }

    return this;
  },
 getInterface: function(iid) {
		// 		dump("Components: " + Components + "\n");
    if (iid.equals(Components.interfaces.nsISupports)
				|| iid.equals(Components.interfaces.nsIAuthPrompt)
				|| (iid.equals(Components.interfaces.nsIAuthPrompt2) && !isOnBranch)) {
      return Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
      .getService(Components.interfaces.nsIWindowWatcher)
      .getNewAuthPrompter(null);
    }
    else if (iid.equals(Components.interfaces.nsIProgressEventSink)
						 || iid.equals(Components.interfaces.nsIChannelEventSink)
						 || iid.equals(Components.interfaces.nsIHttpEventSink)
						 || iid.equals(Components.interfaces.nsIDocShellTreeItem)) {
      return this;
    }
    else if (iid.equals(Components.interfaces.nsIPrompt)
						 || iid.equals(Components.interfaces.nsIAuthPromptProvider)) {
      // use the window watcher service to get a nsIPrompt impl
      return Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
      .getService(Components.interfaces.nsIWindowWatcher)
      .getNewPrompter(null);
    }
    dump ("sogoWebDAV.js: no interface in requestor: " + iid + "\n");
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

 /* stubs */
 // nsIProgressEventSink
 onProgress: function onProgress(aRequest, aContext, aProgress, aProgressMax) {},
 onStatus: function onStatus(aRequest, aContext, aStatus, aStatusArg) {},
 // nsIDocShellTreeItem
 findItemWithName: function findItemWithName(name, aRequestor,
																						 aOriginalRequestor) {},
 
 // nsIHttpEventSink
 onRedirect: function(oldChannel, newChannel) {
		dump("sogoWebDAV.js: onRedirect...\n");
	},

 // nsIChannelEventSink
 onChannelRedirect: function(oldChannel, newChannel, flags) {
		dump("sogoWebDAV.js: onChannelRedirect...\n");
	}
};

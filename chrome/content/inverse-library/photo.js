/*
     copied from MoreFunctionsForAddressBook extension (https://nic-nac-project.org/~kaosmos/index-en.html)
*/     

var MFphotoStrBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                .getService(Components.interfaces.nsIStringBundleService);
var MFphotoBundle = MFphotoStrBundle.createBundle("chrome://morecols/locale/morecols.properties");

function getNoImgLabel() {
	return MFphotoBundle.GetStringFromName("noimg");
}

function getPhotoCode(card) {
	// In this first version, photo filename is taken from email address
	if (card || document.location.href == "chrome://messenger/content/addressbook/addressbook.xul") {
		if (! card)
			card = GetSelectedCard();
		if (card.primaryEmail != "") 
			var val = card.primaryEmail;
		else if (card.displayName != "")
			var val = card.displayName;
		else
			return false;
		}
	else {
		// This is used when we have a new card, that has not a card object yet
		if (document.getElementById("PrimaryEmail").value != "") 
			var val = document.getElementById("PrimaryEmail").value;
		else if (document.getElementById("DisplayName").value != "")
			var val = document.getElementById("DisplayName").value;
		else
			return false;
	}
	// Double encoding in filename: first is escaped, then is converted in base64
	// This to avoid non ascii character in filename
	var val_encoded = btoa(escape(val));
	val_encoded = val_encoded.replace(/=/g, "");
	return val_encoded;
}

function addPhoto(photoFile, photocode) { 
	if (! photoFile)
		photoFile = existsPhotoForCard();
	var image = document.getElementById("pic");
	if (! photoFile) {
		// No photo file
		image.src = "";
		image.width = 0;
		image.height = 0;
		image.file = null;
		document.getElementById("imgpath").value = getNoImgLabel();
		document.getElementById("sizebox").collapsed = true;
		return;
	}
	// Load photo file
	if (photocode)
		var imgFilename = photocode;
	else
		var imgFilename = photoFile.leafName;
	var url = "file:///"+photoFile.path;
	// On Linux and Mac Osx we have one slash more
	url = url.replace("file:////", "file:///");
	document.getElementById("photo-container").collapsed = true;
	removeUriFromImgCache(url);
	image.setAttribute("src", url);
	image.addEventListener("load", MyImageLoaded, true);
	image.file = photoFile;
	document.getElementById("photo-container").appendChild(image);
	document.getElementById("imgpath").value = imgFilename;
	document.getElementById("imgsize").value = formatImageSize(photoFile);
	document.getElementById("sizebox").removeAttribute("collapsed");
}

function formatImageSize(file) {
	var lab = " bytes";
	var size = file.fileSize;
	if (size > 1024) {
		size = parseInt(size/1024);
		lab = " kb";
	}
	if (size > 1024) {
		size = parseInt(size/1024);
		lab = " gb";
	}
	return size+lab;
}
	

function MyImageLoaded() {
	var moreColsPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	// Resize image with a maximum of 250px width/height
	var limit = moreColsPrefs.getIntPref("morecols.contact.photo_max_pixels");
	if (limit > 500)
		limit = 500;
	else if (limit < 100)
		limit = 100;
	var img = document.getElementById("pic");
	var max = img.naturalHeight > img.naturalWidth ? img.naturalHeight : img.naturalWidth;
	if (max > limit)
		var ratio = limit/max;
	else
		var ratio = 1;
	img.height = img.naturalHeight * ratio;
	img.width = img.naturalWidth * ratio;
	var style = "max-height:"+img.naturalHeight*ratio+"px; max-width:"+img.naturalWidth*ratio+"px;";
	img.setAttribute("style", style);
	document.getElementById("photo-container").removeAttribute("collapsed");
}

function removeOldPhoto(photocode) {
	if (! photocode)
		return;
	var photofile = Components.classes["@mozilla.org/file/directory_service;1"]
		.getService(Components.interfaces.nsIProperties)
		.get("ProfD", Components.interfaces.nsIFile);
	photofile.append("ABphotos");
	var extArray = [".jpg", ".png", ".gif", "jpeg"];
	for (var i=0;i<extArray.length;i++) {
		var photofileclone = photofile.clone();
		photofileclone.append(photocode+extArray[i]);
		if (photofileclone.exists()) {
			photofileclone.remove(false);
			break;
		}
	}
}

function delPhoto() {
	var photocode = getPhotoCode(null);
	removeOldPhoto(photocode);
	document.getElementById("pic").file = null;
	document.getElementById("imgpath").value = getNoImgLabel();
	document.getElementById("photo-container").collapsed = true;
	refreshMainWindowPanel();
}

function setPhoto(file,card) {
	if (document.getElementById("PrimaryEmail").value == "" && document.getElementById("DisplayName").value == "") {
		alert(MFphotoBundle.GetStringFromName("nonameforpic"));
		return;
	}		
	var noPhoto = true;
	if (! file)
		file = getFileFromFilePicker("Set Photo", "Open","all");
	if (! file)
		return;
	if (card)
		ABcopyPhotoFile(file,card);
	else
		setTimeout(addPhoto, 300, file,  file.leafName);
}


function removeUriFromImgCache(uri) {
	try {
		// Remove the image URL from image cache so it loads fresh
		//  (if we don't do this, loads after the first will always use image cache
		//   and we won't see image edit changes or be able to get actual width and height)
    
		var IOService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		var nsuri = IOService.newURI(uri, null, null);
		var imgCacheService = Components.classes["@mozilla.org/image/cache;1"].getService();
		var imgCache = imgCacheService.QueryInterface(Components.interfaces.imgICache);

		// This returns error if image wasn't in the cache; ignore that
		imgCache.removeEntry(nsuri);
	} catch(e) {}
}

function existsPhotoForCard(card) {
	var photocode = getPhotoCode(card);
	if (! photocode)
		return false;
	var extArray = [".jpg", ".png", ".gif", ".jpeg"];
	var photofile = Components.classes["@mozilla.org/file/directory_service;1"]
		.getService(Components.interfaces.nsIProperties)
		.get("ProfD", Components.interfaces.nsIFile);
	photofile.append("ABphotos");
	if (! photofile.exists())
		photofile.create(1,0775);
	for (var i=0;i<extArray.length;i++) {
		var photofileclone = photofile.clone();
		photofileclone.append(photocode+extArray[i]);
		if (photofileclone.exists()) 
			return photofileclone;
	}
	return false;
}

function ABcopyPhotoFile(file,card) {
	var ext = file.leafName.substring(file.leafName.lastIndexOf("."));
	var newCode = getPhotoCode(card);
	var newName = newCode + (ext.toLowerCase());
	var photoDir = Components.classes["@mozilla.org/file/directory_service;1"]
	.getService(Components.interfaces.nsIProperties)
	.get("ProfD", Components.interfaces.nsIFile);
	photoDir.append("ABphotos");
	if (! photoDir.exists())
		photoDir.create(1,0775);
	removeOldPhoto(newCode);
	file.copyTo(photoDir,newName);
}

function correctPhotoSrc() {
	// This function is called when the OK button is pressed
	var file = document.getElementById("pic").file;
	if (file) {
		var oldName = document.getElementById("imgpath").value;
		var extNew = file.leafName.substring(file.leafName.lastIndexOf("."));
		var newCode = getPhotoCode(null);
		var newName = newCode + (extNew.toLowerCase());
		if (oldName == newName) 
			return;
		var photoDir = Components.classes["@mozilla.org/file/directory_service;1"]
		.getService(Components.interfaces.nsIProperties)
		.get("ProfD", Components.interfaces.nsIFile);
		photoDir.append("ABphotos");
		if (! photoDir.exists())
			photoDir.create(1,0775);
		removeOldPhoto(newCode);
		file.copyTo(photoDir,newName);
	}
	refreshMainWindowPanel();
}

function refreshMainWindowPanel() {
	var win = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService	 (Components.interfaces.nsIWindowMediator).getMostRecentWindow("mail:addressbook");
	if (win)
		win.document.getElementById("abResultsTree").view.selectionChanged();
}
	
function convertPhotoFileBase64(file) {
	var istream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                        .createInstance(Components.interfaces.nsIFileInputStream);
	istream.init(file, -1, -1, false);
	var bstream = Components.classes["@mozilla.org/binaryinputstream;1"]
                        .createInstance(Components.interfaces.nsIBinaryInputStream);
	bstream.setInputStream(istream);
	var bytes = bstream.readBytes(bstream.available());
	var b64 = btoa(bytes);
	return b64;
}

function setTempPhoto(photoCode,photoExt,card) {
	try {
		//var photoCode = atob(str);
		var file = Components.classes["@mozilla.org/file/directory_service;1"]
                     .getService(Components.interfaces.nsIProperties)
                     .get("TmpD", Components.interfaces.nsIFile);
		var tempName = "photo"+photoExt;
		file.append(tempName);
		var stream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"]
                       .createInstance(Components.interfaces.nsIFileOutputStream);
		stream.init(file, 0x04 | 0x08 | 0x20, 0600, 0);
		stream.write(photoCode, photoCode.length);
		if (stream instanceof Components.interfaces.nsISafeOutputStream) {
			stream.finish();
		} else {
			stream.close();
		}
		setPhoto(file,card);
	}
	catch(e) {
	    dump(e);
    }
}

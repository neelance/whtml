var WHTML = {
  parts: {},
  customTags: {},
  
  initPage: function() {
    this.loadPart("page", document.getElementsByTagName('body')[0]);
  },
  
  loadPart: function(url, parent) {
    if(!WHTML.parts[url]) {
      WHTML.parts[url] = new WHTML.Part(url);
    }
    WHTML.parts[url].whenLoaded(function() {
      WHTML.parts[url].create(parent);
    });
  }
};

WHTML.Part = function(url) {
  this.loaded = false;
  this.loadCallbacks = [];
  
  var e = document.createElement("script");
  e.type = "text/javascript";
  e.src = url + ".js";
  part = this;
  document.getElementsByTagName('head')[0].appendChild(e);
}

WHTML.Part.prototype = {
  whenLoaded: function(callback) {
    if(this.loaded) {
      callback();
    } else {
      this.loadCallbacks.push(callback);
    }
  },
  
  scriptLoaded: function() {
    this.loaded = true;
    for(var i = 0; i < this.loadCallbacks.length; i++) {
      this.loadCallbacks[i]();
    }
  },
  
  dynamicSetAttribute: function(target, name, valueFunc) {
    Element.writeAttribute(target, name, valueFunc());
  }
}

WHTML.CustomTagFunctions = {
  dynamicSetAttribute: function(target, name, valueFunc, dependencies) {
    var f = function() {
      Element.writeAttribute(target, name, valueFunc());
    };
    f.call(this);
    
    for(var i = 0; i < dependencies.length; i++) {
      this.attrChangeListeners[dependencies[i]].push(f);
    }
  },
  
  attributeChanged: function(name) {
    listeners = this.attrChangeListeners[name];
    for(var i = 0; i < listeners.length; i++) {
      listeners[i]();
    }
  }
}

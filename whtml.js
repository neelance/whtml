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
  },
  
  dynamicCreateElement: function(name, parent, childFunc) {
    var element = document.createElement(name);
    childFunc(element);
    parent.appendChild(element);
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
  
  dynamicCreateElement: function(name, parent, dependencies, childFunc) {
    var element = document.createElement(name);
    childFunc(element);
    parent.appendChild(element);
    
    for(var i = 0; i < dependencies.length; i++) {
      this.attrChangeListeners[dependencies[i]].push(function() {
        var newElement = document.createElement(name);
        childFunc(newElement);
        parent.replaceChild(newElement, element);
        element = newElement;
      });
    }
  },
  
  attributeChanged: function(name) {
    var listeners = this.attrChangeListeners[name];
    for(var i = 0; i < listeners.length; i++) {
      listeners[i]();
    }
  }
}

WHTML.Case = function(parent, valueFunc) {
  this.parent = parent;
  this.valueFunc = valueFunc;
}
WHTML.Case.prototype = {
  getValue: function() {
    return this.valueFunc();
  },
  
  when: function(condFunc) {
    return new WHTML.When(this, condFunc);
  }
}

WHTML.When = function(caseElement, condFunc) {
  this.caseElement = caseElement;
  this.condFunc = condFunc;
  this.result = caseElement.getValue() == condFunc();
}
WHTML.When.prototype = {
  appendChild: function(child) {
    if(this.result) {
      this.caseElement.parent.appendChild(child);
    }
  }
}

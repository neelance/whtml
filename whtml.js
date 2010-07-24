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
  },
  
  dynamicAttributeFor: function(target, name) {
    var attr = Element.retrieve(target, "dynamicAttribute_" + name);
    if(!attr) {
      attr = new WHTML.DynamicAttribute(target, name);
      Element.store(target, "dynamicAttribute_" + name, attr);
    }
    return attr;
  }
};

WHTML.Part = Class.create({
  initialize: function(url) {
    this.loaded = false;
    this.loadCallbacks = [];
    
    var e = document.createElement("script");
    e.type = "text/javascript";
    e.src = url + ".js";
    document.getElementsByTagName('head')[0].appendChild(e);
  },

  whenLoaded: function(callback) {
    if(this.loaded) {
      callback();
    } else {
      this.loadCallbacks.push(callback);
    }
  },
  
  scriptLoaded: function() {
    this.loaded = true;
    this.loadCallbacks.invoke('call');
  }
});

WHTML.Dynamic = Class.create({
  initialize: function() {
    this.currentDependencies = [];
    this.depFunc = null;
  },
  
  updateDependencies: function() {
    this.currentDependencies.invoke('removeListener',this);
    this.currentDependencies = this.depFunc.call(this);
    this.currentDependencies.invoke('addListener', this);
  }
});

WHTML.DynamicAttribute = Class.create(WHTML.Dynamic, {
  initialize: function($super, target, name) {
    $super();
    this.target = target;
    this.name = name;
    this.valueFunc = null;
  },
  
  set: function(valueFunc, depFunc) {
    this.valueFunc = valueFunc;
    this.depFunc = depFunc;
    this.update();
  },
  
  update: function() {
    Element.writeAttribute(this.target, this.name, this.valueFunc());
    this.updateDependencies();
  }
});

WHTML.DynamicElement = Class.create(WHTML.Dynamic, {
  initialize: function($super, name, parent, depFunc, childFunc) {
    $super();
    this.name = name;
    this.parent = parent;
    this.depFunc = depFunc;
    this.childFunc = childFunc;
    this.currentElement = document.createElement(name);
    this.childFunc(this.currentElement);
    this.parent.appendChild(this.currentElement);
    this.updateDependencies();
  },
  
  update: function() {
    var newElement = document.createElement(this.name);
    this.childFunc(newElement);
    this.parent.replaceChild(newElement, this.currentElement);
    this.currentElement = newElement;
    this.updateDependencies();
  }
});

WHTML.Dependency = Class.create({
  initialize: function() {
    this.listeners = [];
  },
  
  addListener: function(listener) {
    this.listeners.push(listener);
  },
  
  removeListener: function(listener) {
    this.listeners = this.listeners.without(listener);
  },
  
  invokeListeners: function() {
    this.listeners.invoke('update');
  }
});

WHTML.CustomTag = Class.create({
  attributeChanged: function(name) {
    this.attrDependencies[name].invokeListeners();
  }
});

WHTML.Case = Class.create(WHTML.Dynamic, {
  initialize: function($super, parent, valueFunc, valueDepFunc) {
    $super();
    this.parent = parent;
    this.valueFunc = valueFunc;
    this.valueDepFunc = valueDepFunc;
    this.depFunc = function() {
      return this.valueDepFunc();
    };
    this.whenElements = [];
    this.currentWhen = null;
  },
  
  getValue: function() {
    return this.valueFunc();
  },
  
  when: function(condFunc, childFunc) {
    this.whenElements.push(new WHTML.When(condFunc, childFunc));
    this.update();
  },
  
  update: function() {
    var value = this.valueFunc();
    this.whenElements.each(function(whenElement) {
      if(whenElement.condFunc(value)) {
        if(whenElement == this.currentWhen) return;
        
        whenElement.addChildrenTo(this.parent, this.currentWhen && this.currentWhen.children[0]);
        if(this.currentWhen) this.currentWhen.removeChildren(this.parent);
        this.currentWhen = whenElement;
        return;
      }
    }, this);
    this.updateDependencies();
  }
});

WHTML.When = Class.create({
  initialize: function(condFunc, childFunc) {
    this.condFunc = condFunc;
    this.childFunc = childFunc;
    this.children = null;
  },
  
  addChildrenTo: function(parent, position) {
    this.getChildren().each(function(child) {
      if(position) {
        parent.insertBefore(child, position);
      } else {
        parent.appendChild(child);
      }
    });
  },
  
  removeChildren: function(parent) {
    this.getChildren().each(function(child) {
      parent.removeChild(child);
    });
  },
  
  getChildren: function() {
    if(this.children == null) {
      this.children = [];
      this.childFunc(this);
    }
    return this.children;
  },
  
  appendChild: function(child) {
    this.children.push(child);
  }
});

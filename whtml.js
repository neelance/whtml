var WHTML = {
  parts: {},
  customTags: {},
  
  initPage: function() {
    this.loadPart("page", document.getElementsByTagName('body')[0]);
  },
  
  loadPart: function(url, parent) {
    if(!WHTML.parts[url]) {
      new WHTML.Part(url);
    }
    WHTML.parts[url].whenLoaded(function() {
      this.create(parent);
    });
  },
  
  dynamicAttributeFor: function(target, name) {
    var attr = target.retrieve("dynamicAttribute_" + name);
    if(!attr) {
      attr = new WHTML.DynamicAttribute(target, name);
      target.store("dynamicAttribute_" + name, attr);
    }
    return attr;
  }
};

WHTML.Branch = Class.create({
});

WHTML.Part = Class.create({
  initialize: function(url) {
    this.url = url;
    this.loaded = false;
    this.loadCallbacks = [];
    
    WHTML.parts[url] = this;

    var e = document.createElement("script");
    e.type = "text/javascript";
    e.src = this.url + ".js";
    document.getElementsByTagName('head')[0].appendChild(e);
  },

  whenLoaded: function(callback) {
    if(this.loaded) {
      callback.call(this);
    } else {
      this.loadCallbacks.push(callback);
    }
  },
  
  scriptLoaded: function() {
    this.loaded = true;
    this.loadCallbacks.invoke('call', this);
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
    this.target.writeAttribute(this.name, this.valueFunc());
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
    this.valueFunc = valueFunc;
    this.valueDepFunc = valueDepFunc;
    this.depFunc = function() {
      return this.valueDepFunc();
    };
    this.whenElements = [];
    this.currentWhen = null;
    this.positionNode = document.createTextNode('');
    parent.appendChild(this.positionNode);
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
        if(this.currentWhen) this.currentWhen.revert(this.positionNode);
        this.currentWhen = whenElement;
        this.currentWhen.apply(this.positionNode);
        return;
      }
    }, this);
    this.updateDependencies();
  }
});

WHTML.When = Class.create({
  initialize: function(condFunc, actionFunc) {
    this.condFunc = condFunc;
    this.actionFunc = actionFunc;
    this.actions = null;
  },
  
  apply: function(positionNode) {
    this.getActions().invoke('apply', positionNode);
  },
  
  revert: function(positionNode) {
    this.getActions().invoke('revert', positionNode);
  },
  
  getActions: function() {
    if(this.actions == null) {
      this.actions = [];
      this.actionFunc(this);
    }
    return this.actions;
  },
  
  appendChild: function(child) {
    this.actions.push(new WHTML.AppendChildAction(child));
  },
  
  writeAttribute: function(name, value) {
    this.actions.push(new WHTML.WriteAttributeAction(name, value));
  }
});

WHTML.AppendChildAction = Class.create({
  initialize: function(child) {
    this.child = child;
  },
  
  apply: function(positionNode) {
    positionNode.parentNode.insertBefore(this.child, positionNode);
  },
  
  revert: function(positionNode) {
    positionNode.parentNode.removeChild(this.child);
  }
});

WHTML.WriteAttributeAction = Class.create({
  initialize: function(name, value) {
    this.name = name;
    this.value = value;
  },
  
  apply: function(positionNode) {
    this.oldValue = positionNode.parentNode.readAttribute(this.name);
    positionNode.parentNode.writeAttribute(this.name, this.value);
  },
  
  revert: function(positionNode) {
    positionNode.parentNode.writeAttribute(this.name, this.oldValue);
  }
});

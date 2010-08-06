Element.addMethods({
  appendTo: function(element, parent) {
    parent.appendChild(element);
  },
  
  setChildFunction: function(element, childFunction) {
    childFunction();
  },
  
  yield: function(element, context) {
    var positionNode = document.createTextNode('');
    element.appendChild(positionNode);
    context.apply(positionNode);
  }
});

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
  
  createElement: function(name) {
    if(WHTML.customTags[name]) {
      return new WHTML.customTags[name]();
    } else {
      return document.createElement(name);
    }
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

WHTML.SimpleValue = Class.create({
  initialize: function(value) {
    this.value = value;
  },
  
  getValue: function() {
    return this.value;
  },

  addListener: function(listener) {},
  removeListener: function(listener) {},
});

WHTML.DynamicValue = Class.create({
  initialize: function(valueFunc, dependencies) {
    this.valueFunc = valueFunc;
    this.dependencies = dependencies;
  },
  
  getValue: function() {
    return this.valueFunc();
  },
  
  addListener: function(listener) {
    this.dependencies.invoke('addListener', listener);
  },
  
  removeListener: function(listener) {
    this.dependencies.invoke('removeListener', listener);
  }
});

WHTML.Dynamic = Class.create({
  initialize: function() {
    this.currentDependencies = [];
    this.depFunc = function() { return [this.dynValue]; };
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
  
  set: function(dynValue) {
    this.dynValue = dynValue;
    this.updateDependencies();
    this.update();
  },
  
  update: function() {
    this.target.writeAttribute(this.name, this.dynValue.getValue());
  }
});

WHTML.DynamicElement = Class.create(WHTML.Dynamic, {
  initialize: function($super, name, depFunc, childFunc) {
    $super();
    this.name = name;
    this.depFunc = depFunc;
    this.childFunc = childFunc;
    this.updateDependencies();
  },
  
  setChildFunction: function(childFunction) {
    //this.childFunc = childFunction;
  },
  
  appendTo: function(parent) {
    this.parent = parent;
    this.currentElement = document.createElement(this.name);
    this.childFunc(this.currentElement);
    this.parent.appendChild(this.currentElement);
  },
  
  update: function() {
    var newElement = document.createElement(this.name);
    this.childFunc(newElement);
    this.parent.replaceChild(newElement, this.currentElement);
    this.currentElement = newElement;
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
  
  update: function() {
    this.listeners.invoke('update');
  }
});

WHTML.Container = Class.create({
  initialize: function() {
    this.actionFunc = function() {};
    this.actions = null;
    this.isContainer = true;
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
  },
  
  yield: function(context) {
    this.actions.push(new WHTML.YieldAction(context));
  }
});

WHTML.CustomTag = Class.create(WHTML.Container, {
  initialize: function($super) {
    $super();
    this.attrDependencies = {};
  },
  
  writeAttribute: function(name, value) {
    this['attr_' + name] = new WHTML.SimpleValue(value);
    this.attributeChanged(name);
  },
  
  setChildFunction: function(childFunction) {
    this.actionFunc = childFunction;
  },
  
  store: function(name, value) {
    this[name] = value;
  },
  
  retrieve: function(name) {
    return this[name];
  },
  
  attributeDependencyFor: function(name) {
    if(!this.attrDependencies[name]) {
      this.attrDependencies[name] = new WHTML.Dependency([]);
    }
    return this.attrDependencies[name];
  },
  
  attributeChanged: function(name) {
    if(this.attrDependencies[name]) {
      this.attrDependencies[name].update();
    }
  }
});

WHTML.Case = Class.create(WHTML.Dynamic, {
  initialize: function($super, parent, dynValue) {
    $super();
    this.dynValue = dynValue;
    this.whenElements = [];
    this.currentWhen = null;
    this.positionNode = document.createTextNode('');
    parent.appendChild(this.positionNode);
  },
  
  when: function(condFunc, childFunc) {
    this.whenElements.push(new WHTML.When(condFunc, childFunc));
    this.updateDependencies();
    this.update();
  },
  
  update: function() {
    var value = this.dynValue.getValue();
    this.whenElements.each(function(whenElement) {
      if(whenElement.condFunc(value)) {
        if(whenElement == this.currentWhen) return;
        if(this.currentWhen) this.currentWhen.revert(this.positionNode);
        this.currentWhen = whenElement;
        this.currentWhen.apply(this.positionNode);
        return;
      }
    }, this);
  },
  
  appendChild: function(child) {
  }
});

WHTML.When = Class.create(WHTML.Container, {
  initialize: function($super, condFunc, actionFunc) {
    $super();
    this.condFunc = condFunc;
    this.actionFunc = actionFunc;
  },
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

WHTML.YieldAction = Class.create({
  initialize: function(context) {
    this.context = context;
  },
  
  apply: function(positionNode) {
    this.context.apply(positionNode);
  },
  
  revert: function(positionNode) {
    this.context.revert(positionNode);
  }
});
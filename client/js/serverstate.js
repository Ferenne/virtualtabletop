let roomID = self.location.pathname.substr(1);

const widgets = new Map();

const deferredCards = {};
const deferredChildren = {};

let delta = { s: {} };
let deltaChanged = false;
let deltaID = 0;
let batchDepth = 0;

function addWidget(widget) {
  if(widget.parent && !widgets.has(widget.parent)) {
    if(!deferredChildren[widget.parent])
      deferredChildren[widget.parent] = [];
    deferredChildren[widget.parent].push(widget);
    return;
  }

  const id = widget.id;
  if(!id) {
    console.error(`Could not add widget!`, widget, 'widget without ID');
    return;
  }

  let w;

  let parent = $('.surface');
  if(widget.parent)
    parent = widgets.get(widget.parent);

  if(widget.type == 'card') {
    if(widgets.has(widget.deck)) {
      w = new Card(id);
    } else {
      if(!deferredCards[widget.deck])
        deferredCards[widget.deck] = [];
      deferredCards[widget.deck].push(widget);
      return;
    }
  } else if(widget.type == 'pile') {
    w = new Pile(id);
  } else if(widget.type == 'deck') {
    w = new Deck(id);
  } else if(widget.type == 'holder') {
    w = new Holder(id);
  } else if(widget.type == 'spinner') {
    w = new Spinner(id);
  } else if(widget.type == 'label') {
    w = new Label(id);
  } else if(widget.type == 'button') {
    w = new Button(id);
  } else {
    w = new BasicWidget(id);
  }

  try {
    widgets.set(widget.id, w);
    w.applyInitialDelta(widget);
  } catch(e) {
    console.error(`Could not add widget!`, widget, e);
    removeWidget(widget.id);
    return;
  }
  if(w.p('dropTarget'))
    dropTargets.set(widget.id, w);

  if(widget.type == 'deck')
    for(const c of deferredCards[widget.id] || [])
      addWidget(c);
  delete deferredCards[widget.id];

  for(const c of deferredChildren[widget.id] || [])
    addWidget(c);
  delete deferredChildren[widget.id];
}

function batchStart() {
  ++batchDepth;
}

function batchEnd() {
  --batchDepth;
  sendDelta();
}

function receiveDelta(delta) {
  for(const widgetID in delta.s) {
    if(delta.s[widgetID] === null) {
      removeWidget(widgetID);
    } else if(!widgets.has(widgetID)) {
      addWidget(delta.s[widgetID]);
    } else {
      widgets.get(widgetID).applyDelta(delta.s[widgetID]);
    }
  }
}

function receiveDeltaFromServer(delta) {
  deltaID = delta.id;
  receiveDelta(delta);
}

function removeWidget(widgetID) {
  widgets.get(widgetID).applyRemove();
  widgets.delete(widgetID);
  dropTargets.delete(widgetID);
}

function sendDelta(force) {
  if(!batchDepth || force) {
    if(deltaChanged) {
      receiveDelta(delta);
      delta.id = deltaID;
      toServer('delta', delta);
    }
    delta = { s: {} };
    deltaChanged = false;
  }
}

function sendPropertyUpdate(widgetID, property, value) {
  if(property === null || typeof property === 'object') {
    delta.s[widgetID] = property;
  } else {
    if(delta.s[widgetID] === undefined)
      delta.s[widgetID] = {};
    if(delta.s[widgetID] !== null)
      delta.s[widgetID][property] = value;
  }
  deltaChanged = true;
  sendDelta();
}

function widgetFilter(callback) {
  return Array.from(widgets.values()).filter(callback);
}

onLoad(function() {
  onMessage('delta', receiveDeltaFromServer);
  onMessage('state', function(args) {
    mouseTarget = null;
    deltaID = args._meta.deltaID;
    for(const widget of $a('#room .widget'))
      if(widget.id != 'enlarged')
        widgets.get(widget.id).applyRemove();
    widgets.clear();
    dropTargets.clear();
    maxZ = {};
    let isEmpty = true;
    for(const widgetID in args) {
      if(widgetID != '_meta') {
        addWidget(args[widgetID]);
        isEmpty = false;
      }
    }
    if(isEmpty && !urlProperties.load && !urlProperties.askID)
      showOverlay('statesOverlay');
    toServer('confirm');
  });
  setScale();
});

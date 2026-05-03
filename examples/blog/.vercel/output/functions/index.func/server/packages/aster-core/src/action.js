const ACTION_BRAND = Symbol.for("aster.action");

export class ActionRef {
  constructor(handler, options = {}) {
    if (typeof handler !== "function") {
      throw new TypeError("action() requires a function.");
    }

    this[ACTION_BRAND] = true;
    this.handler = handler;
    this.name = options.name;
    this.id = options.id;
    this.path = options.path;
    this.routeId = options.routeId;
  }

  toString() {
    if (!this.path) {
      throw new Error("Action has not been bound to a route manifest yet.");
    }

    return this.path;
  }
}

export function action(handler, options = {}) {
  return new ActionRef(handler, options);
}

export function isAction(value) {
  return Boolean(value && value[ACTION_BRAND]);
}

export function bindAction(ref, metadata) {
  if (!isAction(ref)) {
    throw new TypeError("bindAction() requires an action created by action().");
  }

  ref.id = metadata.id;
  ref.name = metadata.name ?? ref.name;
  ref.path = metadata.path;
  ref.routeId = metadata.routeId;

  return ref;
}

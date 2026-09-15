/**
 * Lightweight publish-subscribe event bus.
 * Replaces direct callback injection with a clean messaging layer.
 */
class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn); // returns unsubscribe fn
  }

  off(event, fn) {
    if (!this._listeners.has(event)) return;
    this._listeners.set(event, this._listeners.get(event).filter(l => l !== fn));
  }

  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) listeners.slice().forEach(fn => fn(data));
  }

  once(event, fn) {
    const unsub = this.on(event, (data) => { fn(data); unsub(); });
    return unsub;
  }
}

export const eventBus = new EventBus();

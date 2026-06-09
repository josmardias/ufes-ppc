// Minimal Web Storage stub for tests (see docs/ARCHITECTURE.md, "Testing
// Policy": storage/store tests use an in-memory localStorage stub rather
// than a full DOM environment).

export class InMemoryStorage {
  #store = new Map();

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }

  setItem(key, value) {
    this.#store.set(key, String(value));
  }

  removeItem(key) {
    this.#store.delete(key);
  }

  clear() {
    this.#store.clear();
  }
}

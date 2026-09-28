/** Jest mock — in-memory Keychain; SEC-05/06 unit tests assert the API use */
const store = new Map();
module.exports = {
  __store: store,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
  setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
  deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
};

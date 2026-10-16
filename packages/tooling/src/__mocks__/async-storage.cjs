// Stub for @react-native-async-storage/async-storage in jest environment.
const store = {};
const AsyncStorage = {
  getItem: async (key) => store[key] ?? null,
  setItem: async (key, value) => { store[key] = value; },
  removeItem: async (key) => { delete store[key]; },
  clear: async () => { Object.keys(store).forEach((k) => delete store[k]); },
  getAllKeys: async () => Object.keys(store),
  multiGet: async (keys) => keys.map((k) => [k, store[k] ?? null]),
  multiSet: async (pairs) => pairs.forEach(([k, v]) => { store[k] = v; }),
  multiRemove: async (keys) => keys.forEach((k) => delete store[k]),
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;

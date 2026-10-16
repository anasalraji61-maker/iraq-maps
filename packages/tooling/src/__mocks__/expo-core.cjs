// Stub for the 'expo' core package. Uses a Proxy so any property access returns
// a safe default: functions return undefined, constructors work, and the module
// never throws on import. Tests that need real behaviour mock the package explicitly.
'use strict';

const noop = () => undefined;
const asyncNoop = () => Promise.resolve(undefined);
const noopClass = class {};

// Known exports that need specific shapes so dependent code doesn't crash:
const known = {
  createPermissionHook: () => () => [null, noop, asyncNoop],
  requireOptionalNativeModule: noop,
  requireNativeModule: () => ({}),
  requireNativeView: () => 'View',
  reloadAppAsync: asyncNoop,
  isRunningInExpoGo: () => false,
  NativeModulesProxy: {},
  EventEmitter: noopClass,
};

const handler = {
  get(_target, prop) {
    if (prop in known) return known[prop];
    if (prop === '__esModule') return true;
    if (typeof prop === 'symbol') return undefined;
    // Return a function for anything unknown so call sites don't throw.
    return noop;
  },
};

module.exports = new Proxy(known, handler);

/** Boundary rules from docs/ARCHITECTURE.md §3 plus ADR-0003 (adapters/*, mobile-features/*). Each rule has a fixture in test/fixtures. */
const forbid = (name, from, to, comment) => ({ name, comment, severity: 'error', from, to });

module.exports = {
  forbidden: [
    forbid('module-to-module', { path: '^modules/([^/]+)/' }, { path: '^modules/', pathNot: '^modules/$1/' }, 'Modules talk only through packages/contracts ports.'),
    forbid('module-to-adapter', { path: '^modules/' }, { path: '^adapters/' }, 'Adapters are bound in apps/api only.'),
    forbid('module-imports', { path: '^modules/' }, { path: '^(apps|mobile-features|e2e|tools|geo-services)/' }, 'Modules import only packages/* and their own files.'),
    forbid('app-deep-import', { path: '^(apps|e2e)/' }, { path: '^modules/', pathNot: '^modules/[^/]+/src/index\\.ts$' }, 'Import a module only through its package entry (src/index.ts).'),
    forbid('adapter-binding', { path: '^(apps/(?!api/)|e2e/|tools/)' }, { path: '^adapters/' }, 'Adapters are bound in apps/api only.'),
    forbid('mobile-to-backend', { path: '^(apps/mobile|mobile-features)/' }, { path: '^(modules|adapters|apps/api)/' }, 'The app reaches the backend only via packages/api-client.'),
    forbid('feature-to-feature', { path: '^mobile-features/([^/]+)/' }, { path: '^mobile-features/', pathNot: '^mobile-features/$1/' }, 'Features navigate via mobile-kit route links, never imports.'),
    forbid('feature-to-app', { path: '^mobile-features/' }, { path: '^apps/' }),
    forbid('adapter-imports', { path: '^adapters/([^/]+)/' }, { path: '^(apps|modules|mobile-features|e2e|tools)/|^packages/(?!(contracts|config)/)|^adapters/', pathNot: '^adapters/$1/' }, 'Adapters import only packages/contracts and packages/config.'),
    forbid('package-upward', { path: '^packages/' }, { path: '^(apps|modules|mobile-features|adapters|e2e|tools)/' }, 'Shared packages never depend on apps, modules, features or adapters.'),
    forbid('contracts-deps', { path: '^packages/contracts/' }, { pathNot: '^packages/contracts/|(^|/)node_modules/(zod|@ts-rest/core)/' }, 'Contracts ship to the app too: only zod and @ts-rest/core.'),
    forbid('no-circular', {}, { circular: true }),
    forbid('not-to-unresolvable', {}, { couldNotResolve: true }, 'Undeclared workspace or npm dependency (each package links only what its package.json declares).'),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|fixtures|android|ios|\\.expo|\\.turbo)(/|$)' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'react-native', 'default'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json'],
    },
  },
};

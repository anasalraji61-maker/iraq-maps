# @iraq-maps/mobile-kit

Shared React Native glue for the app shell and every `mobile-features/*` package: the signed-in session, the API client, typed route links and the "is this screen delivered yet" switch. Features never import each other; they navigate with `href()` and reach the server with `useApi()`.

## Provides

| Export | What it does |
|---|---|
| `SessionProvider({ children, apiBaseUrl })` | Restores the session from expo-secure-store and provides the session and one `ApiClient`. `apiBaseUrl()` is read on every request (the developer server-URL setting applies without a restart). |
| `useSession(): Session` | `{ state, signIn, updateUser, signOut }`. `state` is `loading`, `signedOut` or `signedIn` with the `Me` profile. |
| `useApi(): ApiClient` | The ts-rest client from `@iraq-maps/api-client`, wired to the session tokens. |
| `routes`, `href(name, params)`, `RouteName`, `RouteParams` | Typed links for every MVP screen. `href('place', { placeId })` fills `[param]` segments with `encodeURIComponent` and throws when a param is missing. |
| `useLocale(): Locale` | The current locale; the caller re-renders on every `setLocale()`, so its `t()` text changes at once (Arabic and Kurdish switch without an app reload). Additive to the frozen M0 stubs. |
| `AvailableRoutesProvider`, `useRouteAvailable(name)` | The shell lists the delivered screens; `useRouteAvailable` is `false` without a provider, so buttons to undelivered screens stay hidden. |
| `renderWithProviders(ui, opts)` from `@iraq-maps/mobile-kit/testing` | RNTL `render` (returns its Promise) wrapped in the session, API and available-routes contexts, after `setLocale(opts.locale ?? 'ar')`. Defaults: signed out with no-op actions, an empty API object (pass the endpoints the screen calls), every route available. It uses no Jest globals. |

`useSession()` and `useApi()` throw outside `SessionProvider` (or `renderWithProviders`).

## Session behaviour

- **Start:** `loading`. Tokens and profile are read from expo-secure-store and validated with the `TokenPair` and `Me` zod schemas. Missing, corrupt or unreadable data is deleted and the state becomes `signedOut`.
- **Restored session:** `signedIn` immediately with the cached profile (offline first), then `GET /v1/me` runs in the background. 200 updates and stores the profile; a network error keeps the cached session.
- **Token refresh:** handled by the API client. A new pair is stored; a rejected refresh token (`onTokens(null)`) clears storage and signs out. Network errors never sign the user out.
- **`signIn(tokens, user)`:** stores both, then `signedIn`.
- **`updateUser(user)`:** updates the state and the stored profile (ignored when signed out).
- **`signOut()`:** clears storage and signs out at once, then sends `POST /v1/auth/logout { refreshToken }` best effort (failures are ignored).

### expo-secure-store keys

| Key | Value |
|---|---|
| `iraq-maps.session.tokens` | `TokenPair` JSON |
| `iraq-maps.session.user` | `Me` JSON |

Renaming a key signs every user out on upgrade; the tests pin both names.

## Ports

- Consumes: `createClient` / `ApiClient` from `@iraq-maps/api-client`; `apiContract`, `TokenPair`, `Me`, `Locale` from `@iraq-maps/contracts`; `getLocale` and `onLocaleChange` from `@iraq-maps/i18n` (`useLocale`), `setLocale` (testing helper).
- Provides: no backend port.

## Environment variables

None. The shell passes `apiBaseUrl` (from `EXPO_PUBLIC_API_URL` or the developer setting).

## Tests

`pnpm --filter @iraq-maps/mobile-kit test` (jest-expo + RNTL 14, in-memory `expo-secure-store` mock, fake `fetch` behind the real API client): restore, corrupt data, background profile refresh, offline restore, sign-in, profile update, sign-out with logout, refresh rotation stored, rejected refresh signs out, hooks outside the provider, `href`, `useRouteAvailable` with and without a provider, `useLocale` re-rendering on each change, `renderWithProviders` defaults and overrides.

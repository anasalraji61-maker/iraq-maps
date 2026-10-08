# @iraq-maps/mobile-kit

The app-wide session, API access and typed navigation for `apps/mobile` and every `mobile-features/*` package.

- `SessionProvider({ apiBaseUrl, children })` restores the session from `expo-secure-store` (keys `session.tokens` and
  `session.user`). With a cached profile it is signed in at once, so this works offline. It then refreshes the profile
  with `GET /v1/me`, and a rejected refresh signs out. It also provides the `@iraq-maps/api-client` client.
- `useSession()` returns `{ state, signIn(tokens, user), updateUser(user), signOut() }`. `state` is `loading`,
  `signedOut` or `signedIn` with the user. `signOut()` clears the device first, then revokes the refresh token with
  `POST /v1/auth/logout` (best effort).
- `useApi()` returns the typed client: it adds the bearer token, refreshes on 401 and validates responses.
- `routes` / `href(name, params)` are typed links for every MVP screen, e.g. `href('place', { placeId })`. Features
  navigate only through these, never by importing each other.
- `AvailableRoutesProvider` / `useRouteAvailable(name)`: the shell lists the delivered screens
  (`apps/mobile/src/shell/available-routes.ts`). Hide any button whose target is not available.

Testing (`@iraq-maps/mobile-kit/testing`, Jest + RNTL 14):

- `await renderWithProviders(ui, { session, api, locale, availableRoutes })` wraps `ui` in the providers. Defaults:
  signed out, no-op session actions, `ar`, every route available.
- `memorySecureStore` is an in-memory `expo-secure-store`:
  `jest.mock('expo-secure-store', () => jest.requireActual<typeof import('@iraq-maps/mobile-kit/testing')>('@iraq-maps/mobile-kit/testing').memorySecureStore)`.
  Call `memorySecureStore.clear()` between tests.

**Ports:** none. **Env:** none. The shell reads `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_APP_ENV` and passes `apiBaseUrl`.

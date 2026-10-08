# @iraq-maps/observability

## createLogger

`createLogger({ name, level? })` is a pino JSON logger on stdout. `level` defaults to `info`. Callers pass `LOG_LEVEL` from their config. `child(bindings)` works as in pino.

Every finished log line is redacted. This covers `msg`, bindings, nested fields, arrays and serialized errors:
- **Phone numbers.** Iraqi mobile numbers in any string become `[phone]`. The forms are `+9647xxxxxxxxx`, `9647xxxxxxxxx` and `07xxxxxxxxx`.
- **Tokens.** JWT-looking strings (`eyJ….….…`) become `[jwt]`.
- **Secret keys.** The value of these keys becomes `[redacted]`, at any depth: `authorization`, `token`, `refreshToken`, `accessToken`, `otp` and `code`. Matching ignores case, `_` and `-`.
- **Coordinates.** Numbers under the keys `lat`, `lng`, `lon`, `latitude` and `longitude` are rounded to 2 decimals.

## captureLogs

`captureLogs()` is for tests. It captures what every logger writes until `stop()`, including loggers created before it was called. While a capture is active, lines are not echoed to stdout.

```ts
const logs = captureLogs();
// ...exercise the code...
expect(logs.text()).not.toMatch(/\+?9647\d{9}|07\d{9}/);
logs.stop();
```

`records` holds the parsed JSON lines.

**Env:** none.

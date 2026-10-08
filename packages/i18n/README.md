# @iraq-maps/i18n

Platform-independent i18n runtime and the shared Arabic/Kurdish search normalizer. It has no React or React Native imports, so the mobile app, the admin panel and the server (Node) all use the same code.

Locales: `ar` (default), `ckb` (Kurdish Sorani), `en`. `ar` and `ckb` are right-to-left.

## API (from `src/index.ts` only)

| Export | Purpose |
|---|---|
| `registerNamespace(ns, { ar, ckb, en })` | Registers a feature's messages. Throws if the three locales do not have the same keys (see "Key parity"). Registering the same `ns` again replaces it. |
| `t('ns:dotted.key', params?)` | Message in the current locale. Unknown namespace or key returns the key itself (never throws). |
| `setLocale(locale)` / `getLocale()` | Current locale. `setLocale` notifies listeners only when the locale actually changes. |
| `onLocaleChange(listener)` | Subscribes to locale changes; returns an unsubscribe function. |
| `isRtl(locale)` | `true` for `ar` and `ckb`. |
| `formatNumber(value, locale = getLocale())` | `ar` and `ckb` use Arabic-Indic digits (`١٬٢٣٤`) as written in Iraq; `en` uses Latin digits. Works on Node 22 and Hermes. |
| `normalizeArabic(text)` | Search normalizer (rules below). |
| `type Messages` | Nested message tree. |

## Registering a feature namespace

Each feature keeps its messages in `src/i18n/{ar,ckb,en}.json` and registers them once, at module load:

```ts
import { registerNamespace } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('account', { ar, ckb, en });
```

Then `t('account:phone.title')`. Namespace names are the feature or package name (`account`, `shell`, `ui`, ...).

## Key parity

`registerNamespace` compares every locale with `ar`. It throws one `Error` naming the namespace and, per locale, the missing keys, the extra keys, keys that are plural in one locale but plain text in another, and plural messages without an `other` form, for example:

```
i18n namespace "account" is not in parity with ar: ckb missing [phone.hint]; en extra [phone.old]
```

Any test that imports a feature (and so registers its namespace) therefore checks parity. Arabic, Kurdish and English may use different plural categories for the same key.

## Message format

- Interpolation: `"أهلاً {{name}}"` with `t(key, { name })`. Number params are formatted with `formatNumber` for the current locale. A missing param leaves the placeholder visible.
- Plurals: a message whose keys are all CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`) is a plural. Pass a numeric `count`; the category comes from the CLDR cardinal rules of the current locale, falling back to `other`. `other` is required. Arabic usually needs all six:

```json
{ "resend": { "zero": "أعد الإرسال الآن", "one": "بعد ثانية", "two": "بعد ثانيتين", "few": "بعد {{count}} ثوانٍ", "many": "بعد {{count}} ثانية", "other": "بعد {{count}} ثانية" } }
```

The plural rules for `ar`, `ckb` and `en` are built in because Hermes has no `Intl.PluralRules`; the tests check them against Node's `Intl.PluralRules`.

## Arabic/Kurdish normalizer

`normalizeArabic` (`src/normalize.ts`) is the only normalizer for search. The server import, the server search and the client search must all use it, on both the indexed text and the query.

In order:
1. Unicode NFKC (folds presentation forms and ligatures, e.g. `ﻻ` to `لا`).
2. Remove tatweel (U+0640), harakat/tashkeel (U+064B to U+065F), superscript alef (U+0670) and Quranic marks (U+06D6 to U+06ED).
3. `أ إ آ ٱ` to `ا`; `ة` to `ه`; `ى` to `ي`; Persian/Kurdish yeh `ی` (U+06CC) to `ي`; Persian/Kurdish kaf `ک` (U+06A9) to `ك`.
4. Arabic-Indic `٠-٩` and Extended Arabic-Indic `۰-۹` digits to `0-9`.
5. Lowercase Latin; collapse whitespace and trim.

Sorani letters `ڕ ۆ ێ ڵ ە` are kept, and `ئ`, `ؤ` and `ە` are not mapped, so `هەولێر` stays `هەولێر`. The function is idempotent.

## Ports and env vars

Provides no ports and consumes none. Needs no environment variables.

## Tests

`pnpm --filter @iraq-maps/i18n test` (Vitest): key parity pass and fail messages, interpolation, plural selection (ar, ckb, en, checked against CLDR), unknown keys, locale listeners, `isRtl`, `formatNumber` per locale, and the normalizer rules with idempotence.

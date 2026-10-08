# @iraq-maps/i18n

Platform-independent i18n runtime and the shared Arabic/Kurdish search normalizer. It has no React and no Expo, so the
server can import it too. Locales are `ar` (default), `ckb` (Kurdish Sorani) and `en`.

| Export | What it does |
|---|---|
| `registerNamespace(ns, { ar, ckb, en })` | Registers a feature's strings. It throws unless all three locales have the same keys and `{param}` placeholders. |
| `t('ns:a.b', params?)` | Looks up the key in the current locale and interpolates `{name}` params. An unknown key returns the key itself. |
| `setLocale(l)` / `getLocale()` / `onLocaleChange(fn) → unsubscribe` | The current locale. Listeners fire only on a real change. |
| `isRtl(l)` | `true` for `ar` and `ckb`. |
| `formatNumber(n, Intl options?)` | Formats for the current locale: Arabic-Indic digits for `ar`/`ckb` (`١٬٢٣٤`), Latin for `en`. |
| `assertKeyParity(ns, { ar, ckb, en })` | The key-parity check, for each namespace's own test. |
| `normalizeArabic(text)` | Search normalizer (`src/normalize.ts`). Index and query must both go through it. |

`common` is registered on import. It holds the tab labels (`common:tabs.map|discover|messages|activity|account`),
`comingSoon.title|body`, `actions.retry|cancel|confirm|save|close|back`, `status.loading` and
`errors.generic|network|rateLimited|sessionExpired`.

**Adding a namespace.** Put the strings in JSON files, for example `src/i18n/{ar,ckb,en}.json` (JSON because the ESLint rule rejects Arabic
script in UI code) and register them once at import time. Add a parity test:

```ts
import { assertKeyParity } from '@iraq-maps/i18n';
it('has key parity', () => expect(() => assertKeyParity('account', { ar, ckb, en })).not.toThrow());
```

**normalizeArabic** applies NFKC, then:
- folds أ/إ/آ/ٱ→ا, ة→ه, ى→ي, Persian/Kurdish ی→ي and ک→ك, and ھ/ہ→ه;
- strips tashkeel, Quranic marks, tatweel, bidi controls and zero-width (non-)joiners;
- maps Arabic-Indic and Persian digits to ASCII;
- collapses whitespace.

It leaves the Sorani letters ڕ ۆ ێ ڵ ە and hamza carriers such as ئ untouched.

**Ports:** none. **Env:** none. **Tests:** `pnpm --filter @iraq-maps/i18n test` (Vitest).

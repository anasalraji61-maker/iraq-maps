/** Stable testIDs shared by RNTL tests and Maestro flows. */
export const testIDs = {
  tabs: { map: 'tab.map', discover: 'tab.discover', messages: 'tab.messages', activity: 'tab.activity', account: 'tab.account' },
  auth: {
    phoneInput: 'auth.phone.input',
    phoneSubmit: 'auth.phone.submit',
    otpInput: 'auth.otp.input',
    otpSubmit: 'auth.otp.submit',
    otpResend: 'auth.otp.resend',
    nameInput: 'auth.name.input',
    nameSubmit: 'auth.name.submit',
    locale: { ar: 'auth.locale.ar', ckb: 'auth.locale.ckb', en: 'auth.locale.en' },
  },
  account: { signIn: 'account.signIn', logout: 'account.logout', delete: 'account.delete', deleteConfirm: 'account.delete.confirm', language: 'account.language' },
  map: {
    view: 'map.view',
    attribution: 'map.attribution',
    locate: 'map.locate',
    searchInput: 'map.search.input',
    searchResult: 'map.search.result',
    lang: 'map.lang',
  },
  place: { card: 'place.card', name: 'place.name', category: 'place.category', source: 'place.source', share: 'place.share' },
  dev: { serverUrlInput: 'dev.serverUrl.input', serverUrlSave: 'dev.serverUrl.save' },
} as const;

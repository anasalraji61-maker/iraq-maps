import { satelliteTestIDs } from './imagery';

/** M6: discover testIDs shared by RNTL tests and Maestro flows. */
export const discoverTestIDs = {
  feedItem: (id: string) => `discover.feed.${id}`,
  likeButton: (id: string) => `discover.like.${id}`,
  commentButton: (id: string) => `discover.comment.${id}`,
  createPostButton: 'discover.create.post',
  postInput: 'discover.post.input',
} as const;
import { providerTestIDs } from './providers';
import { navigationTestIDs } from './routing';

/** M5: assistant testIDs shared by RNTL tests and Maestro flows. */
export const assistantTestIDs = {
  chatInput: 'assistant.chat.input',
  sendButton: 'assistant.chat.send',
  messageItem: (idx: number) => `assistant.message.${idx}`,
  composeDeepLink: 'assistant.compose.deeplink',
} as const;

/** M4: messaging testIDs shared by RNTL tests and Maestro flows. */
export const messagingTestIDs = {
  composeButton: 'messaging.compose',
  placeChip: (id: string) => `messaging.place.${id}`,
  confirmSend: 'messaging.confirm.send',
  channelBadge: (id: string) => `messaging.channel.${id}`,
  handoffCopy: 'messaging.handoff.copy',
  inboxItem: (id: string) => `provider.inbox.${id}`,
  replyInput: 'provider.inbox.reply.input',
  optOutButton: 'provider.inbox.opt-out',
} as const;

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
  navigation: navigationTestIDs, // M2
  satellite: satelliteTestIDs, // M2
  provider: providerTestIDs, // M3
  messaging: messagingTestIDs, // M4
  assistant: assistantTestIDs, // M5
  discover: discoverTestIDs, // M6
  dev: { serverUrlInput: 'dev.serverUrl.input', serverUrlSave: 'dev.serverUrl.save' },
} as const;

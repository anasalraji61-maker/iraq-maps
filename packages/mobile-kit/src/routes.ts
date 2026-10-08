/** Typed links for every MVP screen. Features navigate only through these (never by importing each other). */
export const routes = {
  map: '/',
  search: '/search',
  place: '/place/[placeId]',
  routePreview: '/route/[placeId]',
  navigation: '/navigate/[placeId]',
  assistant: '/assistant',
  discover: '/discover',
  discoverPost: '/discover/[postId]',
  discoverNewPost: '/discover/new',
  messages: '/messages',
  messageCompose: '/messages/new',
  messageThread: '/messages/[requestId]',
  activity: '/activity',
  account: '/account',
  accountLanguage: '/account/language',
  authPhone: '/auth/phone',
  authOtp: '/auth/otp',
  authName: '/auth/name',
  providerHome: '/provider',
  providerRegister: '/provider/register',
  providerProfile: '/provider/profile',
  providerConsents: '/provider/consents',
  providerInbox: '/provider/inbox',
  providerRequest: '/provider/inbox/[requestId]',
  devSettings: '/dev-settings',
} as const;

export type RouteName = keyof typeof routes;
type ParamsOf<P extends string> = P extends `${string}[${infer K}]${infer Rest}` ? { [k in K]: string } & ParamsOf<Rest> : unknown;
export type RouteParams<N extends RouteName> = ParamsOf<(typeof routes)[N]>;

/** Builds a concrete path, e.g. href('place', { placeId: 'p1' }) => '/place/p1'. */
export function href<N extends RouteName>(name: N, params?: RouteParams<N>): string {
  return routes[name].replace(/\[(\w+)\]/g, (_, key: string) => {
    const value = (params as Record<string, string> | undefined)?.[key];
    if (value === undefined) throw new Error(`href('${name}') needs the "${key}" param`);
    return encodeURIComponent(value);
  });
}

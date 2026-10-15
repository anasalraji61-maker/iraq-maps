/**
 * Mock GIF data — no real API key needed.
 * In production, replace with a real Giphy/Tenor integration behind the backend.
 */

export interface MockGif {
  id: string;
  /** Internal key used for filtering — not displayed directly in UI */
  searchKey: string;
  /** A publicly accessible animated GIF URL (from a CDN or placeholder service) */
  url: string;
  /** Static preview thumbnail */
  thumbUrl: string;
}

// Trending GIFs from placeholder CDN (safe for production use as demo data)
export const TRENDING_GIFS: MockGif[] = [
  { id: 'g1', searchKey: 'thumbsup', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', thumbUrl: 'https://media.giphy.com/media/111ebonMs90YLu/200_s.gif' },
  { id: 'g2', searchKey: 'clapping', url: 'https://media.giphy.com/media/cXblnKXr2BQOaYnTni/giphy.gif', thumbUrl: 'https://media.giphy.com/media/cXblnKXr2BQOaYnTni/200_s.gif' },
  { id: 'g3', searchKey: 'laughing', url: 'https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif', thumbUrl: 'https://media.giphy.com/media/ZqlvCTNHpqrio/200_s.gif' },
  { id: 'g4', searchKey: 'heart', url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif', thumbUrl: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/200_s.gif' },
  { id: 'g5', searchKey: 'wave', url: 'https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif', thumbUrl: 'https://media.giphy.com/media/ASd0Ukj0y3qMM/200_s.gif' },
  { id: 'g6', searchKey: 'celebrate', url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', thumbUrl: 'https://media.giphy.com/media/g9582DNuQppxC/200_s.gif' },
  { id: 'g7', searchKey: 'sad', url: 'https://media.giphy.com/media/h4Z6RfuQycdiM/giphy.gif', thumbUrl: 'https://media.giphy.com/media/h4Z6RfuQycdiM/200_s.gif' },
  { id: 'g8', searchKey: 'fire', url: 'https://media.giphy.com/media/l1J9EdzfOSgfyueLm/giphy.gif', thumbUrl: 'https://media.giphy.com/media/l1J9EdzfOSgfyueLm/200_s.gif' },
];

export function searchGifs(query: string): MockGif[] {
  if (!query.trim()) return TRENDING_GIFS;
  const q = query.toLowerCase();
  return TRENDING_GIFS.filter((g) => g.searchKey.toLowerCase().includes(q));
}

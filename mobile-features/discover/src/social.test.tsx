/**
 * Smoke tests for social feature exports
 */
import { describe, it, expect } from '@jest/globals';
import { EventsScreen } from './screens/EventsScreen';
import { EventDetailScreen } from './screens/EventDetailScreen';
import { CreateEventScreen } from './screens/CreateEventScreen';
import { ChallengesScreen } from './screens/ChallengesScreen';
import { ChallengeDetailScreen } from './screens/ChallengeDetailScreen';
import { MarketplaceScreen } from './screens/MarketplaceScreen';
import { ListingDetailScreen } from './screens/ListingDetailScreen';
import { CreateListingScreen } from './screens/CreateListingScreen';
import { MyListingsScreen } from './screens/MyListingsScreen';

describe('Social feature exports', () => {
  it('EventsScreen is a function', () => {
    expect(typeof EventsScreen).toBe('function');
  });

  it('EventDetailScreen is a function', () => {
    expect(typeof EventDetailScreen).toBe('function');
  });

  it('CreateEventScreen is a function', () => {
    expect(typeof CreateEventScreen).toBe('function');
  });

  it('ChallengesScreen is a function', () => {
    expect(typeof ChallengesScreen).toBe('function');
  });

  it('ChallengeDetailScreen is a function', () => {
    expect(typeof ChallengeDetailScreen).toBe('function');
  });

  it('MarketplaceScreen is a function', () => {
    expect(typeof MarketplaceScreen).toBe('function');
  });

  it('ListingDetailScreen is a function', () => {
    expect(typeof ListingDetailScreen).toBe('function');
  });

  it('CreateListingScreen is a function', () => {
    expect(typeof CreateListingScreen).toBe('function');
  });

  it('MyListingsScreen is a function', () => {
    expect(typeof MyListingsScreen).toBe('function');
  });
});

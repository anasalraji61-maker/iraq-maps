import type { PlaceCategory } from './geo-data';

const each = (values: string[], category: PlaceCategory): Record<string, PlaceCategory> => Object.fromEntries(values.map((v) => [v, category]));

/**
 * The one OSM tag → PlaceCategory table, read by the pipeline (places.ndjson) and the tiles profile (poi layer) from
 * schemas/osm-categories.json. Rules are tried in order and the first match wins. Within a rule, an exact value beats
 * "*". A tag whose value is in `ignoredValues` never matches. A city maps only the categories its config lists.
 * @public frozen contract (M1, post-freeze)
 */
export const OsmCategoryRules = {
  ignoredValues: ['no', 'vacant'],
  rules: [
    {
      key: 'amenity',
      values: {
        ...each(['restaurant', 'fast_food', 'food_court', 'ice_cream'], 'food'),
        ...each(['cafe', 'hookah_lounge'], 'cafe'),
        ...each(['bank', 'atm', 'bureau_de_change', 'money_transfer'], 'finance'),
        ...each(['fuel', 'charging_station'], 'fuel'),
        ...each(['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'], 'health'),
        ...each(['place_of_worship'], 'worship'),
        ...each(['school', 'university', 'college', 'kindergarten', 'library', 'language_school'], 'education'),
        ...each(['townhall', 'courthouse', 'police', 'fire_station', 'post_office', 'embassy'], 'government'),
        ...each(['bus_station', 'ferry_terminal', 'taxi'], 'transport'),
        ...each(['cinema', 'theatre', 'arts_centre', 'nightclub', 'events_venue'], 'entertainment'),
        ...each(['marketplace'], 'shopping'),
      },
    },
    { key: 'shop', values: each(['*'], 'shopping') },
    {
      key: 'tourism',
      values: {
        ...each(['hotel', 'motel', 'guest_house', 'hostel', 'apartment'], 'lodging'),
        ...each(['attraction', 'museum', 'gallery', 'zoo', 'theme_park', 'viewpoint', 'aquarium'], 'tourism'),
      },
    },
    { key: 'office', values: { ...each(['government', 'diplomatic'], 'government'), ...each(['*'], 'office') } },
    { key: 'healthcare', values: each(['*'], 'health') },
    { key: 'leisure', values: each(['park', 'sports_centre', 'stadium', 'fitness_centre', 'water_park', 'amusement_arcade', 'bowling_alley'], 'entertainment') },
    { key: 'historic', values: each(['castle', 'fort', 'monument', 'memorial', 'archaeological_site', 'ruins'], 'tourism') },
    { key: 'public_transport', values: each(['station'], 'transport') },
    { key: 'railway', values: each(['station'], 'transport') },
    { key: 'aeroway', values: each(['aerodrome', 'terminal'], 'transport') },
  ],
};

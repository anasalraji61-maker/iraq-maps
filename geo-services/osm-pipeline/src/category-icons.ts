/**
 * OSM tag → icon name mapper with 200+ mappings.
 *
 * Fallback chain: specific OSM value → general category → 'pin'
 *
 * Icon names use Material Symbols (Google) identifiers, which are also used
 * by the mobile app via @iraq-maps/map-kit icon registry.
 *
 * ODbL compliance: this file maps display metadata only — it never merges or
 * re-publishes OSM data under a different license.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A resolved icon name from the Material Symbols set. */
export type IconName = string;

/** Specificity level of the icon resolution. */
export type IconResolution = 'specific' | 'general' | 'fallback';

export interface IconResult {
  icon: IconName;
  resolution: IconResolution;
}

// ---------------------------------------------------------------------------
// Specific-value icon map  (amenity=*)
// ---------------------------------------------------------------------------

const AMENITY_ICONS: Record<string, IconName> = {
  // Food & drink
  restaurant: 'restaurant',
  fast_food: 'fastfood',
  food_court: 'food_court',
  cafe: 'local_cafe',
  bar: 'local_bar',
  pub: 'sports_bar',
  biergarten: 'outdoor_grill',
  ice_cream: 'icecream',
  hookah_lounge: 'smoking_rooms',
  juice_bar: 'local_drink',
  shawarma: 'kebab_dining',
  bbq: 'outdoor_grill',
  confectionery: 'cake',

  // Health
  hospital: 'local_hospital',
  clinic: 'medical_services',
  pharmacy: 'local_pharmacy',
  doctors: 'person_4',
  dentist: 'dentistry',
  veterinary: 'pets',
  nursing_home: 'elderly',
  laboratory: 'science',
  blood_bank: 'bloodtype',
  optician: 'visibility',
  physiotherapist: 'self_improvement',
  psychologist: 'psychology',
  dialysis: 'health_and_safety',
  ambulance_station: 'local_hospital',
  health_post: 'medical_services',

  // Finance
  bank: 'account_balance',
  atm: 'local_atm',
  bureau_de_change: 'currency_exchange',
  money_transfer: 'payments',
  mobile_money: 'mobile_friendly',
  microfinance: 'savings',
  exchange_office: 'currency_exchange',
  payment_terminal: 'point_of_sale',

  // Transport
  bus_station: 'directions_bus',
  taxi: 'local_taxi',
  parking: 'local_parking',
  parking_space: 'local_parking',
  bicycle_parking: 'pedal_bike',
  motorcycle_parking: 'two_wheeler',
  car_rental: 'directions_car',
  car_wash: 'local_car_wash',
  car_repair: 'car_repair',
  ferry_terminal: 'directions_boat',
  airport: 'local_airport',
  helicopter_pad: 'flight',
  fuel: 'local_gas_station',
  charging_station: 'ev_station',
  weighbridge: 'scale',

  // Education
  school: 'school',
  university: 'account_balance',
  college: 'school',
  library: 'local_library',
  kindergarten: 'child_care',
  language_school: 'language',
  driving_school: 'directions_car',
  music_school: 'music_note',
  art_school: 'palette',
  training: 'cast_for_education',
  research_institute: 'biotech',
  tutoring: 'menu_book',

  // Entertainment
  cinema: 'theaters',
  theatre: 'theater_comedy',
  arts_centre: 'palette',
  nightclub: 'nightlife',
  casino: 'casino',
  bowling_alley: 'sports_cricket',
  gym: 'fitness_center',
  swimming_pool: 'pool',
  sports_centre: 'sports',
  stadium: 'stadium',
  game_room: 'sports_esports',
  escape_room: 'lock',
  amusement_arcade: 'videogame_asset',

  // Worship
  place_of_worship: 'mosque',
  mosque: 'mosque',
  church: 'church',
  synagogue: 'synagogue',
  temple: 'temple_buddhist',
  shrine: 'brightness_5',
  husayniyya: 'mosque',
  hussainiya: 'mosque',

  // Government & public services
  townhall: 'account_balance',
  government: 'account_balance',
  police: 'local_police',
  fire_station: 'fire_truck',
  post_office: 'local_post_office',
  customs: 'border_all',
  prison: 'lock',
  courthouse: 'gavel',
  embassy: 'flag',
  consulate: 'flag',
  public_building: 'apartment',
  immigration: 'assignment_ind',
  tax_office: 'receipt_long',
  ministry: 'account_balance',

  // Utilities & services
  recycling: 'recycling',
  waste_disposal: 'delete',
  waste_transfer_station: 'local_shipping',
  water_point: 'water',
  drinking_water: 'water_drop',
  telephone: 'phone',
  internet_cafe: 'wifi',
  social_facility: 'group',
  refugee: 'home',
  shelter: 'home',
  toilets: 'wc',
  shower: 'shower',
  lavoir: 'local_laundry_service',
  water_purification: 'water',

  // Miscellaneous
  marketplace: 'storefront',
  market: 'storefront',
  nightclub_strip: 'nightlife',
  vending_machine: 'vending_machine',
  conference_centre: 'event',
  events_venue: 'event',
  exhibition_centre: 'museum',
  studio: 'radio',
  photo_studio: 'photo_camera',
  notary: 'gavel',
  animal_shelter: 'pets',
};

// ---------------------------------------------------------------------------
// Shop icons  (shop=*)
// ---------------------------------------------------------------------------

const SHOP_ICONS: Record<string, IconName> = {
  // Food shops
  supermarket: 'local_grocery_store',
  convenience: 'store',
  bakery: 'bakery_dining',
  butcher: 'lunch_dining',
  greengrocer: 'local_florist',
  fishmonger: 'set_meal',
  deli: 'lunch_dining',
  dairy: 'water_drop',
  spices: 'lunch_dining',
  tea: 'local_cafe',
  coffee: 'local_cafe',
  confectionery: 'cake',
  chocolate: 'cake',
  pastry: 'cake',
  nuts: 'restaurant',
  health_food: 'eco',
  organic: 'eco',
  frozen_food: 'kitchen',
  alcohol: 'local_bar',
  beverages: 'local_drink',
  water: 'water_drop',

  // Clothing & fashion
  clothes: 'checkroom',
  fashion: 'checkroom',
  shoes: 'footprint',
  bag: 'luggage',
  jewelry: 'diamond',
  accessories: 'accessibility',
  boutique: 'storefront',
  tailor: 'design_services',
  fabric: 'texture',
  wedding: 'favorite',
  baby_goods: 'child_care',
  second_hand: 'recycling',
  vintage: 'recycling',
  uniform: 'school',
  sports: 'sports',
  outdoor: 'hiking',

  // Electronics & tech
  electronics: 'devices',
  mobile_phone: 'smartphone',
  computer: 'computer',
  camera: 'photo_camera',
  hifi: 'speaker',
  appliance: 'kitchen',
  telephone: 'phone',
  electrical: 'electrical_services',
  batteries: 'battery_full',
  video_games: 'sports_esports',
  drone: 'flight',

  // Home & furniture
  furniture: 'chair',
  interior_decoration: 'living',
  carpet: 'texture',
  curtain: 'window',
  kitchen: 'kitchen',
  bathroom: 'bathtub',
  bedding: 'bed',
  lighting: 'light',
  hardware: 'hardware',
  doors: 'door_front',
  windows: 'window',
  paint: 'format_paint',
  tiles: 'grid_on',
  flooring: 'grid_on',
  garden: 'yard',
  agricultural: 'agriculture',

  // Health & beauty
  chemist: 'local_pharmacy',
  cosmetics: 'face',
  perfumery: 'self_improvement',
  hairdresser: 'content_cut',
  beauty: 'spa',
  optician: 'visibility',
  medical_supply: 'medical_services',
  hearing_aids: 'hearing',
  massage: 'spa',
  tattoo: 'brush',

  // Books & stationery
  books: 'menu_book',
  stationery: 'edit_note',
  newsagent: 'newspaper',
  comics: 'menu_book',
  art: 'palette',
  craft: 'brush',
  music: 'music_note',
  musical_instrument: 'piano',
  photo: 'photo_camera',
  printing: 'print',
  copy: 'content_copy',
  frame: 'crop_free',

  // Vehicles
  car: 'directions_car',
  car_parts: 'car_repair',
  motorcycle: 'two_wheeler',
  bicycle: 'pedal_bike',
  tyres: 'tire_repair',
  fuel: 'local_gas_station',

  // Misc retail
  toys: 'toys',
  games: 'sports_esports',
  gift: 'card_giftcard',
  souvenir: 'attractions',
  antiques: 'history_edu',
  pawnbroker: 'payments',
  gold_silver: 'diamond',
  money_lender: 'payments',
  pet: 'pets',
  pet_food: 'pets',
  plant_nursery: 'local_florist',
  florist: 'local_florist',
  storage_rental: 'warehouse',
  wholesale: 'inventory',
  tobacco: 'smoking_rooms',
  lottery: 'casino',
  weapons: 'security',
  safety: 'security',
  medical_equipment: 'medical_services',
  insurance: 'security',
  travel_agency: 'travel_explore',
  real_estate: 'home',
  rental: 'car_rental',
  laundry: 'local_laundry_service',
  dry_cleaning: 'local_laundry_service',
  outdoor_seating: 'outdoor_grill',
  variety_store: 'store',
  department_store: 'shopping_bag',
  mall: 'local_mall',
};

// ---------------------------------------------------------------------------
// Tourism icons  (tourism=*)
// ---------------------------------------------------------------------------

const TOURISM_ICONS: Record<string, IconName> = {
  hotel: 'hotel',
  motel: 'hotel',
  hostel: 'hotel',
  guest_house: 'home',
  apartment: 'apartment',
  camp_site: 'camping',
  caravan_site: 'rv_hookup',
  attraction: 'attractions',
  museum: 'museum',
  gallery: 'palette',
  viewpoint: 'landscape',
  information: 'info',
  theme_park: 'attractions',
  zoo: 'pets',
  aquarium: 'water',
  artwork: 'palette',
  picnic_site: 'outdoor_grill',
  wilderness_hut: 'cabin',
  alpine_hut: 'cabin',
  chalet: 'chalet',
  yes: 'attractions',
};

// ---------------------------------------------------------------------------
// Historic icons  (historic=*)
// ---------------------------------------------------------------------------

const HISTORIC_ICONS: Record<string, IconName> = {
  monument: 'museum',
  memorial: 'museum',
  archaeological_site: 'history_edu',
  castle: 'castle',
  fort: 'castle',
  ruins: 'history_edu',
  palace: 'castle',
  mosque: 'mosque',
  church: 'church',
  synagogue: 'synagogue',
  temple: 'temple_buddhist',
  building: 'apartment',
  yes: 'history_edu',
  district: 'location_city',
  milestone: 'place',
  cannon: 'history_edu',
  aircraft: 'flight',
  ship: 'directions_boat',
  tank: 'history_edu',
  battlefield: 'history_edu',
  tomb: 'museum',
  grave_yard: 'museum',
  wayside_shrine: 'brightness_5',
  city_gate: 'location_city',
  bridge: 'directions',
  aqueduct: 'water',
  fountain: 'water',
  manor: 'home',
  farm: 'agriculture',
  industrial: 'factory',
  railway_station: 'train',
  lighthouse: 'light',
  mine: 'construction',
  wreck: 'directions_boat',
};

// ---------------------------------------------------------------------------
// Leisure icons  (leisure=*)
// ---------------------------------------------------------------------------

const LEISURE_ICONS: Record<string, IconName> = {
  park: 'park',
  garden: 'yard',
  playground: 'toys',
  sports_centre: 'sports',
  stadium: 'stadium',
  pitch: 'sports_soccer',
  swimming_pool: 'pool',
  fitness_centre: 'fitness_center',
  gym: 'fitness_center',
  golf_course: 'golf_course',
  tennis_court: 'sports_tennis',
  track: 'directions_run',
  nature_reserve: 'eco',
  dog_park: 'pets',
  water_park: 'pool',
  beach_resort: 'beach_access',
  marina: 'directions_boat',
  fishing: 'phishing',
  bird_hide: 'visibility',
  dance: 'music_note',
  disc_golf_course: 'sports',
  miniature_golf: 'golf_course',
  bowling_alley: 'sports_cricket',
  escape_game: 'lock',
  hackerspace: 'computer',
  outdoor_seating: 'outdoor_grill',
  bandstand: 'music_note',
  slipway: 'directions_boat',
  trampoline_park: 'sports',
};

// ---------------------------------------------------------------------------
// Office icons  (office=*)
// ---------------------------------------------------------------------------

const OFFICE_ICONS: Record<string, IconName> = {
  company: 'business',
  government: 'account_balance',
  ngo: 'volunteer_activism',
  lawyer: 'gavel',
  accountant: 'calculate',
  architect: 'architecture',
  engineer: 'engineering',
  it: 'computer',
  telecommunication: 'cell_tower',
  insurance: 'security',
  real_estate: 'home',
  travel_agent: 'travel_explore',
  newspaper: 'newspaper',
  publisher: 'menu_book',
  advertising: 'campaign',
  financial: 'account_balance',
  tax_advisor: 'receipt_long',
  logistics: 'local_shipping',
  employment_agency: 'work',
  educational_institution: 'school',
  political_party: 'flag',
  research: 'biotech',
  consulting: 'business',
  property_management: 'home',
  therapist: 'psychology',
  notary: 'gavel',
  detective: 'search',
  security: 'security',
  charity: 'volunteer_activism',
  foundation: 'volunteer_activism',
  association: 'group',
  union: 'group',
  trade: 'storefront',
  media: 'tv',
  film: 'movie',
  radio: 'radio',
  design: 'design_services',
  photography: 'photo_camera',
  translation: 'translate',
  courier: 'local_shipping',
  shipping: 'local_shipping',
  import_export: 'import_export',
};

// ---------------------------------------------------------------------------
// Healthcare icons  (healthcare=*)
// ---------------------------------------------------------------------------

const HEALTHCARE_ICONS: Record<string, IconName> = {
  hospital: 'local_hospital',
  clinic: 'medical_services',
  pharmacy: 'local_pharmacy',
  doctor: 'person_4',
  dentist: 'dentistry',
  optometrist: 'visibility',
  physiotherapist: 'self_improvement',
  psychologist: 'psychology',
  alternative: 'spa',
  podiatrist: 'medical_services',
  blood_donation: 'bloodtype',
  laboratory: 'science',
  sample_collection: 'science',
  dialysis: 'health_and_safety',
  vaccination_centre: 'vaccines',
  rehabilitation: 'accessibility',
  nursing_home: 'elderly',
  emergency: 'local_hospital',
  centre: 'medical_services',
};

// ---------------------------------------------------------------------------
// General category fallback icons
// ---------------------------------------------------------------------------

const CATEGORY_FALLBACK_ICONS: Record<string, IconName> = {
  food: 'restaurant',
  cafe: 'local_cafe',
  lodging: 'hotel',
  shopping: 'shopping_cart',
  tourism: 'attractions',
  health: 'local_hospital',
  finance: 'account_balance',
  fuel: 'local_gas_station',
  office: 'business_center',
  worship: 'mosque',
  education: 'school',
  government: 'account_balance_wallet',
  transport: 'directions_bus',
  entertainment: 'theaters',
  other: 'place',
};

// ---------------------------------------------------------------------------
// Resolution function — three-level fallback chain
// ---------------------------------------------------------------------------

/**
 * Resolves an icon for a given OSM tag set using a three-level fallback:
 *   1. Specific: exact amenity/shop/tourism/etc. value mapping
 *   2. General:  category-level fallback icon
 *   3. Fallback: 'pin'
 *
 * @param tags      OSM tag dictionary for the element.
 * @param category  The already-resolved PlaceCategory (from tag-mapper.ts).
 */
export function resolveIcon(
  tags: Record<string, string>,
  category: string | null,
): IconResult {
  // Level 1: specific value mapping
  const amenity = tags['amenity'];
  if (amenity) {
    const icon = AMENITY_ICONS[amenity];
    if (icon) return { icon, resolution: 'specific' };
  }

  const shop = tags['shop'];
  if (shop && shop !== 'yes') {
    const icon = SHOP_ICONS[shop];
    if (icon) return { icon, resolution: 'specific' };
  }

  const tourism = tags['tourism'];
  if (tourism && tourism !== 'yes') {
    const icon = TOURISM_ICONS[tourism];
    if (icon) return { icon, resolution: 'specific' };
  }

  const historic = tags['historic'];
  if (historic) {
    const icon = HISTORIC_ICONS[historic];
    if (icon) return { icon, resolution: 'specific' };
  }

  const leisure = tags['leisure'];
  if (leisure) {
    const icon = LEISURE_ICONS[leisure];
    if (icon) return { icon, resolution: 'specific' };
  }

  const office = tags['office'];
  if (office && office !== 'yes') {
    const icon = OFFICE_ICONS[office];
    if (icon) return { icon, resolution: 'specific' };
  }

  const healthcare = tags['healthcare'];
  if (healthcare) {
    const icon = HEALTHCARE_ICONS[healthcare];
    if (icon) return { icon, resolution: 'specific' };
  }

  // Natural features
  const natural = tags['natural'];
  if (natural) {
    const naturalIcons: Record<string, IconName> = {
      water: 'water',
      wetland: 'water',
      wood: 'forest',
      tree: 'park',
      peak: 'landscape',
      cliff: 'landscape',
      beach: 'beach_access',
      cave_entrance: 'terrain',
      spring: 'water_drop',
      river: 'water',
      island: 'island',
    };
    const icon = naturalIcons[natural];
    if (icon) return { icon, resolution: 'specific' };
  }

  // Highway/transport features
  const highway = tags['highway'];
  if (highway) {
    const highwayIcons: Record<string, IconName> = {
      bus_stop: 'directions_bus',
      crossing: 'directions_walk',
      traffic_signals: 'traffic',
      turning_circle: 'roundabout_right',
      milestone: 'place',
      speed_camera: 'camera',
      rest_area: 'local_parking',
      services: 'local_gas_station',
    };
    const icon = highwayIcons[highway];
    if (icon) return { icon, resolution: 'specific' };
  }

  // Level 2: general category fallback
  if (category) {
    const icon = CATEGORY_FALLBACK_ICONS[category];
    if (icon) return { icon, resolution: 'general' };
  }

  // Level 3: ultimate fallback
  return { icon: 'pin', resolution: 'fallback' };
}

/**
 * Simplified helper: returns just the icon name string.
 */
export function iconForTags(
  tags: Record<string, string>,
  category: string | null,
): IconName {
  return resolveIcon(tags, category).icon;
}

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

/** Total number of specific-value icon mappings across all tag namespaces. */
export function totalIconMappings(): number {
  return (
    Object.keys(AMENITY_ICONS).length +
    Object.keys(SHOP_ICONS).length +
    Object.keys(TOURISM_ICONS).length +
    Object.keys(HISTORIC_ICONS).length +
    Object.keys(LEISURE_ICONS).length +
    Object.keys(OFFICE_ICONS).length +
    Object.keys(HEALTHCARE_ICONS).length
  );
}

/** Export all icon tables for CLI --list-icons flag. */
export function allIconTables(): Record<string, Record<string, IconName>> {
  return {
    amenity: AMENITY_ICONS,
    shop: SHOP_ICONS,
    tourism: TOURISM_ICONS,
    historic: HISTORIC_ICONS,
    leisure: LEISURE_ICONS,
    office: OFFICE_ICONS,
    healthcare: HEALTHCARE_ICONS,
  };
}

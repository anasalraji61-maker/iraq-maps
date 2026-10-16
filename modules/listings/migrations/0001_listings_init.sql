-- Listings marketplace: initial schema (schema: listings)
-- Each listing belongs to a verified provider. Provider data stays in its own
-- schema; we reference only the provider_id (UUID) so there is no cross-schema
-- join and no ODbL contamination.

CREATE SCHEMA IF NOT EXISTS listings;

-- ── Category tree ─────────────────────────────────────────────────────────────

CREATE TABLE listings.listing_category (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar    TEXT        NOT NULL CHECK (char_length(name_ar) BETWEEN 1 AND 120),
  name_en    TEXT        NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 120),
  icon       TEXT        NOT NULL DEFAULT '🏷️',
  slug       TEXT        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  parent_id  UUID        REFERENCES listings.listing_category(id) ON DELETE SET NULL
);

-- Seed top-level categories
INSERT INTO listings.listing_category (id, name_ar, name_en, icon, slug) VALUES
  ('00000000-0000-0000-0000-000000000101', 'طعام وشراب',       'Food & Beverage',   '🍔', 'food'),
  ('00000000-0000-0000-0000-000000000102', 'إلكترونيات',       'Electronics',        '📱', 'electronics'),
  ('00000000-0000-0000-0000-000000000103', 'ملابس وأزياء',     'Fashion',            '👗', 'fashion'),
  ('00000000-0000-0000-0000-000000000104', 'منزل وديكور',      'Home & Decor',       '🛋️', 'home'),
  ('00000000-0000-0000-0000-000000000105', 'صحة وجمال',        'Health & Beauty',    '💄', 'health'),
  ('00000000-0000-0000-0000-000000000106', 'خدمات',            'Services',           '🔧', 'services'),
  ('00000000-0000-0000-0000-000000000107', 'سيارات',           'Automotive',         '🚗', 'automotive'),
  ('00000000-0000-0000-0000-000000000108', 'إيجار وتأجير',     'Rentals',            '🔑', 'rentals'),
  ('00000000-0000-0000-0000-000000000109', 'باقات وعروض',      'Packages & Deals',   '🎁', 'packages'),
  ('00000000-0000-0000-0000-000000000110', 'أخرى',             'Other',              '📦', 'other');

-- ── Listing ───────────────────────────────────────────────────────────────────

CREATE TYPE listings.listing_type AS ENUM
  ('product', 'service', 'food_item', 'rental', 'package');

CREATE TABLE listings.listing (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID                    NOT NULL,  -- FK to providers schema by value only
  type                listings.listing_type   NOT NULL,
  title_ar            TEXT                    NOT NULL CHECK (char_length(title_ar) BETWEEN 1 AND 200),
  title_en            TEXT                    NOT NULL CHECK (char_length(title_en) BETWEEN 1 AND 200),
  description_ar      TEXT                    NOT NULL DEFAULT '',
  description_en      TEXT                    NOT NULL DEFAULT '',
  price_iqd           BIGINT                  NOT NULL CHECK (price_iqd >= 0),
  -- JSON array of asset IDs (UUIDs) from media module; max 8 entries
  photo_asset_ids     JSONB                   NOT NULL DEFAULT '[]',
  category_id         UUID                    NOT NULL REFERENCES listings.listing_category(id),
  is_available        BOOLEAN                 NOT NULL DEFAULT TRUE,
  delivery_available  BOOLEAN                 NOT NULL DEFAULT FALSE,
  delivery_notes      TEXT                    CHECK (char_length(delivery_notes) <= 500),
  city_id             TEXT                    NOT NULL CHECK (city_id ~ '^[a-z][a-z0-9-]*$'),
  -- optional lat/lng for map display
  location            GEOMETRY(Point, 4326),
  is_featured         BOOLEAN                 NOT NULL DEFAULT FALSE,
  is_deleted          BOOLEAN                 NOT NULL DEFAULT FALSE,
  view_count          BIGINT                  NOT NULL DEFAULT 0,
  inquiry_count       BIGINT                  NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Provider owns their listings
CREATE INDEX listings_listing_provider_idx
  ON listings.listing (provider_id)
  WHERE NOT is_deleted;

-- Browse: city + available
CREATE INDEX listings_listing_city_avail_idx
  ON listings.listing (city_id, is_available, created_at DESC)
  WHERE NOT is_deleted;

-- Browse: category
CREATE INDEX listings_listing_category_idx
  ON listings.listing (category_id, city_id, created_at DESC)
  WHERE NOT is_deleted;

-- Featured
CREATE INDEX listings_listing_featured_idx
  ON listings.listing (city_id, is_featured, created_at DESC)
  WHERE NOT is_deleted AND is_featured;

-- Price range browse
CREATE INDEX listings_listing_price_idx
  ON listings.listing (price_iqd, city_id)
  WHERE NOT is_deleted AND is_available;

-- Trigram index for Arabic/English title search (requires pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX listings_listing_title_trgm_idx
  ON listings.listing USING GIN ((title_ar || ' ' || title_en) gin_trgm_ops)
  WHERE NOT is_deleted;

-- Spatial index
CREATE INDEX listings_listing_location_idx
  ON listings.listing USING GIST (location)
  WHERE location IS NOT NULL AND NOT is_deleted;

-- ── Update trigger ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION listings.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_updated_at
  BEFORE UPDATE ON listings.listing
  FOR EACH ROW EXECUTE FUNCTION listings.set_updated_at();

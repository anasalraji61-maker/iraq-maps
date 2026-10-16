-- Tour 3D: curated multi-scene tour routes and user ratings.

-- ── Tour routes ───────────────────────────────────────────────────────────────
CREATE TABLE tour3d.tour_route (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar         text        NOT NULL CHECK (char_length(name_ar) BETWEEN 1 AND 200),
  name_en         text        CHECK (char_length(name_en) <= 200),
  description_ar  text        CHECK (char_length(description_ar) <= 2000),
  description_en  text        CHECK (char_length(description_en) <= 2000),
  -- Ordered array of scene UUIDs
  scene_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  city            text        NOT NULL CHECK (city ~ '^[a-z][a-z0-9-]*$'),
  category        text        NOT NULL CHECK (category IN (
                    'heritage','mosque','market','park','museum',
                    'shrine','bridge','neighborhood','other')),
  cover_photo     text        CHECK (char_length(cover_photo) <= 2048),
  view_count      int         NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tour3d_tour_route_city_idx     ON tour3d.tour_route (city);
CREATE INDEX tour3d_tour_route_category_idx ON tour3d.tour_route (category);
CREATE INDEX tour3d_tour_route_views_idx    ON tour3d.tour_route (view_count DESC);

-- ── Tour ratings ──────────────────────────────────────────────────────────────
CREATE TABLE tour3d.tour_rating (
  user_id     uuid        NOT NULL,   -- cross-schema ref, no FK
  tour_id     uuid        NOT NULL REFERENCES tour3d.tour_route (id) ON DELETE CASCADE,
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tour_id)
);

CREATE INDEX tour3d_tour_rating_tour_idx ON tour3d.tour_rating (tour_id);

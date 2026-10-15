-- Tour 3D: virtual walk-through scenes for Iraq landmarks.
CREATE SCHEMA IF NOT EXISTS tour3d;

-- ── Scenes ────────────────────────────────────────────────────────────────────
CREATE TABLE tour3d.scene (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar        text        NOT NULL CHECK (char_length(name_ar) BETWEEN 1 AND 200),
  name_ckb       text        CHECK (char_length(name_ckb) <= 200),
  name_en        text        CHECK (char_length(name_en) <= 200),
  description_ar text        CHECK (char_length(description_ar) <= 2000),
  location       geography(Point, 4326) NOT NULL,
  altitude       numeric(8,2) NOT NULL DEFAULT 0 CHECK (altitude >= 0 AND altitude <= 500),
  city           text        NOT NULL CHECK (city ~ '^[a-z][a-z0-9-]*$'),
  category       text        NOT NULL CHECK (category IN (
                   'heritage','mosque','market','park','museum',
                   'shrine','bridge','neighborhood','other')),
  thumbnail_url  text        CHECK (char_length(thumbnail_url) <= 2048),
  view_count     int         NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tour3d_scene_location_gist ON tour3d.scene USING GIST (location);
CREATE INDEX tour3d_scene_city_idx      ON tour3d.scene (city);
CREATE INDEX tour3d_scene_category_idx  ON tour3d.scene (category);
CREATE INDEX tour3d_scene_views_idx     ON tour3d.scene (view_count DESC);

-- ── Assets ────────────────────────────────────────────────────────────────────
CREATE TABLE tour3d.asset (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id       uuid        NOT NULL REFERENCES tour3d.scene (id) ON DELETE CASCADE,
  type           text        NOT NULL CHECK (type IN ('photo360','video360','model3d')),
  url            text        NOT NULL CHECK (char_length(url) <= 2048),
  heading        numeric(6,2) NOT NULL DEFAULT 0 CHECK (heading >= 0 AND heading <= 360),
  pitch          numeric(6,2) NOT NULL DEFAULT 0 CHECK (pitch >= -90 AND pitch <= 90),
  altitude       numeric(8,2) NOT NULL DEFAULT 0 CHECK (altitude >= 0 AND altitude <= 500),
  sequence_order int         NOT NULL DEFAULT 0 CHECK (sequence_order >= 0),
  label_ar       text        CHECK (char_length(label_ar) <= 200),
  label_en       text        CHECK (char_length(label_en) <= 200),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tour3d_asset_scene_idx ON tour3d.asset (scene_id, sequence_order);

-- ── Annotations ───────────────────────────────────────────────────────────────
CREATE TABLE tour3d.annotation (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id         uuid        NOT NULL REFERENCES tour3d.scene (id) ON DELETE CASCADE,
  location         geography(Point, 4326) NOT NULL,
  altitude         numeric(8,2) NOT NULL DEFAULT 0 CHECK (altitude >= 0 AND altitude <= 500),
  label_ar         text        NOT NULL CHECK (char_length(label_ar) BETWEEN 1 AND 200),
  label_ckb        text        CHECK (char_length(label_ckb) <= 200),
  label_en         text        CHECK (char_length(label_en) <= 200),
  icon_type        text        NOT NULL DEFAULT 'info' CHECK (icon_type IN (
                     'info','place','photo','food','mosque','historic','shop')),
  linked_place_id  text,       -- cross-schema reference, no FK
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tour3d_annotation_scene_idx ON tour3d.annotation (scene_id);

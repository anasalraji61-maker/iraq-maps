-- M75: place reviews and ratings
CREATE TABLE places.review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- one review per user per place (upsert on conflict)
  UNIQUE (place_id, user_id)
);

CREATE INDEX review_place_id_created_at_idx ON places.review (place_id, created_at DESC);

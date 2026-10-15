-- Search module schema
-- Schema: search (isolated from other modules per architecture rules)

CREATE SCHEMA IF NOT EXISTS search;

-- -------------------------------------------------------------------------
-- search_history: one row per user query; max 20 kept per user (enforced in
-- the service layer). Older rows are pruned on each save.
-- -------------------------------------------------------------------------
CREATE TABLE search.search_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  query       text        NOT NULL CHECK (length(trim(query)) > 0 AND length(query) <= 200),
  filters     jsonb,
  result_count int,
  searched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX search_history_user_time_idx ON search.search_history (user_id, searched_at DESC);

-- -------------------------------------------------------------------------
-- search_clicks: analytics table — records when a user taps a result.
-- Used to boost trending queries and personalise future results.
-- -------------------------------------------------------------------------
CREATE TABLE search.search_clicks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  query       text        NOT NULL,
  result_id   text        NOT NULL,
  result_type text        NOT NULL CHECK (result_type IN ('place','post','user','event','listing','tour')),
  clicked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX search_clicks_query_idx  ON search.search_clicks (query, clicked_at DESC);
CREATE INDEX search_clicks_user_idx   ON search.search_clicks (user_id, clicked_at DESC) WHERE user_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- search_trending: pre-aggregated popular queries, refreshed hourly by
-- SearchService.refreshTrending(). One row per (query, city) pair.
-- -------------------------------------------------------------------------
CREATE TABLE search.search_trending (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  query      text        NOT NULL,
  city_id    text,
  count      int         NOT NULL DEFAULT 1 CHECK (count > 0),
  trend      text        NOT NULL DEFAULT 'stable' CHECK (trend IN ('rising','stable','falling')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query, city_id)
);

CREATE INDEX search_trending_city_count_idx ON search.search_trending (city_id, count DESC, updated_at DESC);

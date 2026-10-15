-- M90: add category column for content-based filtering
ALTER TABLE discover.post
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS post_category_idx ON discover.post (category)
  WHERE category IS NOT NULL;

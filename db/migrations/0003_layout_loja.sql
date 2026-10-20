ALTER TABLE stores ADD COLUMN layout TEXT NOT NULL DEFAULT 'cozy'
  CHECK(layout IN ('cozy','compact','showcase'));

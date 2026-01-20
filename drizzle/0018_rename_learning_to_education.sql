-- Migration: Rename learning table to education
-- This renames the table and updates all FTS tables and triggers

-- ============================================================================
-- DROP OLD FTS TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS learning_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_au;
--> statement-breakpoint

-- ============================================================================
-- DROP OLD FTS TABLE
-- ============================================================================

DROP TABLE IF EXISTS learning_fts;
--> statement-breakpoint

-- ============================================================================
-- RENAME TABLE
-- ============================================================================

ALTER TABLE learning RENAME TO education;
--> statement-breakpoint

-- ============================================================================
-- CREATE NEW FTS TABLE
-- ============================================================================

CREATE VIRTUAL TABLE education_fts USING fts5(
  name,
  description,
  content='education',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- ============================================================================
-- CREATE NEW TRIGGERS
-- ============================================================================

CREATE TRIGGER education_ai AFTER INSERT ON education BEGIN
  INSERT INTO education_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER education_ad AFTER DELETE ON education BEGIN
  INSERT INTO education_fts(education_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER education_au AFTER UPDATE ON education BEGIN
  INSERT INTO education_fts(education_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO education_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- ============================================================================
-- POPULATE FTS TABLE WITH EXISTING DATA
-- ============================================================================

INSERT INTO education_fts(rowid, name, description)
SELECT id, name, description FROM education;

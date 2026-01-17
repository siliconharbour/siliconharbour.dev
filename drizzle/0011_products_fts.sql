-- FTS5 virtual table for products full-text search

-- Products FTS (name, description)
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name,
  description,
  content='products',
  content_rowid='id'
);
--> statement-breakpoint

-- Products triggers
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO products_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- Populate FTS table with existing data (if any)
INSERT INTO products_fts(rowid, name, description)
SELECT id, name, description FROM products;

-- Migration: Switch FTS5 tables to trigram tokenizer for substring search
-- This enables searching "net" to find "ACENET"

-- ============================================================================
-- DROP EXISTING TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS events_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS events_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS events_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS companies_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS companies_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS companies_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS groups_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS groups_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS groups_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS learning_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS learning_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS people_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS people_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS people_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS news_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS news_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS news_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS jobs_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS jobs_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS jobs_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS projects_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_au;
--> statement-breakpoint

DROP TRIGGER IF EXISTS products_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS products_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS products_au;
--> statement-breakpoint

-- ============================================================================
-- DROP EXISTING FTS TABLES
-- ============================================================================

DROP TABLE IF EXISTS events_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS companies_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS groups_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS learning_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS people_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS news_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS jobs_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS projects_fts;
--> statement-breakpoint
DROP TABLE IF EXISTS products_fts;
--> statement-breakpoint

-- ============================================================================
-- CREATE NEW FTS TABLES WITH TRIGRAM TOKENIZER
-- ============================================================================

-- Events FTS (title, description, organizer, location)
CREATE VIRTUAL TABLE events_fts USING fts5(
  title,
  description,
  organizer,
  location,
  content='events',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Companies FTS (name, description, location)
CREATE VIRTUAL TABLE companies_fts USING fts5(
  name,
  description,
  location,
  content='companies',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Groups FTS (name, description)
CREATE VIRTUAL TABLE groups_fts USING fts5(
  name,
  description,
  content='groups',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Learning FTS (name, description)
CREATE VIRTUAL TABLE learning_fts USING fts5(
  name,
  description,
  content='learning',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- People FTS (name, bio)
CREATE VIRTUAL TABLE people_fts USING fts5(
  name,
  bio,
  content='people',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- News FTS (title, content, excerpt)
CREATE VIRTUAL TABLE news_fts USING fts5(
  title,
  content,
  excerpt,
  content='news',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Jobs FTS (title, description, company_name, location)
CREATE VIRTUAL TABLE jobs_fts USING fts5(
  title,
  description,
  company_name,
  location,
  content='jobs',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Projects FTS (name, description)
CREATE VIRTUAL TABLE projects_fts USING fts5(
  name,
  description,
  content='projects',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- Products FTS (name, description)
CREATE VIRTUAL TABLE products_fts USING fts5(
  name,
  description,
  content='products',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- ============================================================================
-- RECREATE TRIGGERS
-- ============================================================================

-- Events triggers
CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;
--> statement-breakpoint

CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
END;
--> statement-breakpoint

CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;
--> statement-breakpoint

-- Companies triggers
CREATE TRIGGER companies_ai AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid, name, description, location)
  VALUES (NEW.id, NEW.name, NEW.description, NEW.location);
END;
--> statement-breakpoint

CREATE TRIGGER companies_ad AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, location)
  VALUES ('delete', OLD.id, OLD.name, OLD.description, OLD.location);
END;
--> statement-breakpoint

CREATE TRIGGER companies_au AFTER UPDATE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, location)
  VALUES ('delete', OLD.id, OLD.name, OLD.description, OLD.location);
  INSERT INTO companies_fts(rowid, name, description, location)
  VALUES (NEW.id, NEW.name, NEW.description, NEW.location);
END;
--> statement-breakpoint

-- Groups triggers
CREATE TRIGGER groups_ai AFTER INSERT ON groups BEGIN
  INSERT INTO groups_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER groups_ad AFTER DELETE ON groups BEGIN
  INSERT INTO groups_fts(groups_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER groups_au AFTER UPDATE ON groups BEGIN
  INSERT INTO groups_fts(groups_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO groups_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- Learning triggers
CREATE TRIGGER learning_ai AFTER INSERT ON learning BEGIN
  INSERT INTO learning_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER learning_ad AFTER DELETE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER learning_au AFTER UPDATE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO learning_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- People triggers
CREATE TRIGGER people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;
--> statement-breakpoint

CREATE TRIGGER people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
END;
--> statement-breakpoint

CREATE TRIGGER people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;
--> statement-breakpoint

-- News triggers
CREATE TRIGGER news_ai AFTER INSERT ON news BEGIN
  INSERT INTO news_fts(rowid, title, content, excerpt)
  VALUES (NEW.id, NEW.title, NEW.content, NEW.excerpt);
END;
--> statement-breakpoint

CREATE TRIGGER news_ad AFTER DELETE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, content, excerpt)
  VALUES ('delete', OLD.id, OLD.title, OLD.content, OLD.excerpt);
END;
--> statement-breakpoint

CREATE TRIGGER news_au AFTER UPDATE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, content, excerpt)
  VALUES ('delete', OLD.id, OLD.title, OLD.content, OLD.excerpt);
  INSERT INTO news_fts(rowid, title, content, excerpt)
  VALUES (NEW.id, NEW.title, NEW.content, NEW.excerpt);
END;
--> statement-breakpoint

-- Jobs triggers
CREATE TRIGGER jobs_ai AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts(rowid, title, description, company_name, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.company_name, NEW.location);
END;
--> statement-breakpoint

CREATE TRIGGER jobs_ad AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, description, company_name, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.company_name, OLD.location);
END;
--> statement-breakpoint

CREATE TRIGGER jobs_au AFTER UPDATE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, description, company_name, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.company_name, OLD.location);
  INSERT INTO jobs_fts(rowid, title, description, company_name, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.company_name, NEW.location);
END;
--> statement-breakpoint

-- Projects triggers
CREATE TRIGGER projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO projects_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER projects_ad AFTER DELETE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER projects_au AFTER UPDATE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO projects_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- Products triggers
CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;
--> statement-breakpoint

CREATE TRIGGER products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO products_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;
--> statement-breakpoint

-- ============================================================================
-- POPULATE FTS TABLES WITH EXISTING DATA
-- ============================================================================

INSERT INTO events_fts(rowid, title, description, organizer, location)
SELECT id, title, description, organizer, location FROM events;
--> statement-breakpoint

INSERT INTO companies_fts(rowid, name, description, location)
SELECT id, name, description, location FROM companies;
--> statement-breakpoint

INSERT INTO groups_fts(rowid, name, description)
SELECT id, name, description FROM groups;
--> statement-breakpoint

INSERT INTO learning_fts(rowid, name, description)
SELECT id, name, description FROM learning;
--> statement-breakpoint

INSERT INTO people_fts(rowid, name, bio)
SELECT id, name, bio FROM people;
--> statement-breakpoint

INSERT INTO news_fts(rowid, title, content, excerpt)
SELECT id, title, content, excerpt FROM news;
--> statement-breakpoint

INSERT INTO jobs_fts(rowid, title, description, company_name, location)
SELECT id, title, description, company_name, location FROM jobs;
--> statement-breakpoint

INSERT INTO projects_fts(rowid, name, description)
SELECT id, name, description FROM projects;
--> statement-breakpoint

INSERT INTO products_fts(rowid, name, description)
SELECT id, name, description FROM products;

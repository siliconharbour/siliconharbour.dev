-- FTS5 virtual tables for full-text search
-- Each content type gets its own FTS table with searchable fields

-- Events FTS (title, description, organizer, location)
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  title,
  description,
  organizer,
  location,
  content='events',
  content_rowid='id'
);

-- Companies FTS (name, description, location)
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  name,
  description,
  location,
  content='companies',
  content_rowid='id'
);

-- Groups FTS (name, description)
CREATE VIRTUAL TABLE IF NOT EXISTS groups_fts USING fts5(
  name,
  description,
  content='groups',
  content_rowid='id'
);

-- Learning FTS (name, description)
CREATE VIRTUAL TABLE IF NOT EXISTS learning_fts USING fts5(
  name,
  description,
  content='learning',
  content_rowid='id'
);

-- People FTS (name, bio)
CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  name,
  bio,
  content='people',
  content_rowid='id'
);

-- News FTS (title, content, excerpt)
CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(
  title,
  content,
  excerpt,
  content='news',
  content_rowid='id'
);

-- Jobs FTS (title, description, company_name, location)
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(
  title,
  description,
  company_name,
  location,
  content='jobs',
  content_rowid='id'
);

-- Projects FTS (name, description)
CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
  name,
  description,
  content='projects',
  content_rowid='id'
);

--> statement-breakpoint

-- Triggers to keep FTS tables in sync

-- Events triggers
CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;

CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
END;

CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;

--> statement-breakpoint

-- Companies triggers
CREATE TRIGGER IF NOT EXISTS companies_ai AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid, name, description, location)
  VALUES (NEW.id, NEW.name, NEW.description, NEW.location);
END;

CREATE TRIGGER IF NOT EXISTS companies_ad AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, location)
  VALUES ('delete', OLD.id, OLD.name, OLD.description, OLD.location);
END;

CREATE TRIGGER IF NOT EXISTS companies_au AFTER UPDATE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, location)
  VALUES ('delete', OLD.id, OLD.name, OLD.description, OLD.location);
  INSERT INTO companies_fts(rowid, name, description, location)
  VALUES (NEW.id, NEW.name, NEW.description, NEW.location);
END;

--> statement-breakpoint

-- Groups triggers
CREATE TRIGGER IF NOT EXISTS groups_ai AFTER INSERT ON groups BEGIN
  INSERT INTO groups_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

CREATE TRIGGER IF NOT EXISTS groups_ad AFTER DELETE ON groups BEGIN
  INSERT INTO groups_fts(groups_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;

CREATE TRIGGER IF NOT EXISTS groups_au AFTER UPDATE ON groups BEGIN
  INSERT INTO groups_fts(groups_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO groups_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

--> statement-breakpoint

-- Learning triggers
CREATE TRIGGER IF NOT EXISTS learning_ai AFTER INSERT ON learning BEGIN
  INSERT INTO learning_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

CREATE TRIGGER IF NOT EXISTS learning_ad AFTER DELETE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;

CREATE TRIGGER IF NOT EXISTS learning_au AFTER UPDATE ON learning BEGIN
  INSERT INTO learning_fts(learning_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO learning_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

--> statement-breakpoint

-- People triggers
CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;

CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
END;

CREATE TRIGGER IF NOT EXISTS people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;

--> statement-breakpoint

-- News triggers
CREATE TRIGGER IF NOT EXISTS news_ai AFTER INSERT ON news BEGIN
  INSERT INTO news_fts(rowid, title, content, excerpt)
  VALUES (NEW.id, NEW.title, NEW.content, NEW.excerpt);
END;

CREATE TRIGGER IF NOT EXISTS news_ad AFTER DELETE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, content, excerpt)
  VALUES ('delete', OLD.id, OLD.title, OLD.content, OLD.excerpt);
END;

CREATE TRIGGER IF NOT EXISTS news_au AFTER UPDATE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, content, excerpt)
  VALUES ('delete', OLD.id, OLD.title, OLD.content, OLD.excerpt);
  INSERT INTO news_fts(rowid, title, content, excerpt)
  VALUES (NEW.id, NEW.title, NEW.content, NEW.excerpt);
END;

--> statement-breakpoint

-- Jobs triggers
CREATE TRIGGER IF NOT EXISTS jobs_ai AFTER INSERT ON jobs BEGIN
  INSERT INTO jobs_fts(rowid, title, description, company_name, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.company_name, NEW.location);
END;

CREATE TRIGGER IF NOT EXISTS jobs_ad AFTER DELETE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, description, company_name, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.company_name, OLD.location);
END;

CREATE TRIGGER IF NOT EXISTS jobs_au AFTER UPDATE ON jobs BEGIN
  INSERT INTO jobs_fts(jobs_fts, rowid, title, description, company_name, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.company_name, OLD.location);
  INSERT INTO jobs_fts(rowid, title, description, company_name, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.company_name, NEW.location);
END;

--> statement-breakpoint

-- Projects triggers
CREATE TRIGGER IF NOT EXISTS projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO projects_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

CREATE TRIGGER IF NOT EXISTS projects_ad AFTER DELETE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
END;

CREATE TRIGGER IF NOT EXISTS projects_au AFTER UPDATE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description)
  VALUES ('delete', OLD.id, OLD.name, OLD.description);
  INSERT INTO projects_fts(rowid, name, description)
  VALUES (NEW.id, NEW.name, NEW.description);
END;

--> statement-breakpoint

-- Populate FTS tables with existing data
INSERT INTO events_fts(rowid, title, description, organizer, location)
SELECT id, title, description, organizer, location FROM events;

INSERT INTO companies_fts(rowid, name, description, location)
SELECT id, name, description, location FROM companies;

INSERT INTO groups_fts(rowid, name, description)
SELECT id, name, description FROM groups;

INSERT INTO learning_fts(rowid, name, description)
SELECT id, name, description FROM learning;

INSERT INTO people_fts(rowid, name, bio)
SELECT id, name, bio FROM people;

INSERT INTO news_fts(rowid, title, content, excerpt)
SELECT id, title, content, excerpt FROM news;

INSERT INTO jobs_fts(rowid, title, description, company_name, location)
SELECT id, title, description, company_name, location FROM jobs;

INSERT INTO projects_fts(rowid, name, description)
SELECT id, name, description FROM projects;

-- up
CREATE TABLE IF NOT EXISTS "posts" (
	`id` TEXT,
	`slug` TEXT,
	`draft` BOOLEAN NOT NULL DEFAULT 0,
	`private` BOOLEAN NOT NULL DEFAULT 0,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`modified` DATETIME,
	`text` TEXT NOT NULL,
	`import_url` TEXT,
	`import_raw` TEXT,
	PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS "media" (
	`id` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`ext` TEXT NOT NULL,
	`data` BLOB NOT NULL,
	`src` TEXT,
	PRIMARY KEY (`id`)
);

-- down
DROP TABLE "media";
DROP TABLE "posts";

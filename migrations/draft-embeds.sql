-- up
CREATE TABLE IF NOT EXISTS "embeds" (
	`id` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`original_url` TEXT NOT NULL,
	`mimetype` TEXT NOT NULL,

	`og:url` TEXT NOT NULL,
	`og:type` TEXT,
	`og:title` TEXT,
	`og:site_name` TEXT,
	`og:description` TEXT,
	`og:image` JSON,
	`og:video` JSON,
	`og:audio` JSON,
	`raw_og` JSON,
	PRIMARY KEY (`id`),
	UNIQUE (`original_url`)
);

-- down
DROP TABLE "embeds";

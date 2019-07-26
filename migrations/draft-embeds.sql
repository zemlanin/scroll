-- up
CREATE TABLE IF NOT EXISTS "embeds" (
	`original_url` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
	PRIMARY KEY (`original_url`)
);

CREATE TABLE IF NOT EXISTS "post_embed_links" (
	`id` TEXT,
	`post_id` TEXT,
	`original_url` TEXT,
	PRIMARY KEY (`id`),
	UNIQUE (`post_id`, `original_url`)
);

-- down
DROP TABLE "post_embed_links";
DROP TABLE "embeds";

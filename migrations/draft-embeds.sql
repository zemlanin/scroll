-- up
CREATE TABLE IF NOT EXISTS "embeds" (
	`original_url` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`mimetype` TEXT NOT NULL,
	`raw_metadata` JSON,

	`rendered_html` TEXT NOT NULL,
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

-- up
CREATE TABLE IF NOT EXISTS "opengraph_embeds" (
	`id` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`original_url` TEXT NOT NULL,
	`url` TEXT NOT NULL,
	`type` TEXT,
	`title` TEXT,
	`site_name` TEXT,
	`description` TEXT,
	`image` JSON,
	`video` JSON,
	`audio` JSON,
	`raw` JSON,
	PRIMARY KEY (`id`),
	UNIQUE (`original_url`)
);

-- down
DROP TABLE "opengraph_embeds";

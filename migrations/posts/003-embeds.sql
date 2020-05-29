-- up
CREATE TABLE IF NOT EXISTS "embeds" (
	`original_url` TEXT NOT NULL,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`mimetype` TEXT NOT NULL,
	`raw_metadata` JSON,

	PRIMARY KEY (`original_url`)
);

-- down
DROP TABLE "embeds";

-- up
CREATE TABLE IF NOT EXISTS "linklist" (
	`id` TEXT NOT NULL,
	`source_id` TEXT NOT NULL,
	`original_url` TEXT NOT NULL,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`card_overrides` TEXT,
	`private` BOOLEAN NOT NULL DEFAULT 0,

	PRIMARY KEY (`id`)
);

-- down
DROP TABLE "linklist";

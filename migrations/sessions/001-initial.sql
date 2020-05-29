-- up
CREATE TABLE IF NOT EXISTS "sessions" (
	`id` TEXT,
	`last_access` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`data` JSON,
	PRIMARY KEY (`id`)
);

-- down
DROP TABLE "sessions";

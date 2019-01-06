-- up
CREATE TABLE IF NOT EXISTS "converted_media" (
	`id` TEXT,
	`created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`media_id` TEXT,
	`tag` TEXT,
	`ext` TEXT NOT NULL,
	`data` BLOB NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE (`media_id`, `tag`)
);

-- down
DROP TABLE "converted_media";

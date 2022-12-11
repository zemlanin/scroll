-- up
CREATE TABLE IF NOT EXISTS "actors" (
  `id` TEXT NOT NULL,
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `key_id` TEXT NOT NULL,
  `public_key` TEXT NOT NULL,
  `private_key` TEXT,
  `inbox` TEXT,
  `shared_inbox` TEXT,
  `hidden` BOOLEAN NOT NULL DEFAULT 0,
  `blocked` BOOLEAN NOT NULL DEFAULT 0,
  `name` TEXT,
  `url` TEXT,
  `icon` TEXT,
  PRIMARY KEY (`id`)
);

-- down
DROP TABLE "actors";

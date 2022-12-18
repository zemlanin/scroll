-- up
CREATE TABLE IF NOT EXISTS "inbox" (
  `id` TEXT NOT NULL,
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actor_id` TEXT NOT NULL,
  /*
    saved types:
    - Follow (`object_id` = followed actor)
    - Like (`object_id` = liked post)
    - Announce (`object_id` = boosted post)
    - Create (`object_id` = note with a reply, saved in `replies`)

    Undo and Delete are handled without saving
  */
  `type` TEXT NOT NULL,
  `object_id` TEXT NOT NULL,
  `hidden` BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS "replies" (
  `id` TEXT NOT NULL,
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actor_id` TEXT NOT NULL,
  `object` JSON,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS "outbox" (
  `id` TEXT NOT NULL,
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `to` TEXT NOT NULL,
  `message` JSON,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS "deliveries" (
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `inbox` TEXT NOT NULL,
  `message_id` TEXT NOT NULL,
  `retries` NUMBER NOT NULL DEFAULT 0,
  `next_try` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_failure` JSON,
  UNIQUE (`message_id`, `inbox`)
);

-- down
DROP TABLE "inbox";
DROP TABLE "replies";
DROP TABLE "outbox";
DROP TABLE "deliveries";

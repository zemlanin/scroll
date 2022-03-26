-- up
CREATE TABLE IF NOT EXISTS "media_dimensions" (
  `id` TEXT NOT NULL,
  `size` NUMERIC,
  `width` NUMERIC,
  `height` NUMERIC,
  `duration_ms` NUMERIC,

  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS "converted_media_dimensions" (
  `id` TEXT NOT NULL,
  `media_id` TEXT NOT NULL,
  `tag` TEXT NOT NULL,
  `size` NUMERIC,
  `width` NUMERIC,
  `height` NUMERIC,
  `duration_ms` NUMERIC,

  PRIMARY KEY (`id`),
  UNIQUE (`media_id`, `tag`)
);

-- down
DROP TABLE "converted_media_dimensions";
DROP TABLE "media_dimensions";

const fs = require("fs");
const os = require("os");
const path = require("path");

const test = require("tape-promise/tape");
const sqlite = require("sqlite");

const generate = require("../../index.js");

const noopStream = new require("stream").Writable({
  write(chunk, encoding, callback) {
    setImmediate(callback);
  }
});

test(async t => {
  const db = await sqlite.open(":memory:");
  await db.migrate();

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  t.end();
});

test(async t => {
  const db = await sqlite.open(":memory:");
  await db.migrate();

  await db.run(`
    INSERT INTO posts
      (id, text)
    VALUES
      ("1", "lol"),
      ("2", "kek"),
      ("3", "# heading");
  `);

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  t.end();
});

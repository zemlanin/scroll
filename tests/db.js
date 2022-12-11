const path = require("path");

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

module.exports = {
  async getTestDB() {
    const db = await sqlite.open({
      filename: ":memory:",
      driver: sqlite3.Database,
    });
    await db.migrate({
      migrationsPath: path.resolve(__dirname, "../migrations/posts"),
    });

    const asdb = await sqlite.open({
      filename: ":memory:",
      driver: sqlite3.Database,
    });
    await asdb.migrate({
      migrationsPath: path.resolve(__dirname, "../migrations/activitystreams"),
    });
    return { db, asdb };
  },
};

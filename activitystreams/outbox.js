const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const fetchModule = import("node-fetch");

const { ACTIVITYSTREAMS_DB } = require("../common.js");

module.exports = {
  watch,
  attemptDelivery,
};

const RETRY_TIMEOUT = 1000 * 5; // 5 seconds

function watch() {
  checkAndSend()
    .then(() => setTimeout(watch, RETRY_TIMEOUT))
    .catch(() => setTimeout(watch, RETRY_TIMEOUT * (Math.random() + 1)));
}

async function attemptDelivery(asdb, id, inbox) {
  const { default: fetch } = await fetchModule;

  const message = await asdb.get(
    `SELECT id, message FROM outbox WHERE id = ?1`,
    {
      1: id,
    }
  );

  const resp = await fetch(inbox, {
    method: "post",
    headers: {
      Accept: "application/activity+json",
      "Content-Type": "application/activity+json",
    },
    body: JSON.stringify({
      "@context": "https://www.w3.org/ns/activitystreams",
      id,
      ...message,
    }),
  }).catch((e) => {
    return {
      status: 9999,
      text() {
        return e.toString();
      },
    };
  });

  if (resp.status >= 400) {
    await asdb.run(
      `INSERT INTO deliveries (
        message_id,
        inbox,
        retries,
        next_try,
        last_failure
      ) VALUES (
        ?1,
        ?2,
        1,
        datetime('now', '+20 seconds'),
        ?3
      ) ON CONFLICT
      DO UPDATE SET
        retries = retries + 1,
        next_try = datetime('now', '+1 minute'),
        last_failure = ?3
      WHERE message_id = ?1 AND inbox = ?2`,
      {
        1: id,
        2: inbox,
        3: {
          status: resp.status,
          text: (await resp.text()).slice(0, 1000),
        },
      }
    );
  }
}

async function checkAndSend() {
  const asdb = await sqlite.open({
    filename: ACTIVITYSTREAMS_DB,
    driver: sqlite3.Database,
  });

  await asdb.run("SELECT 1;");
  // TODO
}

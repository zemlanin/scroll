const crypto = require("crypto");
const jsprim = require("jsprim");

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const fetchModule = import("node-fetch");

const { ACTIVITYSTREAMS_DB } = require("../common.js");

const { getMessageId } = require("./common.js");

module.exports = {
  watch,
  attemptDelivery,
  createMessage,
  notifyFollowers,
};

const RETRY_TIMEOUT = 1000 * 5; // 5 seconds

function watch() {
  checkAndSend()
    .then(() => setTimeout(watch, RETRY_TIMEOUT))
    .catch((e) => {
      console.error(e);
      setTimeout(watch, RETRY_TIMEOUT * (Math.random() + 1));
    });
}

async function attemptDelivery(asdb, id, inbox, stdout, stderr) {
  const { default: fetch, Request } = await fetchModule;

  const { message, sender } = await asdb.get(
    `SELECT message, from_ AS sender FROM outbox WHERE id = ?1`,
    {
      1: id,
    }
  );

  const { key_id, private_key } = await asdb.get(
    `SELECT key_id, private_key FROM actors WHERE id = ?1;`,
    { 1: sender }
  );

  const body = JSON.stringify({
    "@context": "https://www.w3.org/ns/activitystreams",
    id,
    ...JSON.parse(message),
  });

  const digestHash = crypto.createHash("sha256");
  digestHash.update(body);

  const req = new Request(inbox, {
    method: "post",
    headers: {
      accept: "application/activity+json",
      "content-type": "application/activity+json",
      digest: `sha-256=${digestHash.digest("base64")}`,
      date: jsprim.rfc1123(new Date()),
    },
    body: body,
  });

  const { pathname, host } = new URL(req.url);

  const signedString = [
    `(request-target): ${req.method.toLowerCase()} ${pathname}`,
    `host: ${host}`,
    `date: ${req.headers.get("date")}`,
    `digest: ${req.headers.get("digest")}`,
  ].join("\n");

  const algorithm = "rsa-sha256";

  const signer = crypto.createSign(algorithm);
  signer.write(signedString);
  signer.end();

  const signature = signer.sign(private_key, "base64");
  req.headers.set(
    "signature",
    `keyId="${key_id}",algorithm="${algorithm}",headers="${signedString
      .split("\n")
      .map((line) => line.slice(0, line.indexOf(":")))
      .join(" ")}",signature="${signature}"`
  );

  stdout.write(`sending message ${id} to ${inbox}\n`);

  const resp =
    process.env.NODE_ENV === "development"
      ? { status: 200 }
      : await fetch(req).catch((e) => {
          return {
            status: 9999,
            text() {
              return e.toString();
            },
          };
        });

  if (resp.status >= 400) {
    const text = await resp.text();
    stderr.write(`failed to send message ${id}: ${JSON.stringify(text)}\n`);
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
        3: JSON.stringify({
          status: resp.status,
          text: text.slice(0, 1000),
        }),
      }
    );
  } else {
    const text = await resp.text();

    await asdb.run(
      `UPDATE deliveries SET next_try = NULL, last_failure = ?2 WHERE message_id = ?1`,
      {
        1: id,
        2: JSON.stringify({
          status: resp.status,
          text: text.slice(0, 1000),
        }),
      }
    );
  }
}

async function checkAndSend(stdout, stderr) {
  const asdb = await sqlite.open({
    filename: ACTIVITYSTREAMS_DB,
    driver: sqlite3.Database,
  });

  const dt = new Date();

  let messages = await getNextDeliveryAttempts(asdb, dt);

  while (messages.length) {
    await Promise.all(
      messages.map(({ message_id, inbox }) =>
        attemptDelivery(
          asdb,
          message_id,
          inbox,
          stdout || process.stdout,
          stderr || process.stderr
        )
      )
    );

    messages = await getNextDeliveryAttempts(asdb);
  }
}

async function createMessage(asdb, { from, to, type, object }) {
  const id = new URL(`#outbox-${getMessageId()}`, from);

  await asdb.run(
    `INSERT INTO outbox (id, from_, to_, message) VALUES (?1, ?4, ?2, ?3)`,
    {
      1: id,
      2: to || "https://www.w3.org/ns/activitystreams#Public",
      3: JSON.stringify({
        type,
        object,
        actor: from,
      }),
      4: from,
    }
  );

  return id;
}

async function notifyFollowers(asdb, messageId, followedActor) {
  const sharedInboxes = await asdb.all(
    `
      SELECT shared_inbox AS inbox FROM actors a
      LEFT JOIN inbox ON inbox.actor_id = a.id
      WHERE a.shared_inbox != ''
        AND a.shared_inbox IS NOT NULL
        AND a.blocked != 1
        AND inbox.type = 'Follow'
        AND inbox.object_id = ?1
      GROUP BY a.shared_inbox;
    `,
    { 1: followedActor }
  );

  const soloInboxes = await asdb.all(
    `
      SELECT a.inbox AS inbox FROM actors a
      LEFT JOIN inbox ON inbox.actor_id = a.id
      WHERE (a.shared_inbox = '' OR a.shared_inbox IS NULL)
        AND a.blocked != 1
        AND inbox.type = 'Follow'
        AND inbox.object_id = ?1
      GROUP BY a.inbox;
    `,
    { 1: followedActor }
  );

  for (const { inbox } of [...sharedInboxes, ...soloInboxes]) {
    await planDelivery(asdb, messageId, inbox);
  }
}

async function planDelivery(asdb, messageId, inbox) {
  await asdb.run(`INSERT INTO deliveries (message_id, inbox) VALUES (?1, ?2)`, {
    1: messageId,
    2: inbox,
  });
}

async function getNextDeliveryAttempts(asdb, dt) {
  return await asdb.all(
    `
      SELECT message_id, inbox
      FROM deliveries
      WHERE next_try IS NOT NULL
        AND CAST(datetime(next_try) AS INT) < ?1
        AND retries < ?2
      ORDER BY next_try ASC
      LIMIT 20;
    `,
    {
      1: +dt,
      2: 3,
    }
  );
}

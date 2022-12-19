const crypto = require("crypto");
const jsprim = require("jsprim");

const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");

const fetchModule = import("node-fetch");

const { ACTIVITYSTREAMS_DB, getBlogObject } = require("../common.js");

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
  const { default: fetch, Request } = await fetchModule;

  const blogActor = (await getBlogObject()).activitystream.id;

  const { key_id, private_key } = await asdb.get(
    `SELECT key_id, private_key FROM actors WHERE id = ?1;`,
    { 1: blogActor }
  );

  const message = await asdb.get(
    `SELECT id, message FROM outbox WHERE id = ?1`,
    {
      1: id,
    }
  );

  const body = JSON.stringify({
    "@context": "https://www.w3.org/ns/activitystreams",
    id,
    ...message,
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
    `(request-target): ${req} ${pathname}`,
    `host: ${host}`,
    `date: ${req.headers.get("date")}`,
    `digest: ${req.headers.get("digest")}`,
  ].join("\n");

  const sign = crypto.createSign("SHA256");
  sign.write(signedString);
  sign.end();

  const signature = sign.sign(private_key, "base64");
  req.headers.set(
    "signature",
    `keyId="${key_id}",headers="${signedString
      .split("\n")
      .map((line) => line.slice(0, line.indexOf(":")))
      .join(" ")}",signature="${signature}"`
  );

  console.log(req.url);
  console.log(JSON.stringify(signedString));
  console.log(signature);

  const resp = await fetch(req).catch((e) => {
    return {
      status: 9999,
      text() {
        return e.toString();
      },
    };
  });

  console.log(resp.status);
  console.log(req.getHeaders());

  if (resp.status >= 400) {
    const text = await resp.text();
    console.error(text);
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

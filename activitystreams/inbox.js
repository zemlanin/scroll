const httpSignature = require("http-signature");

const fetchModule = import("node-fetch");

module.exports = inbox;

async function inbox(req, res) {
  if (req.post?.["@context"] !== "https://www.w3.org/ns/activitystreams") {
    res.statusCode = 400;

    return { detail: "invalid @context" };
  }

  console.log(req.url);
  console.log(JSON.stringify(req.post));

  if (!req.headers.authorization && !req.headers.signature) {
    res.statusCode = 401;

    console.log("missing http signature");
    return { detail: "missing http signature" };
  }

  if (!(await verify(req))) {
    // early exit for deleting unknown actors/activity
    if (req.post.type === "Delete") {
      res.statusCode = 200;

      return;
    }

    res.statusCode = 401;

    console.log("invalid signature");
    return { detail: "invalid signature" };
  }

  switch (req.post.type) {
    case "Follow":
      return handleFollow(req, res);
    case "Announce":
      return handleAnnounce(req, res);
    case "Like":
      return handleLike(req, res);
    case "Create":
      return handleCreate(req, res);
    case "Undo":
      return handleUndo(req, res);
    case "Delete":
      return handleDelete(req, res);
  }

  res.statusCode = 400;

  return { detail: "unknown activity type" };
}

async function verify(req) {
  let sigHead;

  try {
    sigHead = httpSignature.parseRequest(req);
  } catch (e) {
    return false;
  }

  const cachedKey = await getCachedPublicKey(await req.asdb(), sigHead.keyId);

  if (cachedKey && httpSignature.verifySignature(sigHead, cachedKey)) {
    return true;
  }

  // early exit for deleting unknown actors/activity
  if (req.post.type === "Delete") {
    return false;
  }

  const actor = req.post.actor;

  if (!actor) {
    return false;
  }

  const freshKey = await getFreshKey(await req.asdb(), actor);

  if (!freshKey) {
    return false;
  }

  return httpSignature.verifySignature(sigHead, freshKey);
}

async function getCachedPublicKey(asdb, keyId) {
  const { public_key } =
    (await asdb.get("SELECT public_key FROM actors WHERE key_id = ?1;", {
      1: keyId,
    })) || {};

  return public_key || null;
}

async function getFreshKey(asdb, actorId) {
  const { default: fetch } = await fetchModule;
  const keyResponse = await fetch(actorId, {
    headers: {
      accept: "application/json",
    },
  });

  if (keyResponse.statusCode >= 400) {
    return null;
  }

  const actor = await keyResponse.json();

  if (!actor?.id || !actor.publicKey?.id || !actor.publicKey.publicKeyPem) {
    return null;
  }

  await asdb.run(
    `INSERT INTO actors (
      id,
      key_id,
      public_key
    ) VALUES (
      ?1,
      ?2,
      ?3
    ) ON CONFLICT DO
    UPDATE SET
      key_id = ?2,
      public_key = ?3
    WHERE id = ?1;`,
    {
      1: actor.id,
      2: actor.publicKey.id,
      3: actor.publicKey.publicKeyPem,
    }
  );

  return actor.publicKey.publicKeyPem;
}

async function handleFollow() {}

async function handleAnnounce() {}

async function handleLike() {}

async function handleCreate() {}

async function handleUndo() {}

async function handleDelete() {}

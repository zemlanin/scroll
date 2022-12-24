const httpSignature = require("http-signature");

const fetchModule = import("node-fetch");

const { getBlogObject } = require("../common.js");

const { getMessageId } = require("./common.js");
const { attemptDelivery } = require("./outbox.js");

module.exports = inbox;

async function inbox(req, res) {
  if (req.post?.["@context"] !== "https://www.w3.org/ns/activitystreams") {
    res.statusCode = 400;

    return { detail: "invalid @context" };
  }

  if (!req.headers.authorization && !req.headers.signature) {
    res.statusCode = 401;
    return { detail: "missing http signature" };
  }

  if (!(await verify(req))) {
    // early exit for deleting unknown actors/activity
    if (req.post.type === "Delete") {
      res.statusCode = 200;

      return;
    }

    res.statusCode = 401;
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
      public_key,

      inbox,
      shared_inbox,
      name,
      url,
      icon
    ) VALUES (
      ?1,
      ?2,
      ?3,

      ?4,
      ?5,
      ?6,
      ?7,
      ?8
    ) ON CONFLICT DO
    UPDATE SET
      key_id = ?2,
      public_key = ?3,

      inbox = ?4,
      shared_inbox = ?5,
      name = ?6,
      url = ?7,
      icon = ?8
    WHERE id = ?1;`,
    {
      1: actor.id,
      2: actor.publicKey.id,
      3: actor.publicKey.publicKeyPem,
      4: actor.inbox,
      5: actor.endpoints?.sharedInbox,
      6: actor.name || actor.preferredUsername,
      7: actor.url,
      8: actor.icon?.type === "Image" ? actor.icon?.url : undefined,
    }
  );

  return actor.publicKey.publicKeyPem;
}

async function handleFollow(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/a6661b47-64f7-4a44-894f-42f9833343ab",
      "type": "Follow",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": "https://zemlan.in/actor/blog"
    }
  */
  const { id, type, actor, object } = req.post;

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  const blog = await getBlogObject();
  const blogActor = blog.activitystream.id;

  if (normalizeActor(object) !== blogActor) {
    res.statusCode = 404;
    return { detail: "object not found" };
  }

  const asdb = await req.asdb();
  await storeInboxMessage(asdb, {
    id,
    type,
    actor_id: normalizeActor(actor),
    object_id: blogActor,
  });

  await sendAcceptMessage(asdb, {
    receiver: normalizeActor(actor),
    object: id,
  });
}

async function handleAnnounce(req, res) {
  // TODO
  console.log(req.post);

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

async function handleLike(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/users/zemlanin#likes/222",
      "type": "Like",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": "https://zemlan.in/actor/blog/notes/post-2022-11-Ls4QTeY41Z"
    }
  */

  // TODO
  console.log(req.post);

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

async function handleCreate(req, res) {
  // TODO
  console.log(req.post);
  await storeReply();

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

async function handleUndo(req, res) {
  /*
    {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": "https://mastodon.devua.club/users/zemlanin#likes/222/undo",
      "type": "Undo",
      "actor": "https://mastodon.devua.club/users/zemlanin",
      "object": {
        "id": "https://mastodon.devua.club/users/zemlanin#likes/222",
        "type": "Like",
        "actor": "https://mastodon.devua.club/users/zemlanin",
        "object": "https://zemlan.in/actor/blog/notes/post-2022-11-Ls4QTeY41Z"
      }
    }
  */
  const { id, actor, object } = req.post;

  if (!object?.id) {
    res.statusCode = 400;
    return { detail: "nothing to undo" };
  }

  try {
    new URL(normalizeActor(actor));
  } catch (e) {
    res.statusCode = 400;
    return { detail: "actor has to be an uri" };
  }

  const asdb = await req.asdb();
  await asdb.run(`DELETE FROM inbox WHERE id = ?1 AND actor_id = ?2;`, {
    1: object.id,
    2: normalizeActor(actor),
  });

  await sendAcceptMessage(asdb, {
    receiver: normalizeActor(actor),
    object: id,
  });
}

async function handleDelete(req, res) {
  // TODO
  console.log(req.post);

  res.statusCode = 400;
  return { detail: "unknown activity type" };
}

function normalizeActor(actor) {
  return typeof actor === "string" ? actor : actor?.id;
}

async function storeInboxMessage(asdb, message) {
  await asdb.run(
    `INSERT INTO inbox (
      id,
      actor_id,
      type,
      object_id
    ) VALUES (
      ?1,
      ?3,
      ?4,
      ?5
    ) ON CONFLICT DO
    UPDATE SET
      actor_id = ?3,
      type = ?4,
      object_id = ?5
    WHERE id = ?1;`,
    {
      1: message.id,
      3: message.actor_id,
      4: message.type,
      5: message.object_id,
    }
  );
}

async function storeReply(_asdb, _note) {}

async function sendAcceptMessage(asdb, { receiver, object }) {
  const { inbox, shared_inbox } = await asdb.get(
    `SELECT inbox, shared_inbox FROM actors WHERE id = ?1`,
    {
      1: receiver,
    }
  );

  if (!inbox && !shared_inbox) {
    return;
  }

  const blog = await getBlogObject();
  const blogActor = blog.activitystream.id;

  const id = new URL(`#outbox-${getMessageId()}`, blogActor);

  await asdb.run(
    `INSERT INTO outbox (
      id,
      'to',
      message
    ) VALUES (
      ?1,
      ?2,
      ?3
    );`,
    {
      1: id,
      2: receiver,
      3: JSON.stringify({
        type: "Accept",
        object: object,
        actor: blogActor,
      }),
    }
  );

  await attemptDelivery(asdb, id, shared_inbox || inbox);
}

const { nanoid } = require("../common.js");

const getMessageId = () =>
  `message-${new Date().getFullYear()}-${(new Date().getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${nanoid.outbox()}`;

module.exports = {
  getMessageId,
};

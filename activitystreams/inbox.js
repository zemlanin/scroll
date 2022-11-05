async function inbox(req, res) {
  console.log(req.url);
  console.log(JSON.stringify(req.post));

  res.writeHead(404);
  res.end();
  return;
}

module.exports = inbox;

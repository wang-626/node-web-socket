import * as http from "http";
const options = {
  port: 1337,
  host: "127.0.0.1",
  headers: {
    Connection: "Upgrade",
    Upgrade: "websocket",
  },
};

const req = http.request(options);
req.end();

req.on("upgrade", (res, socket, upgradeHead) => {
  console.log(Object.keys(res));
  console.log(res.method);
  socket.end();
  process.exit(0);
});

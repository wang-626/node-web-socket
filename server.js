var express = require('express');
var path = require('path');
var WebSocketServer = require('./websocket');


const port = 3000.
var app = express();

app.use('/css', express.static('css'));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.listen(port, () => {
    console.log(`Express app listening on port ${port}`)
})

const webSocketServerPort = 4000.
const server = new WebSocketServer({ port: webSocketServerPort });

server.on('connection', () => {
    console.log('a user connected');
});

server.listen(() => {
    console.log(`WebSocket server listening on webSocketServerPort ${webSocketServerPort}`);
});
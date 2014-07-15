'use strict';

var net = require('net'),
    fs = require('fs'),
    https = require('https');


//===================================
//  TCP Server
//===================================

var appSockets = {},
    baseSockets = {},
    SERVER_PORT = 38899;

var server = net.createServer(function (socket) {
    socket.on('data', function (data) {
        // Turning buffer into string
        var stringData = data.toString('utf8').trim();

        // If client is App
        if (/APP#/.test(stringData)) {
            socket.type = 'APP';
            appHandler(stringData, data, socket);
        }
        // If client is base station
        else {
            socket.type = 'BASE';
            baseHandler(stringData, data, socket);
        }
    });

    // When socket closes or resets by error
    var onSocketClose = function () {
        if (socket.type === 'APP') {
            socket.ids.forEach(function (id) {
                if (appSockets[id]) appSockets[id].splice(appSockets[id].indexOf(socket), 1);
            });
        }

        else if (socket.type === 'BASE') {
            if (appSockets[socket.id]) {
                appSockets[socket.id].forEach(function (appSocket) {
                    appSocket.write(new Buffer('SV#' + socket.id + '#ST#0\n'));
                });
            }
                
            delete baseSockets[socket.id];
        }
    };

    socket.on('end', function (e) {
        onSocketClose();
    });

    socket.on('error', function (err) {
        if (err.code === 'ECONNRESET') {
            onSocketClose();
        }
    });
});

server.listen(SERVER_PORT);

// Callback to handle apps
var appHandler = function (stringData, rawData, socket) {
    var statements = stringData.split('\n');

    statements.forEach(function (statement) {
        var segments = statement.split('#');
        var id = segments[1],
            state = segments[2],
            command = segments[3];

        // Initiation command
        if (state === 'ST') {
            // If Base ID exist in array, return online, otherwise offline
            if (baseSockets[id]) {
                socket.write(new Buffer('ok#SV#' + id + '#ST#1\n', 'utf8'));
            } else {
                socket.write(new Buffer('ok#SV#' + id + '#ST#0\n', 'utf8'));
            }

            // Add ids to the socket for easier tracking
            if (socket.ids) {
                if (socket.ids.indexOf(id) === -1) socket.ids.push(id);
            } else {
                socket.ids = [];
                socket.ids.push(id);
            }

            // Add app socket to array, if not available, create new array.
            if (appSockets[id]) {
                if (appSockets[id].indexOf(socket) === -1) appSockets[id].push(socket);
            } else {
                appSockets[id] = [];
                appSockets[id].push(socket);
            }
        }

        // Send Command
        else if (state === 'CMD') {
            console.log(command);
            socket.write(new Buffer('ok#sent\n', 'utf8'));
            baseSockets[id].write(new Buffer(command, 'hex'));
            baseSockets['AC:CF:23:27:61:04'].write(new Buffer(command, 'hex'));
        }
    });
};

// Callback to handle Devices
var baseHandler = function (stringData, rawData, socket) {
    var macAddress = stringData.match(/(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/i);
    
    // Base station registering (MAC address)
    if (macAddress) {
        socket.id = macAddress[0];
        baseSockets[socket.id] = socket;
        baseSockets['AC:CF:23:27:61:04'] = socket; 
    }
};

//===================================
//  HTTPS Server
//===================================

// creating SSL options
var sslOptions = {
    key: fs.readFileSync('/etc/onion-ssl/onion.io.key.pem'),
    cert: fs.readFileSync('/etc/onion-ssl/onion.io.crt.pem'),
    ca: fs.readFileSync('/etc/onion-ssl/gd_bundle-g2-g1.crt')
};


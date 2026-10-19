const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const http = require('http');

const notificationRouter = require('../routes/notifications');

describe('Notifications Endpoint Tests', () => {
    it('should mount notification routes and respond to GET /api/notifications', async () => {
        const app = express();
        app.use(express.json());
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: true
        }));

        app.use('/api', notificationRouter);

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;

        try {
            const res = await fetch(`http://localhost:${port}/api/notifications?role=admin`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert(Array.isArray(data));
        } finally {
            server.close();
        }
    });

    it('should support student role filtering in notifications query', async () => {
        const app = express();
        app.use(express.json());
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: true
        }));

        app.use('/api', notificationRouter);

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;

        try {
            const res = await fetch(`http://localhost:${port}/api/notifications?role=student&userId=S101`);
            assert.strictEqual(res.status, 200);
            const data = await res.json();
            assert(Array.isArray(data));
        } finally {
            server.close();
        }
    });
});

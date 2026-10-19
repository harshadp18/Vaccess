const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const http = require('http');

// Import the admin router and functions
const adminRouter = require('../routes/admin');
const { requireAdmin, handleApprove, handleReject } = adminRouter;

describe('Admin Approval & Rejection Workflow Tests', () => {

    describe('1. Middleware Authorization (requireAdmin)', () => {
        it('should return 401 if user is unauthenticated (no session or user)', () => {
            const req = { session: {} };
            let statusCode = null;
            let responseBody = null;
            let nextCalled = false;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };
            const next = () => { nextCalled = true; };

            requireAdmin(req, res, next);
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseBody.success, false);
            assert.match(responseBody.error, /Unauthorized/i);
        });

        it('should return 403 if session user is a student', () => {
            const req = { session: { user: { id: 'STU101', role: 'student', name: 'John Doe' } } };
            let statusCode = null;
            let responseBody = null;
            let nextCalled = false;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };
            const next = () => { nextCalled = true; };

            requireAdmin(req, res, next);
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.success, false);
            assert.match(responseBody.error, /Access denied/i);
        });

        it('should return 403 if session user is a faculty member', () => {
            const req = { session: { user: { id: 'FAC001', role: 'faculty', name: 'Dr. Smith' } } };
            let statusCode = null;
            let responseBody = null;
            let nextCalled = false;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };
            const next = () => { nextCalled = true; };

            requireAdmin(req, res, next);
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
            assert.strictEqual(responseBody.success, false);
            assert.match(responseBody.error, /Access denied/i);
        });

        it('should allow access and call next() if session user is an admin', () => {
            const req = { session: { user: { id: 'ADM001', role: 'admin', name: 'Admin User' } } };
            let nextCalled = false;

            const res = {
                status() { return this; },
                json() { return this; }
            };
            const next = () => { nextCalled = true; };

            requireAdmin(req, res, next);
            assert.strictEqual(nextCalled, true);
        });
    });

    describe('2. Approval Validation & Edge Cases (handleApprove)', () => {
        it('should return 401 if adminId cannot be derived from session', async () => {
            const req = {
                params: { id: 'B001' },
                body: { remark: 'Approved' },
                session: {}
            };
            let statusCode = null;
            let responseBody = null;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };

            await handleApprove(req, res);
            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseBody.success, false);
        });

        it('should return 400 if booking ID is missing', async () => {
            const req = {
                params: {},
                body: { remark: 'Approved' },
                session: { user: { id: 'ADM001', role: 'admin' } }
            };
            let statusCode = null;
            let responseBody = null;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };

            await handleApprove(req, res);
            assert.strictEqual(statusCode, 400);
            assert.strictEqual(responseBody.success, false);
        });
    });

    describe('3. Rejection Validation & Edge Cases (handleReject)', () => {
        it('should return 400 if rejection remark is missing or empty', async () => {
            const req = {
                params: { id: 'B001' },
                body: { remark: '   ' },
                session: { user: { id: 'ADM001', role: 'admin' } }
            };
            let statusCode = null;
            let responseBody = null;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };

            await handleReject(req, res);
            assert.strictEqual(statusCode, 400);
            assert.strictEqual(responseBody.success, false);
            assert.match(responseBody.error, /Reason for rejection is required/i);
        });

        it('should return 401 if admin session is absent', async () => {
            const req = {
                params: { id: 'B001' },
                body: { remark: 'Maintenance scheduled' },
                session: {}
            };
            let statusCode = null;
            let responseBody = null;

            const res = {
                status(code) {
                    statusCode = code;
                    return this;
                },
                json(payload) {
                    responseBody = payload;
                    return this;
                }
            };

            await handleReject(req, res);
            assert.strictEqual(statusCode, 401);
            assert.strictEqual(responseBody.success, false);
        });
    });

    describe('4. Express Server & Route Mounting Verification', () => {
        let server;
        let port;

        it('starts test express app with routes mounted and verifies endpoint access controls', async () => {
            const testApp = express();
            testApp.use(express.json());
            testApp.use(session({
                secret: 'test-secret',
                resave: false,
                saveUninitialized: true
            }));

            // Test helper endpoint to set session role
            testApp.post('/set-test-session', (req, res) => {
                req.session.user = req.body;
                res.json({ ok: true, session: req.session.user });
            });

            // Mount admin router under /api
            testApp.use('/api', adminRouter);

            await new Promise((resolve) => {
                server = testApp.listen(0, () => {
                    port = server.address().port;
                    resolve();
                });
            });

            // Helper to make request
            const makeRequest = (path, method = 'GET', body = null, cookie = null) => {
                return new Promise((resolve, reject) => {
                    const reqOpts = {
                        hostname: '127.0.0.1',
                        port,
                        path,
                        method,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    };
                    if (cookie) {
                        reqOpts.headers['Cookie'] = cookie;
                    }

                    const req = http.request(reqOpts, (res) => {
                        let data = '';
                        res.on('data', chunk => { data += chunk; });
                        res.on('end', () => {
                            let parsed = null;
                            try { parsed = JSON.parse(data); } catch { parsed = data; }
                            const setCookie = res.headers['set-cookie'];
                            resolve({ status: res.statusCode, body: parsed, cookie: setCookie });
                        });
                    });
                    req.on('error', reject);
                    if (body) {
                        req.write(JSON.stringify(body));
                    }
                    req.end();
                });
            };

            // Test 1: Unauthenticated request to /api/admin/bookings -> 401
            const unauthGet = await makeRequest('/api/admin/bookings');
            assert.strictEqual(unauthGet.status, 401);

            // Test 2: Unauthenticated POST to /api/admin/bookings/1/approve -> 401
            const unauthApprove1 = await makeRequest('/api/admin/bookings/1/approve', 'POST', { remark: 'Ok' });
            assert.strictEqual(unauthApprove1.status, 401);

            // Test 3: Unauthenticated POST to alias /api/bookings/1/approve -> 401
            const unauthApprove2 = await makeRequest('/api/bookings/1/approve', 'POST', { remark: 'Ok' });
            assert.strictEqual(unauthApprove2.status, 401);

            // Test 4: Unauthenticated POST to /api/admin/bookings/1/reject -> 401
            const unauthReject1 = await makeRequest('/api/admin/bookings/1/reject', 'POST', { remark: 'Declined' });
            assert.strictEqual(unauthReject1.status, 401);

            // Test 5: Unauthenticated POST to alias /api/bookings/1/reject -> 401
            const unauthReject2 = await makeRequest('/api/bookings/1/reject', 'POST', { remark: 'Declined' });
            assert.strictEqual(unauthReject2.status, 401);

            // Test 6: Student session -> 403 on approve
            const stuLogin = await makeRequest('/set-test-session', 'POST', { id: 'STU101', role: 'student' });
            const stuCookie = stuLogin.cookie ? stuLogin.cookie[0].split(';')[0] : null;

            const stuApprove = await makeRequest('/api/admin/bookings/1/approve', 'POST', { remark: 'Ok' }, stuCookie);
            assert.strictEqual(stuApprove.status, 403);

            const stuReject = await makeRequest('/api/admin/bookings/1/reject', 'POST', { remark: 'Declined' }, stuCookie);
            assert.strictEqual(stuReject.status, 403);

            // Close server
            await new Promise((resolve) => server.close(resolve));
        });
    });

    describe('5. Mock Database Transaction Flow (handleApprove & handleReject)', () => {
        it('handleApprove rejects non-pending bookings with 409 Conflict', async () => {
            const pool = require('../config/db');
            const originalConnect = pool.connect;

            const mockClient = {
                query: async (sql, params) => {
                    const text = String(sql).toUpperCase();
                    if (text === 'BEGIN') return {};
                    if (text === 'ROLLBACK') return {};
                    if (text === 'COMMIT') return {};
                    if (text.includes('SELECT A_ID FROM ADMIN')) {
                        return { rows: [{ a_id: 'ADM001' }] };
                    }
                    if (text.includes('SELECT * FROM BOOKING')) {
                        return { rows: [{ b_id: 1, b_status: 'Approved', v_id: 'V001' }] };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };

            pool.connect = async () => mockClient;

            try {
                const req = {
                    params: { id: '1' },
                    body: { remark: 'Attempt double approve' },
                    session: { user: { id: 'ADM001', role: 'admin' } }
                };
                let statusCode = null;
                let responseBody = null;
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { responseBody = payload; return this; }
                };

                await handleApprove(req, res);
                assert.strictEqual(statusCode, 409);
                assert.strictEqual(responseBody.success, false);
                assert.match(responseBody.error, /Only pending bookings can be approved/i);
            } finally {
                pool.connect = originalConnect;
            }
        });

        it('handleApprove rejects timeslot conflicts with 409 Conflict', async () => {
            const pool = require('../config/db');
            const originalConnect = pool.connect;

            const mockClient = {
                query: async (sql, params) => {
                    const text = String(sql).toUpperCase();
                    if (text === 'BEGIN') return {};
                    if (text === 'ROLLBACK') return {};
                    if (text === 'COMMIT') return {};
                    if (text.includes('SELECT A_ID FROM ADMIN')) {
                        return { rows: [{ a_id: 'ADM001' }] };
                    }
                    if (text.includes('SELECT * FROM BOOKING')) {
                        return { rows: [{ b_id: 2, b_status: 'Pending', v_id: 'V001' }] };
                    }
                    if (text.includes('FROM BOOKING B') && text.includes('TIMESLOT T')) {
                        return { rows: [{ b_id: 1 }] };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };

            pool.connect = async () => mockClient;

            try {
                const req = {
                    params: { id: '2' },
                    body: { remark: 'Approve conflict' },
                    session: { user: { id: 'ADM001', role: 'admin' } }
                };
                let statusCode = null;
                let responseBody = null;
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { responseBody = payload; return this; }
                };

                await handleApprove(req, res);
                assert.strictEqual(statusCode, 409);
                assert.strictEqual(responseBody.success, false);
                assert.match(responseBody.error, /Conflict detected/i);
            } finally {
                pool.connect = originalConnect;
            }
        });

        it('handleApprove successfully updates booking and inserts approval with 200 OK', async () => {
            const pool = require('../config/db');
            const originalConnect = pool.connect;

            let updatedStatus = null;
            let insertedApproval = null;
            let transactionCommitted = false;

            const mockClient = {
                query: async (sql, params) => {
                    const text = String(sql).toUpperCase();
                    if (text === 'BEGIN') return {};
                    if (text === 'COMMIT') { transactionCommitted = true; return {}; }
                    if (text === 'ROLLBACK') return {};
                    if (text.includes('SELECT A_ID FROM ADMIN')) {
                        return { rows: [{ a_id: 'ADM001' }] };
                    }
                    if (text.includes('SELECT * FROM BOOKING')) {
                        return { rows: [{ b_id: 5, b_status: 'Pending', v_id: 'V001' }] };
                    }
                    if (text.includes('FROM BOOKING B') && text.includes('TIMESLOT T')) {
                        return { rows: [] }; // No conflict
                    }
                    if (text.includes('UPDATE BOOKING SET B_STATUS')) {
                        updatedStatus = params[0];
                        return { rowCount: 1 };
                    }
                    if (text.includes('SELECT AP_ID FROM APPROVAL WHERE B_ID')) {
                        return { rows: [] }; // New approval
                    }
                    if (text.includes('COALESCE(MAX(AP_ID), 0) + 1')) {
                        return { rows: [{ next_id: 10 }] };
                    }
                    if (text.includes('INSERT INTO APPROVAL')) {
                        insertedApproval = {
                            ap_id: params[0],
                            decision: params[1],
                            remark: params[2],
                            a_id: params[3],
                            b_id: params[4]
                        };
                        return { rowCount: 1 };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };

            pool.connect = async () => mockClient;

            try {
                const req = {
                    params: { id: '5' },
                    body: { remark: 'Approved for annual symposium' },
                    session: { user: { id: 'ADM001', role: 'admin' } }
                };
                let statusCode = null;
                let responseBody = null;
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { responseBody = payload; return this; }
                };

                await handleApprove(req, res);
                assert.strictEqual(statusCode, 200);
                assert.strictEqual(responseBody.success, true);
                assert.strictEqual(responseBody.status, 'Approved');
                assert.strictEqual(responseBody.approvalId, 10);
                assert.strictEqual(updatedStatus, 'Approved');
                assert.strictEqual(insertedApproval.decision, 'Approved');
                assert.strictEqual(insertedApproval.remark, 'Approved for annual symposium');
                assert.strictEqual(insertedApproval.a_id, 'ADM001');
                assert.strictEqual(transactionCommitted, true);
            } finally {
                pool.connect = originalConnect;
            }
        });

        it('handleReject rejects non-pending bookings with 409 Conflict', async () => {
            const pool = require('../config/db');
            const originalConnect = pool.connect;

            const mockClient = {
                query: async (sql, params) => {
                    const text = String(sql).toUpperCase();
                    if (text === 'BEGIN') return {};
                    if (text === 'ROLLBACK') return {};
                    if (text === 'COMMIT') return {};
                    if (text.includes('SELECT A_ID FROM ADMIN')) {
                        return { rows: [{ a_id: 'ADM001' }] };
                    }
                    if (text.includes('SELECT * FROM BOOKING')) {
                        return { rows: [{ b_id: 1, b_status: 'Rejected', v_id: 'V001' }] };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };

            pool.connect = async () => mockClient;

            try {
                const req = {
                    params: { id: '1' },
                    body: { remark: 'Already rejected' },
                    session: { user: { id: 'ADM001', role: 'admin' } }
                };
                let statusCode = null;
                let responseBody = null;
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { responseBody = payload; return this; }
                };

                await handleReject(req, res);
                assert.strictEqual(statusCode, 409);
                assert.strictEqual(responseBody.success, false);
                assert.match(responseBody.error, /Only pending bookings can be rejected/i);
            } finally {
                pool.connect = originalConnect;
            }
        });

        it('handleReject successfully updates booking and inserts rejection record with 200 OK', async () => {
            const pool = require('../config/db');
            const originalConnect = pool.connect;

            let updatedStatus = null;
            let insertedApproval = null;
            let transactionCommitted = false;

            const mockClient = {
                query: async (sql, params) => {
                    const text = String(sql).toUpperCase();
                    if (text === 'BEGIN') return {};
                    if (text === 'COMMIT') { transactionCommitted = true; return {}; }
                    if (text === 'ROLLBACK') return {};
                    if (text.includes('SELECT A_ID FROM ADMIN')) {
                        return { rows: [{ a_id: 'ADM001' }] };
                    }
                    if (text.includes('SELECT * FROM BOOKING')) {
                        return { rows: [{ b_id: 6, b_status: 'Pending', v_id: 'V001' }] };
                    }
                    if (text.includes('UPDATE BOOKING SET B_STATUS')) {
                        updatedStatus = params[0];
                        return { rowCount: 1 };
                    }
                    if (text.includes('SELECT AP_ID FROM APPROVAL WHERE B_ID')) {
                        return { rows: [] };
                    }
                    if (text.includes('COALESCE(MAX(AP_ID), 0) + 1')) {
                        return { rows: [{ next_id: 11 }] };
                    }
                    if (text.includes('INSERT INTO APPROVAL')) {
                        insertedApproval = {
                            ap_id: params[0],
                            decision: params[1],
                            remark: params[2],
                            a_id: params[3],
                            b_id: params[4]
                        };
                        return { rowCount: 1 };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };

            pool.connect = async () => mockClient;

            try {
                const req = {
                    params: { id: '6' },
                    body: { remark: 'Venue undergoing maintenance during this slot' },
                    session: { user: { id: 'ADM001', role: 'admin' } }
                };
                let statusCode = null;
                let responseBody = null;
                const res = {
                    status(code) { statusCode = code; return this; },
                    json(payload) { responseBody = payload; return this; }
                };

                await handleReject(req, res);
                assert.strictEqual(statusCode, 200);
                assert.strictEqual(responseBody.success, true);
                assert.strictEqual(responseBody.status, 'Rejected');
                assert.strictEqual(responseBody.approvalId, 11);
                assert.strictEqual(updatedStatus, 'Rejected');
                assert.strictEqual(insertedApproval.decision, 'Rejected');
                assert.strictEqual(insertedApproval.remark, 'Venue undergoing maintenance during this slot');
                assert.strictEqual(insertedApproval.a_id, 'ADM001');
                assert.strictEqual(transactionCommitted, true);
            } finally {
                pool.connect = originalConnect;
            }
        });
    });
});

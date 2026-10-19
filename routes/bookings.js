const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdmin, handleApprove, handleReject } = require('./admin');

// 1. POST /api/bookings - Create a new booking
router.post('/bookings', async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const { 
            v_id, 
            rno, 
            fno, 
            purpose, 
            noofmembers, 
            eventdate, 
            starttime, 
            endtime 
        } = req.body;

        if (!v_id || !eventdate || !starttime || !endtime || !purpose) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: "Venue, event date, start time, end time, and purpose are required."
            });
        }

        let effectiveRno = rno || (req.session?.user?.role === 'student' ? (req.session.user.rno || req.session.user.id) : null);
        let effectiveFno = fno || (req.session?.user?.role === 'faculty' ? (req.session.user.fno || req.session.user.id) : null);

        if (effectiveRno) {
            const sCheck = await client.query('SELECT rno FROM student WHERE LOWER(rno) = LOWER($1)', [String(effectiveRno)]);
            if (sCheck.rows.length > 0) {
                effectiveRno = sCheck.rows[0].rno;
            } else if (req.session?.user?.email) {
                const emailCheck = await client.query('SELECT rno FROM student WHERE LOWER(s_email) = LOWER($1)', [req.session.user.email]);
                if (emailCheck.rows.length > 0) effectiveRno = emailCheck.rows[0].rno;
            }
        }

        if (effectiveFno) {
            const fCheck = await client.query('SELECT fno FROM faculty WHERE LOWER(fno) = LOWER($1)', [String(effectiveFno)]);
            if (fCheck.rows.length > 0) {
                effectiveFno = fCheck.rows[0].fno;
            } else if (req.session?.user?.email) {
                const emailCheck = await client.query('SELECT fno FROM faculty WHERE LOWER(f_email) = LOWER($1)', [req.session.user.email]);
                if (emailCheck.rows.length > 0) effectiveFno = emailCheck.rows[0].fno;
            }
        }

        // Resolve integer v_id from parameter or venue name
        let resolvedVId = null;
        if (!isNaN(parseInt(v_id, 10))) {
            const num = parseInt(v_id, 10);
            const vCheck = await client.query('SELECT v_id FROM venue WHERE v_id = $1', [num]);
            if (vCheck.rows.length > 0) resolvedVId = vCheck.rows[0].v_id;
        }
        if (!resolvedVId) {
            const cleanStr = String(v_id).trim();
            const legacyMap = {
                'V001': 103, // Auditorium
                'V002': 102, // Lecture Hall
                'V003': 101, // Classroom
                'V004': 106, // Seminar Hall
                'V005': 104, // Indoor Hall
                'V006': 105  // Computer Lab
            };
            if (legacyMap[cleanStr.toUpperCase()]) {
                resolvedVId = legacyMap[cleanStr.toUpperCase()];
            } else {
                const textCheck = await client.query(
                    'SELECT v_id FROM venue WHERE v_type ILIKE $1 OR subtype ILIKE $1 OR category ILIKE $1 LIMIT 1',
                    [`%${cleanStr}%`]
                );
                if (textCheck.rows.length > 0) {
                    resolvedVId = textCheck.rows[0].v_id;
                } else {
                    const firstV = await client.query('SELECT v_id FROM venue ORDER BY v_id ASC LIMIT 1');
                    resolvedVId = firstV.rows[0]?.v_id || 101;
                }
            }
        }

        // 1. Check for time slot conflicts
        const conflictQuery = `
            SELECT t.* 
            FROM timeslot t
            JOIN booking b ON t.b_id = b.b_id
            WHERE b.v_id = $1 
              AND t.eventdate = $2 
              AND UPPER(b.b_status) NOT IN ('REJECTED', 'CANCELLED')
              AND (t.starttime < $4 AND t.endtime > $3)
        `;

        const conflictCheck = await client.query(conflictQuery, [resolvedVId, eventdate, starttime, endtime]);

        if (conflictCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: "Conflict detected: This venue is already booked or has a pending request for this time slot." 
            });
        }

        // 2. Safely generate the next sequential b_id
        const bookingIdResult = await client.query('SELECT COALESCE(MAX(b_id), 0) + 1 AS next_id FROM booking');
        const nextBId = bookingIdResult.rows[0].next_id;

        // 3. Insert booking with explicit b_id and Title-Case status
        const insertBookingQuery = `
            INSERT INTO booking (b_id, b_date, b_status, purpose, noofmembers, eventdate, rno, fno, v_id)
            VALUES ($1, CURRENT_DATE, 'Pending', $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;

        const bookingValues = [nextBId, purpose, noofmembers || 1, eventdate, effectiveRno, effectiveFno, resolvedVId];
        const bookingResult = await client.query(insertBookingQuery, bookingValues);
        const newBooking = bookingResult.rows[0];

        // 4. Safely generate the next sequential slot_id
        const slotIdResult = await client.query('SELECT COALESCE(MAX(slot_id), 0) + 1 AS next_id FROM timeslot');
        const nextSlotId = slotIdResult.rows[0].next_id;

        // 5. Insert timeslot with explicit slot_id and b_id
        const insertTimeslotQuery = `
            INSERT INTO timeslot (slot_id, b_id, eventdate, starttime, endtime)
            VALUES ($1, $2, $3, $4, $5);
        `;

        await client.query(insertTimeslotQuery, [nextSlotId, nextBId, eventdate, starttime, endtime]);

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: "Booking request submitted successfully and is pending approval.",
            booking: newBooking
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error in POST /api/bookings:", err.message);
        return res.status(500).json({ success: false, error: "Server error while creating booking" });
    } finally {
        client.release();
    }
});

// 2. GET /api/bookings - Fetch bookings for current user or all bookings
router.get('/bookings', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        const { status, date } = req.query;

        let query = `
            SELECT 
                b.b_id,
                b.b_date,
                b.b_status,
                b.purpose,
                b.noofmembers,
                COALESCE(b.eventdate, t.eventdate) AS eventdate,
                t.eventdate AS slot_eventdate,
                b.rno,
                b.fno,
                b.v_id,
                v.category,
                v.v_type,
                v.subtype,
                v.capacity,
                s.s_name AS student_name,
                s.s_email AS student_email,
                s.dept AS student_dept,
                s.contactno AS student_contact,
                f.f_name AS faculty_name,
                f.f_email AS faculty_email,
                f.dept AS faculty_dept,
                f.contactno AS faculty_contact,
                t.slot_id,
                t.starttime,
                t.endtime,
                a.ap_id,
                a.ap_date,
                a.remark,
                a.decision,
                adm.a_name AS admin_name,
                adm.a_email AS admin_email
            FROM booking b
            LEFT JOIN venue v ON b.v_id = v.v_id
            LEFT JOIN student s ON b.rno = s.rno
            LEFT JOIN faculty f ON b.fno = f.fno
            LEFT JOIN timeslot t ON b.b_id = t.b_id
            LEFT JOIN approval a ON b.b_id = a.b_id
            LEFT JOIN admin adm ON a.a_id = adm.a_id
        `;

        let queryParams = [];
        let conditions = [];

        // If user is a student, only their bookings
        if (sessionUser && sessionUser.role === 'student') {
            queryParams.push(sessionUser.id);
            conditions.push(`b.rno = $${queryParams.length}`);
        } else if (sessionUser && sessionUser.role === 'faculty') {
            queryParams.push(sessionUser.id);
            conditions.push(`b.fno = $${queryParams.length}`);
        }

        if (status && status !== 'all') {
            queryParams.push(status.toLowerCase());
            conditions.push(`LOWER(b.b_status) = $${queryParams.length}`);
        }

        if (date) {
            queryParams.push(date);
            conditions.push(`(b.eventdate = $${queryParams.length} OR t.eventdate = $${queryParams.length})`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY b.b_date DESC, b.b_id DESC`;

        const result = await pool.query(query, queryParams);
        return res.status(200).json(result.rows);

    } catch (err) {
        console.error("Error in GET /api/bookings:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching bookings" });
    }
});

// 3. GET /api/bookings/:id - Fetch single booking details
router.get('/bookings/:id', async (req, res) => {
    try {
        const bookingId = req.params.id;
        const numId = parseInt(String(bookingId).replace(/^B/i, ''), 10);

        const query = `
            SELECT 
                b.b_id,
                b.b_date,
                b.b_status,
                b.purpose,
                b.noofmembers,
                COALESCE(b.eventdate, t.eventdate) AS eventdate,
                t.eventdate AS slot_eventdate,
                b.rno,
                b.fno,
                b.v_id,
                v.category,
                v.v_type,
                v.subtype,
                v.capacity,
                s.s_name AS student_name,
                s.s_email AS student_email,
                s.dept AS student_dept,
                s.contactno AS student_contact,
                f.f_name AS faculty_name,
                f.f_email AS faculty_email,
                f.dept AS faculty_dept,
                f.contactno AS faculty_contact,
                t.slot_id,
                t.starttime,
                t.endtime,
                a.ap_id,
                a.ap_date,
                a.remark,
                a.decision,
                adm.a_name AS admin_name,
                adm.a_email AS admin_email
            FROM booking b
            LEFT JOIN venue v ON b.v_id = v.v_id
            LEFT JOIN student s ON b.rno = s.rno
            LEFT JOIN faculty f ON b.fno = f.fno
            LEFT JOIN timeslot t ON b.b_id = t.b_id
            LEFT JOIN approval a ON b.b_id = a.b_id
            LEFT JOIN admin adm ON a.a_id = adm.a_id
            WHERE b.b_id = $1 OR CAST(b.b_id AS TEXT) = $2
        `;

        const result = await pool.query(query, [!isNaN(numId) ? numId : -1, String(bookingId)]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Booking not found" });
        }

        return res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error("Error in GET /api/bookings/:id:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching booking details" });
    }
});

// 4. Mount approval/rejection endpoints on /bookings path as well (README reference routes)
router.post('/bookings/:id/approve', requireAdmin, handleApprove);
router.patch('/bookings/:id/approve', requireAdmin, handleApprove);
router.post('/bookings/:id/reject', requireAdmin, handleReject);
router.patch('/bookings/:id/reject', requireAdmin, handleReject);

module.exports = router;
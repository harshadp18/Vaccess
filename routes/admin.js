const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Database connection pool
const bcrypt = require('bcrypt');

/**
 * Middleware: Verify that the current session belongs to an authenticated administrator
 */
function requireAdmin(req, res, next) {
    if (req.session && req.session.user) {
        const role = String(req.session.user.role || '').toLowerCase();
        if (role === 'admin') {
            return next();
        }
        return res.status(403).json({
            success: false,
            error: "Access denied. Administrator privileges required."
        });
    }
    return res.status(401).json({
        success: false,
        error: "Unauthorized. Please log in as an administrator."
    });
}

// 1. GET /api/admin/bookings - Fetch all booking requests for admin review
router.get('/admin/bookings', requireAdmin, async (req, res) => {
    try {
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
        console.error("Error fetching admin bookings:", err.message);
        return res.status(500).json({
            success: false,
            error: "Server error while fetching bookings"
        });
    }
});

// Approval Handler (Used for both POST and PATCH)
async function handleApprove(req, res) {
    const bookingId = req.params.id;
    if (!bookingId) {
        return res.status(400).json({ success: false, error: "Booking ID is required." });
    }

    const numId = parseInt(String(bookingId).replace(/^B/i, ''), 10);
    const remark = req.body && req.body.remark ? String(req.body.remark).trim() : 'Approved by administrator';
    
    // Resolve admin ID strictly from session
    let adminId = req.session && req.session.user && (req.session.user.A_ID || req.session.user.id);
    if (!adminId) {
        return res.status(401).json({ success: false, error: "Unauthorized. Administrator session required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Resolve valid admin PK if needed
        const adminCheck = await client.query(
            `SELECT a_id FROM admin WHERE a_id = $1 OR CAST(a_id AS TEXT) = $2`,
            [!isNaN(parseInt(adminId, 10)) ? parseInt(adminId, 10) : -1, String(adminId)]
        );
        if (adminCheck.rows.length > 0) {
            adminId = adminCheck.rows[0].a_id;
        } else if (req.session?.user?.email) {
            const emailCheck = await client.query('SELECT a_id FROM admin WHERE a_email = $1', [req.session.user.email]);
            if (emailCheck.rows.length > 0) adminId = emailCheck.rows[0].a_id;
        }

        // 1. Verify booking exists and lock row
        const bookingCheck = await client.query(
            `SELECT * FROM booking 
             WHERE b_id = $1 OR CAST(b_id AS TEXT) = $2 
             FOR UPDATE`, 
            [!isNaN(numId) ? numId : -1, String(bookingId)]
        );

        if (bookingCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: "Booking record not found." });
        }

        const booking = bookingCheck.rows[0];
        if (!booking.b_status || booking.b_status.toUpperCase() !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(409).json({ 
                success: false, 
                error: `Only pending bookings can be approved. Current status: ${booking.b_status}` 
            });
        }

        // 2. Validate against timeslot conflict with other approved bookings
        const conflictCheck = await client.query(
            `SELECT b.b_id 
             FROM booking b
             JOIN timeslot t ON b.b_id = t.b_id
             WHERE b.v_id = $1 
               AND UPPER(b.b_status) = 'APPROVED'
               AND b.b_id != $2
               AND EXISTS (
                   SELECT 1 FROM timeslot cur 
                   WHERE cur.b_id = $2 
                     AND cur.eventdate = t.eventdate
                     AND cur.starttime < t.endtime 
                     AND cur.endtime > t.starttime
               )`,
            [booking.v_id, booking.b_id]
        );

        if (conflictCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: "Conflict detected: Venue already has an approved booking for this time slot."
            });
        }

        // 3. Update booking status to Approved
        await client.query('UPDATE booking SET b_status = $1 WHERE b_id = $2', ['Approved', booking.b_id]);

        // 4. Create or update approval record safely
        const existingApproval = await client.query('SELECT ap_id FROM approval WHERE b_id = $1', [booking.b_id]);
        let nextApId;
        if (existingApproval.rows.length > 0) {
            nextApId = existingApproval.rows[0].ap_id;
            await client.query(
                `UPDATE approval 
                 SET ap_date = CURRENT_DATE, decision = $1, remark = $2, a_id = $3 
                 WHERE b_id = $4`,
                ['Approved', remark || 'Approved by administrator', adminId, booking.b_id]
            );
        } else {
            const idResult = await client.query('SELECT COALESCE(MAX(ap_id), 0) + 1 AS next_id FROM approval');
            nextApId = idResult.rows[0].next_id;
            await client.query(
                `INSERT INTO approval (ap_id, ap_date, decision, remark, a_id, b_id) 
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)`,
                [nextApId, 'Approved', remark || 'Approved by administrator', adminId, booking.b_id]
            );
        }

        await client.query('COMMIT');
        return res.status(200).json({ 
            success: true, 
            message: "Booking approved successfully.",
            bookingId: booking.b_id,
            status: "Approved",
            approvalId: nextApId
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error approving booking:", err.message);
        return res.status(500).json({ success: false, error: "Server error during approval: " + err.message });
    } finally {
        client.release();
    }
}

// Rejection Handler (Used for both PATCH and POST)
async function handleReject(req, res) {
    const bookingId = req.params.id;
    if (!bookingId) {
        return res.status(400).json({ success: false, error: "Booking ID is required." });
    }

    const numId = parseInt(String(bookingId).replace(/^B/i, ''), 10);
    const remark = req.body && req.body.remark ? String(req.body.remark).trim() : '';

    if (!remark) {
        return res.status(400).json({
            success: false,
            error: "Reason for rejection is required."
        });
    }

    let adminId = req.session && req.session.user && (req.session.user.A_ID || req.session.user.id);
    if (!adminId) {
        return res.status(401).json({ success: false, error: "Unauthorized. Administrator session required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Resolve valid admin PK if needed
        const adminCheck = await client.query(
            `SELECT a_id FROM admin WHERE a_id = $1 OR CAST(a_id AS TEXT) = $2`,
            [!isNaN(parseInt(adminId, 10)) ? parseInt(adminId, 10) : -1, String(adminId)]
        );
        if (adminCheck.rows.length > 0) {
            adminId = adminCheck.rows[0].a_id;
        } else if (req.session?.user?.email) {
            const emailCheck = await client.query('SELECT a_id FROM admin WHERE a_email = $1', [req.session.user.email]);
            if (emailCheck.rows.length > 0) adminId = emailCheck.rows[0].a_id;
        }

        // 1. Check whether booking exists and is pending
        const bookingCheck = await client.query(
            `SELECT * FROM booking 
             WHERE b_id = $1 OR CAST(b_id AS TEXT) = $2 
             FOR UPDATE`,
            [!isNaN(numId) ? numId : -1, String(bookingId)]
        );

        if (bookingCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                error: "Booking record not found."
            });
        }

        const booking = bookingCheck.rows[0];
        if (!booking.b_status || booking.b_status.toUpperCase() !== 'PENDING') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: `Only pending bookings can be rejected. Current status: ${booking.b_status}`
            });
        }

        // 2. Update booking status to Rejected
        await client.query(
            `UPDATE booking SET b_status = $1 WHERE b_id = $2`,
            ['Rejected', booking.b_id]
        );

        // 3. Create or update approval record safely
        const existingApproval = await client.query('SELECT ap_id FROM approval WHERE b_id = $1', [booking.b_id]);
        let nextApId;
        if (existingApproval.rows.length > 0) {
            nextApId = existingApproval.rows[0].ap_id;
            await client.query(
                `UPDATE approval 
                 SET ap_date = CURRENT_DATE, decision = $1, remark = $2, a_id = $3 
                 WHERE b_id = $4`,
                ['Rejected', remark, adminId, booking.b_id]
            );
        } else {
            const idResult = await client.query('SELECT COALESCE(MAX(ap_id), 0) + 1 AS next_id FROM approval');
            nextApId = idResult.rows[0].next_id;
            await client.query(
                `INSERT INTO approval (ap_id, ap_date, decision, remark, a_id, b_id)
                 VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)`,
                [nextApId, 'Rejected', remark, adminId, booking.b_id]
            );
        }

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: "Booking rejected successfully.",
            bookingId: booking.b_id,
            status: "Rejected",
            approvalId: nextApId
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error rejecting booking:", err.message);
        return res.status(500).json({
            success: false,
            error: "Server error during rejection: " + err.message
        });
    } finally {
        client.release();
    }
}

// 2. POST & PATCH /api/admin/bookings/:id/approve - Approve a pending booking
router.post('/admin/bookings/:id/approve', requireAdmin, handleApprove);
router.patch('/admin/bookings/:id/approve', requireAdmin, handleApprove);

// 3. PATCH & POST /api/admin/bookings/:id/reject - Reject a pending booking
router.patch('/admin/bookings/:id/reject', requireAdmin, handleReject);
router.post('/admin/bookings/:id/reject', requireAdmin, handleReject);

// Also mount on /bookings/:id/(approve|reject) directly on this router
router.post('/bookings/:id/approve', requireAdmin, handleApprove);
router.patch('/bookings/:id/approve', requireAdmin, handleApprove);
router.patch('/bookings/:id/reject', requireAdmin, handleReject);
router.post('/bookings/:id/reject', requireAdmin, handleReject);

// ----------------------------------------------------------------
// 4. FACULTY DIRECTORY ENDPOINTS
// ----------------------------------------------------------------
router.get('/admin/faculty', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                f.fno,
                f.f_name,
                f.f_email,
                f.dept,
                f.contactno,
                COALESCE((SELECT COUNT(*) FROM booking WHERE fno = f.fno), 0)::int AS booking_count
            FROM faculty f
            ORDER BY f.fno ASC
        `);
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching admin faculty:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching faculty" });
    }
});

router.post('/admin/faculty', requireAdmin, async (req, res) => {
    try {
        const { fno, name, F_name, email, F_Email, dept, Dept, contactno, ContactNo, password } = req.body;
        const facultyName = name || F_name;
        const facultyEmail = email || F_Email;
        const facultyDept = dept || Dept || 'General';
        const facultyContact = contactno || ContactNo || '';
        const rawPassword = password || 'Faculty@123';

        if (!facultyName || !facultyEmail) {
            return res.status(400).json({ success: false, error: "Name and email are required" });
        }

        let assignedFno = fno;
        if (!assignedFno) {
            const maxRes = await pool.query("SELECT fno FROM faculty");
            const nums = maxRes.rows.map(r => parseInt(String(r.fno).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
            assignedFno = 'F' + String(nextNum).padStart(3, '0');
        }

        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        const insertRes = await pool.query(
            `INSERT INTO faculty (fno, f_name, f_email, dept, contactno, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING fno, f_name, f_email, dept, contactno`,
            [assignedFno, facultyName, facultyEmail, facultyDept, facultyContact, hashedPassword]
        );

        return res.status(201).json({
            success: true,
            message: "Faculty created successfully",
            faculty: insertRes.rows[0]
        });
    } catch (err) {
        console.error("Error creating faculty:", err.message);
        return res.status(500).json({ success: false, error: "Server error creating faculty: " + err.message });
    }
});

router.put('/admin/faculty/:id', requireAdmin, async (req, res) => {
    try {
        const fno = req.params.id;
        const { name, F_name, email, F_Email, dept, Dept, contactno, ContactNo } = req.body;
        const facultyName = name || F_name;
        const facultyEmail = email || F_Email;
        const facultyDept = dept || Dept;
        const facultyContact = contactno || ContactNo;

        const updateRes = await pool.query(
            `UPDATE faculty
             SET f_name = COALESCE($1, f_name),
                 f_email = COALESCE($2, f_email),
                 dept = COALESCE($3, dept),
                 contactno = COALESCE($4, contactno)
             WHERE fno = $5
             RETURNING fno, f_name, f_email, dept, contactno`,
            [facultyName, facultyEmail, facultyDept, facultyContact, fno]
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Faculty not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Faculty updated successfully",
            faculty: updateRes.rows[0]
        });
    } catch (err) {
        console.error("Error updating faculty:", err.message);
        return res.status(500).json({ success: false, error: "Server error updating faculty" });
    }
});

router.delete('/admin/faculty/:id', requireAdmin, async (req, res) => {
    try {
        const fno = req.params.id;
        await pool.query('DELETE FROM faculty WHERE fno = $1', [fno]);
        return res.status(200).json({ success: true, message: "Faculty deleted successfully" });
    } catch (err) {
        console.error("Error deleting faculty:", err.message);
        return res.status(500).json({ success: false, error: "Cannot delete faculty with active bookings or relations" });
    }
});

// ----------------------------------------------------------------
// 5. STUDENT DIRECTORY ENDPOINTS
// ----------------------------------------------------------------
router.get('/admin/students', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                s.rno,
                s.s_name,
                s.s_email,
                s.dept,
                s.contactno,
                COALESCE((SELECT COUNT(*) FROM booking WHERE rno = s.rno), 0)::int AS booking_count
            FROM student s
            ORDER BY s.rno ASC
        `);
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching admin students:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching students" });
    }
});

router.post('/admin/students', requireAdmin, async (req, res) => {
    try {
        const { rno, name, S_name, email, S_Email, dept, Dept, contactno, ContactNo, password } = req.body;
        const studentName = name || S_name;
        const studentEmail = email || S_Email;
        const studentDept = dept || Dept || 'General';
        const studentContact = contactno || ContactNo || '';
        const rawPassword = password || 'Student@123';

        if (!studentName || !studentEmail) {
            return res.status(400).json({ success: false, error: "Name and email are required" });
        }

        let assignedRno = rno;
        if (!assignedRno) {
            const maxRes = await pool.query("SELECT rno FROM student");
            const nums = maxRes.rows.map(r => parseInt(String(r.rno).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
            const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
            assignedRno = 'S' + String(nextNum).padStart(3, '0');
        }

        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        const insertRes = await pool.query(
            `INSERT INTO student (rno, s_name, s_email, dept, contactno, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING rno, s_name, s_email, dept, contactno`,
            [assignedRno, studentName, studentEmail, studentDept, studentContact, hashedPassword]
        );

        return res.status(201).json({
            success: true,
            message: "Student created successfully",
            student: insertRes.rows[0]
        });
    } catch (err) {
        console.error("Error creating student:", err.message);
        return res.status(500).json({ success: false, error: "Server error creating student: " + err.message });
    }
});

router.put('/admin/students/:id', requireAdmin, async (req, res) => {
    try {
        const rno = req.params.id;
        const { name, S_name, email, S_Email, dept, Dept, contactno, ContactNo } = req.body;
        const studentName = name || S_name;
        const studentEmail = email || S_Email;
        const studentDept = dept || Dept;
        const studentContact = contactno || ContactNo;

        const updateRes = await pool.query(
            `UPDATE student
             SET s_name = COALESCE($1, s_name),
                 s_email = COALESCE($2, s_email),
                 dept = COALESCE($3, dept),
                 contactno = COALESCE($4, contactno)
             WHERE rno = $5
             RETURNING rno, s_name, s_email, dept, contactno`,
            [studentName, studentEmail, studentDept, studentContact, rno]
        );

        if (updateRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Student not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Student updated successfully",
            student: updateRes.rows[0]
        });
    } catch (err) {
        console.error("Error updating student:", err.message);
        return res.status(500).json({ success: false, error: "Server error updating student" });
    }
});

router.delete('/admin/students/:id', requireAdmin, async (req, res) => {
    try {
        const rno = req.params.id;
        await pool.query('DELETE FROM student WHERE rno = $1', [rno]);
        return res.status(200).json({ success: true, message: "Student deleted successfully" });
    } catch (err) {
        console.error("Error deleting student:", err.message);
        return res.status(500).json({ success: false, error: "Cannot delete student with active bookings or relations" });
    }
});

// ----------------------------------------------------------------
// 6. ADMIN USERS & VENUE MAINTENANCE ENDPOINTS
// ----------------------------------------------------------------
router.get('/admin/admins', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT a_id, a_name, a_email FROM admin ORDER BY a_id ASC");
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error("Error fetching admins:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching admins" });
    }
});

router.post(['/admin/venues/:id/toggle-maintenance', '/venues/:id/toggle-maintenance'], requireAdmin, async (req, res) => {
    try {
        const venueId = req.params.id;
        const currentVenue = await pool.query('SELECT v_id, v_status FROM venue WHERE CAST(v_id AS TEXT) = $1', [String(venueId)]);
        if (currentVenue.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Venue not found" });
        }

        const currentStatus = currentVenue.rows[0].v_status;
        const newStatus = (currentStatus === 'Maintenance' || currentStatus === 'Under Maintenance') ? 'Available' : 'Under Maintenance';

        const updated = await pool.query(
            'UPDATE venue SET v_status = $1 WHERE v_id = $2 RETURNING *',
            [newStatus, currentVenue.rows[0].v_id]
        );

        return res.status(200).json({
            success: true,
            message: `Venue status updated to ${newStatus}`,
            venue: updated.rows[0]
        });
    } catch (err) {
        console.error("Error toggling venue maintenance:", err.message);
        return res.status(500).json({ success: false, error: "Server error toggling maintenance" });
    }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
module.exports.handleApprove = handleApprove;
module.exports.handleReject = handleReject;
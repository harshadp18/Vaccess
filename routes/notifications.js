const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Database connection pool

// 1. GET /api/notifications - Returns live notifications derived from booking & approval records
router.get('/notifications', async (req, res) => {
    try {
        const user = req.session && req.session.user;
        const role = user 
            ? String(user.role || '').toLowerCase() 
            : (req.query.role ? String(req.query.role).toLowerCase() : (req.headers['x-user-role'] ? String(req.headers['x-user-role']).toLowerCase() : null));
        const userId = user 
            ? (user.rno || user.fno || user.id) 
            : (req.query.userId || req.headers['x-user-id'] || null);

        let query = `
            SELECT 
                b.b_id,
                b.b_date,
                b.b_status,
                b.purpose,
                b.eventdate,
                b.rno,
                b.fno,
                v.v_type,
                v.subtype,
                s.s_name AS student_name,
                f.f_name AS faculty_name,
                a.decision,
                a.remark,
                a.ap_date,
                adm.a_name AS admin_name
            FROM booking b
            LEFT JOIN venue v ON b.v_id = v.v_id
            LEFT JOIN student s ON b.rno = s.rno
            LEFT JOIN faculty f ON b.fno = f.fno
            LEFT JOIN approval a ON b.b_id = a.b_id
            LEFT JOIN admin adm ON a.a_id = adm.a_id
        `;
        let params = [];

        if (role === 'student' && userId) {
            params.push(String(userId));
            query += ` WHERE b.rno = $1`;
        } else if (role === 'faculty' && userId) {
            params.push(String(userId));
            query += ` WHERE b.fno = $1`;
        }

        query += ` ORDER BY COALESCE(a.ap_date, b.b_date) DESC, b.b_id DESC LIMIT 30`;

        const result = await pool.query(query, params);
        const notifications = [];

        for (const row of result.rows) {
            const bIdStr = 'B' + String(row.b_id).padStart(3, '0');
            const venueName = row.v_type ? `${row.v_type}${row.subtype ? ' (' + row.subtype + ')' : ''}` : 'Venue';
            const requester = row.student_name || row.faculty_name || (row.rno ? 'Student ' + row.rno : 'Faculty ' + row.fno);
            const statusUpper = String(row.b_status || '').toUpperCase();
            const dateStr = row.eventdate ? new Date(row.eventdate).toISOString().split('T')[0] : '';

            if (role === 'admin') {
                if (statusUpper === 'PENDING') {
                    notifications.push({
                        id: `notif-pen-${row.b_id}`,
                        type: 'warning',
                        title: 'Pending Review',
                        message: `New booking request #${bIdStr} from ${requester} for ${venueName}${dateStr ? ' on ' + dateStr : ''} is awaiting review.`,
                        time: row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString(),
                        read: false,
                        isRead: false,
                        B_ID: bIdStr,
                        b_id: row.b_id
                    });
                } else if (statusUpper === 'APPROVED') {
                    notifications.push({
                        id: `notif-app-${row.b_id}`,
                        type: 'success',
                        title: 'Booking Approved',
                        message: `Booking #${bIdStr} (${venueName}) for ${requester} was approved by ${row.admin_name || 'Admin'}.`,
                        time: row.ap_date ? new Date(row.ap_date).toISOString() : (row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString()),
                        read: true,
                        isRead: true,
                        B_ID: bIdStr,
                        b_id: row.b_id
                    });
                } else if (statusUpper === 'REJECTED') {
                    notifications.push({
                        id: `notif-rej-${row.b_id}`,
                        type: 'danger',
                        title: 'Booking Rejected',
                        message: `Booking #${bIdStr} (${venueName}) for ${requester} was rejected.${row.remark ? ' Remark: "' + row.remark + '"' : ''}`,
                        time: row.ap_date ? new Date(row.ap_date).toISOString() : (row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString()),
                        read: true,
                        isRead: true,
                        B_ID: bIdStr,
                        b_id: row.b_id
                    });
                }
            } else {
                // Student or Faculty user
                if (statusUpper === 'APPROVED') {
                    notifications.push({
                        id: `notif-user-app-${row.b_id}`,
                        type: 'success',
                        title: 'Booking Approved',
                        message: `Your booking request #${bIdStr} for ${venueName}${dateStr ? ' on ' + dateStr : ''} has been Approved!${row.remark ? ' Remark: "' + row.remark + '"' : ''}`,
                        time: row.ap_date ? new Date(row.ap_date).toISOString() : (row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString()),
                        read: false,
                        isRead: false,
                        B_ID: bIdStr,
                        b_id: row.b_id,
                        rno: row.rno,
                        fno: row.fno
                    });
                } else if (statusUpper === 'REJECTED') {
                    notifications.push({
                        id: `notif-user-rej-${row.b_id}`,
                        type: 'danger',
                        title: 'Booking Rejected',
                        message: `Your booking request #${bIdStr} for ${venueName} was Rejected.${row.remark ? ' Reason / Remark: "' + row.remark + '"' : ''}`,
                        time: row.ap_date ? new Date(row.ap_date).toISOString() : (row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString()),
                        read: false,
                        isRead: false,
                        B_ID: bIdStr,
                        b_id: row.b_id,
                        rno: row.rno,
                        fno: row.fno
                    });
                } else {
                    notifications.push({
                        id: `notif-user-pen-${row.b_id}`,
                        type: 'info',
                        title: 'Booking Submitted',
                        message: `Your booking request #${bIdStr} for ${venueName}${dateStr ? ' on ' + dateStr : ''} has been submitted and is pending administrator approval.`,
                        time: row.b_date ? new Date(row.b_date).toISOString() : new Date().toISOString(),
                        read: false,
                        isRead: false,
                        B_ID: bIdStr,
                        b_id: row.b_id,
                        rno: row.rno,
                        fno: row.fno
                    });
                }
            }
        }

        return res.status(200).json(notifications);

    } catch (err) {
        console.error("Error fetching notifications:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching notifications" });
    }
});

// 2. GET /api/admin/dashboard - Provides live aggregated counts and statistics for the admin panel
router.get('/admin/dashboard', async (req, res) => {
    // Check admin authorization if session exists
    if (req.session && req.session.user && req.session.user.role && req.session.user.role.toLowerCase() !== 'admin') {
        return res.status(403).json({ success: false, error: "Access denied. Administrator privileges required." });
    }

    try {
        const pendingQuery = pool.query("SELECT COUNT(*) FROM booking WHERE UPPER(b_status) = 'PENDING'");
        const approvedQuery = pool.query("SELECT COUNT(*) FROM booking WHERE UPPER(b_status) = 'APPROVED'");
        const rejectedQuery = pool.query("SELECT COUNT(*) FROM booking WHERE UPPER(b_status) = 'REJECTED'");
        const venuesQuery = pool.query("SELECT COUNT(*) FROM venue");

        const [pending, approved, rejected, venues] = await Promise.all([
            pendingQuery,
            approvedQuery,
            rejectedQuery,
            venuesQuery
        ]);

        return res.status(200).json({
            pendingBookings: parseInt(pending.rows[0].count, 10),
            approvedBookings: parseInt(approved.rows[0].count, 10),
            rejectedBookings: parseInt(rejected.rows[0].count, 10),
            activeVenues: parseInt(venues.rows[0].count, 10)
        });

    } catch (err) {
        console.error("Error fetching admin dashboard stats:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching dashboard statistics" });
    }
});

module.exports = router;
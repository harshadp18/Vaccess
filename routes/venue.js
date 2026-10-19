const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET /api/venue & /api/venues - Fetch all venues (with optional category and status filtering)
router.get(['/venue', '/venues'], async (req, res) => {
    try {
        const { category, status } = req.query;
        let query = 'SELECT * FROM venue WHERE 1=1';
        let queryParams = [];

        // Filter by category if provided (e.g., Auditorium, Seminar Hall)
        if (category && category !== 'all') {
            queryParams.push(category);
            query += ` AND category = $${queryParams.length}`;
        }

        // Filter by status (defaults to Available if not specified)
        if (status && status !== 'all') {
            queryParams.push(status);
            query += ` AND v_status ILIKE $${queryParams.length}`;
        }

        query += ` ORDER BY v_id ASC`;

        const result = await pool.query(query, queryParams);
        return res.status(200).json(result.rows);

    } catch (err) {
        console.error("Error in GET /api/venues:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching venues" });
    }
});

// 2. GET /api/venue/available & /api/venues/available - Check real-time venue availability
router.get(['/venue/available', '/venues/available'], async (req, res) => {
    try {
        const { date, startTime, endTime } = req.query;

        if (!date || !startTime || !endTime) {
            return res.status(400).json({ 
                success: false, 
                error: "Query parameters 'date', 'startTime', and 'endTime' are required." 
            });
        }

        // Query to find venues that do NOT have overlapping APPROVED or PENDING bookings
        const availableQuery = `
            SELECT v.* 
            FROM venue v
            WHERE (v.v_status = 'Available' OR v.v_status = 'Open')
              AND v.v_id NOT IN (
                  SELECT b.v_id
                  FROM booking b
                  JOIN timeslot t ON b.b_id = t.b_id
                  WHERE t.eventdate = $1 
                    AND UPPER(b.b_status) IN ('APPROVED', 'PENDING')
                    AND t.starttime < $2 
                    AND t.endtime > $3
              )
            ORDER BY v.v_id ASC;
        `;

        const result = await pool.query(availableQuery, [date, endTime, startTime]);
        return res.status(200).json(result.rows);

    } catch (err) {
        console.error("Error in GET /api/venues/available:", err.message);
        return res.status(500).json({ success: false, error: "Server error while checking availability" });
    }
});

// 3. GET /api/venue/:id & /api/venues/:id - Fetch complete details for a single venue
router.get(['/venue/:id', '/venues/:id'], async (req, res) => {
    try {
        const venueId = req.params.id;

        const result = await pool.query(
            'SELECT * FROM venue WHERE CAST(v_id AS TEXT) = $1', 
            [String(venueId)]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Venue not found" });
        }
        return res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error("Error in GET /api/venues/:id:", err.message);
        return res.status(500).json({ success: false, error: "Server error while fetching venue details" });
    }
});

module.exports = router;
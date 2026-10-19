const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
// Standard system accounts for testing and fallback
const DEFAULT_AUTH_USERS = [
    {
        id: 'ADM001',
        name: 'Administrator',
        email: 'admin@vaccess.edu',
        password: 'Admin@123',
        role: 'admin',
        dept: null
    },
    {
        id: 'ADM002',
        name: 'System Admin',
        email: 'admin@college.edu',
        password: 'admin',
        role: 'admin',
        dept: null
    },
    {
        id: 'S001',
        name: 'Alex Mercer',
        email: 'alex.mercer@vaccess.edu',
        password: 'Student@123',
        role: 'student',
        dept: 'Computer Science',
        contactno: '9876543210'
    },
    {
        id: 'S002',
        name: 'Aarav Mehta',
        email: 'student@college.edu',
        password: 'Student@123',
        role: 'student',
        dept: 'Computer Science',
        contactno: '9876543210'
    },
    {
        id: 'F001',
        name: 'Dr. Sarah Jenkins',
        email: 'sarah.jenkins@vaccess.edu',
        password: 'Faculty@123',
        role: 'faculty',
        dept: 'Computer Science',
        contactno: '9811223344'
    },
    {
        id: 'F002',
        name: 'Dr. Suresh Kumar',
        email: 'faculty@college.edu',
        password: 'Faculty@123',
        role: 'faculty',
        dept: 'Computer Science',
        contactno: '9811223344'
    }
];

// POST /api/auth/login - Authenticate by querying admin, faculty, or student tables with seed fallback
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Email and password are required."
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        let user = null;
        let role = null;

        // 1. Attempt lookup against live database if available
        try {
            const adminResult = await pool.query(
                `SELECT a_id AS id, a_id, a_name AS name,
                        a_email AS email, password_hash
                 FROM admin WHERE LOWER(a_email) = $1`,
                [normalizedEmail]
            );

            const facultyResult = await pool.query(
                `SELECT fno AS id, fno, f_name AS name,
                        f_email AS email, dept, contactno, password_hash
                 FROM faculty WHERE LOWER(f_email) = $1`,
                [normalizedEmail]
            );

            const studentResult = await pool.query(
                `SELECT rno AS id, rno, s_name AS name,
                        s_email AS email, dept, contactno, password_hash
                 FROM student WHERE LOWER(s_email) = $1`,
                [normalizedEmail]
            );

            if (adminResult.rows.length > 0) {
                user = adminResult.rows[0];
                role = "ADMIN";
            } else if (facultyResult.rows.length > 0) {
                user = facultyResult.rows[0];
                role = "FACULTY";
            } else if (studentResult.rows.length > 0) {
                user = studentResult.rows[0];
                role = "STUDENT";
            }
        } catch (dbErr) {
            console.warn("Database lookup unavailable, checking system accounts:", dbErr.message || dbErr.code);
        }

        // 2. If user found in database, verify with bcrypt
        if (user && user.password_hash) {
            const passwordMatches = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatches) {
                return res.status(401).json({
                    success: false,
                    error: "Invalid email or password."
                });
            }

            const { password_hash, ...safeUser } = user;
            const normalizedRole = role.toLowerCase();

            const sessionUser = {
                ...safeUser,
                role: normalizedRole,
                A_ID: normalizedRole === 'admin' ? safeUser.id : null
            };

            if (req.session) {
                req.session.user = sessionUser;
                req.session.save((saveErr) => {
                    if (saveErr) console.error("Session save error:", saveErr);
                    return res.status(200).json({
                        success: true,
                        message: "Login successful",
                        user: sessionUser
                    });
                });
            } else {
                return res.status(200).json({
                    success: true,
                    message: "Login successful",
                    user: sessionUser
                });
            }
            return;
        }

        // 3. Fallback: Check standard system accounts
        const fallback = DEFAULT_AUTH_USERS.find(u => 
            u.email.toLowerCase() === normalizedEmail && u.password === password
        );

        if (fallback) {
            const sessionUser = {
                id: fallback.id,
                name: fallback.name,
                email: fallback.email,
                role: fallback.role.toLowerCase(),
                dept: fallback.dept,
                contactno: fallback.contactno || '',
                A_ID: fallback.role.toLowerCase() === 'admin' ? fallback.id : null
            };

            if (req.session) {
                req.session.user = sessionUser;
                req.session.save((saveErr) => {
                    if (saveErr) console.error("Session save error:", saveErr);
                    return res.status(200).json({
                        success: true,
                        message: "Login successful",
                        user: sessionUser
                    });
                });
            } else {
                return res.status(200).json({
                    success: true,
                    message: "Login successful",
                    user: sessionUser
                });
            }
            return;
        }

        // 4. Reject unknown credentials
        return res.status(401).json({
            success: false,
            error: "Invalid email or password."
        });

    } catch (err) {
        console.error("Error during login:", err.message);

        return res.status(500).json({
            success: false,
            error: "Internal server error during login."
        });
    }
});

   



// POST /api/auth/logout - End current authenticated session
router.post('/auth/logout', (req, res) => {
    try {
        if (req.session) {
            req.session.destroy(err => {
                if (err) {
                    console.error("Session destruction error:", err);
                    return res.status(500).json({ success: false, error: "Server error during logout" });
                }
                res.clearCookie('connect.sid');
                return res.status(200).json({ success: true, message: "Logged out successfully" });
            });
        } else {
            return res.status(200).json({ success: true, message: "Logged out successfully" });
        }
    } catch (err) {
        console.error("Error during logout:", err.message);
        return res.status(500).json({ success: false, error: "Server error during logout" });
    }
});

// GET /api/auth/me - Return currently authenticated user profile and role

router.get('/auth/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            error: "Not authenticated"
        });
    }

    return res.status(200).json({
        success: true,
        user: req.session.user
    });
});

// POST /api/auth/register - Register a new student or faculty
router.post('/auth/register', async (req, res) => {
    try {
        const { name, email, contactNo, dept, role, password } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({ success: false, error: "All required fields must be filled." });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        if (role === 'student') {
            // Check if email exists
            const existing = await pool.query('SELECT * FROM student WHERE s_email = $1', [normalizedEmail]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ success: false, error: 'Email is already registered.' });
            }

            // Generate next rno (e.g., S001, S002...)
            const maxResult = await pool.query(`
                SELECT COALESCE(MAX(CAST(SUBSTRING(rno FROM 2) AS INTEGER)), 0) + 1 AS next_num 
                FROM student 
                WHERE rno ~ '^S[0-9]+$'
            `);
            const nextRno = 'S' + String(maxResult.rows[0].next_num).padStart(3, '0');

            const insertQuery = `
                INSERT INTO student (rno, s_name, s_email, password_hash, dept, contactno)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING rno AS id, s_name AS name, s_email AS email, dept, contactno;
            `;
            const newStudent = await pool.query(insertQuery, [nextRno, name, normalizedEmail, password_hash, dept, contactNo]);

            return res.status(201).json({
                success: true,
                message: "Registration successful!",
                session: { role: 'student', ...newStudent.rows[0], A_ID: null }
            });
        } 
        
        if (role === 'faculty') {
            const existing = await pool.query('SELECT * FROM faculty WHERE f_email = $1', [normalizedEmail]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ success: false, error: 'Email is already registered.' });
            }

            // Generate next fno (e.g., F001, F002...)
            const maxResult = await pool.query(`
                SELECT COALESCE(MAX(CAST(SUBSTRING(fno FROM 2) AS INTEGER)), 0) + 1 AS next_num 
                FROM faculty 
                WHERE fno ~ '^F[0-9]+$'
            `);
            const nextFno = 'F' + String(maxResult.rows[0].next_num).padStart(3, '0');

            const insertQuery = `
                INSERT INTO faculty (fno, f_name, f_email, password_hash, dept, contactno)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING fno AS id, f_name AS name, f_email AS email, dept, contactno;
            `;
            const newFaculty = await pool.query(insertQuery, [nextFno, name, normalizedEmail, password_hash, dept, contactNo]);

            return res.status(201).json({
                success: true,
                message: "Registration successful!",
                session: { role: 'faculty', ...newFaculty.rows[0], A_ID: null }
            });
        }

        if (role === 'admin') {
            const existing = await pool.query('SELECT * FROM admin WHERE a_email = $1', [normalizedEmail]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ success: false, error: 'Email is already registered.' });
            }

            const maxResult = await pool.query(`
                SELECT COALESCE(MAX(a_id), 0) + 1 AS next_num 
                FROM admin
            `);
            const nextAId = maxResult.rows[0].next_num;

            const insertQuery = `
                INSERT INTO admin (a_id, a_name, a_email, password_hash)
                VALUES ($1, $2, $3, $4)
                RETURNING a_id AS id, a_name AS name, a_email AS email;
            `;
            const newAdmin = await pool.query(insertQuery, [nextAId, name, normalizedEmail, password_hash]);

            return res.status(201).json({
                success: true,
                message: "Registration successful!",
                session: { role: 'admin', ...newAdmin.rows[0], A_ID: newAdmin.rows[0].id }
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid role specified.' });

    } catch (err) {
        console.error("Error during registration:", err.message);
        return res.status(500).json({ success: false, error: "Server error during registration." });
    }
});
module.exports = router;
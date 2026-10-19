# vAccess — User Directory & Database Credentials

This document provides the complete, authoritative list of all **Administrators**, **Faculty Members**, and **Students** currently stored in the PostgreSQL database hosted on **Supabase** for the **vAccess** College Venue Booking & Approval Management System.

---

## 🛡️ Administrators (`admin` Table)

Administrators have full privileges to review, approve, reject booking requests, inspect audit trails, manage campus venues, and audit user accounts.

| Admin ID (`a_id`) | Administrator Name (`a_name`) | Email (`a_email`) | Default Password | Assigned Role | Permissions |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **`1`** | Admin One | `admin1@example.com` | `Admin@123` | `admin` | Full System Access, Booking Approvals, Venue Management |
| **`2`** | Admin Two | `admin2@example.com` | `Admin@123` | `admin` | Full System Access, Booking Approvals, Venue Management |
| **`3`** | Administrator | `admin@vaccess.edu` | `Admin@123` | `admin` | Primary System Administrator, Audit Log Review |

---

## 👨‍🏫 Faculty Members (`faculty` Table)

Faculty members can book college venues (auditoriums, labs, lecture halls, seminar halls), specify event details, track approval workflows, and receive status notifications.

| Faculty No (`fno`) | Faculty Name (`f_name`) | Email Address (`f_email`) | Department (`dept`) | Contact Number (`contactno`) | Default Password |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **`F001`** | Dr. Rajesh Deshmukh | `rajesh.deshmukh@example.com` | Computer Engineering | `9876500010` | `Faculty@123` |
| **`F002`** | Prof. Neha Shah | `neha.shah@example.com` | Information Technology | `9876500011` | `Faculty@123` |
| **`F003`** | Dr. Amit Joshi | `amit.joshi@example.com` | Electronics Engineering | `9876500012` | `Faculty@123` |
| **`F004`** | Prof. Sneha Patil | `sneha.patil@example.com` | Computer Engineering | `9876500013` | `Faculty@123` |
| **`F101`** | Dr. Sarah Jenkins | `sarah.jenkins@vaccess.edu` | Computer Science | `9811223344` | `Faculty@123` |

---

## 🎓 Students (`student` Table)

Students can browse available college venues, check real-time timeslot availability, submit booking requests for academic and club events, and track their request status.

| Roll No (`rno`) | Student Name (`s_name`) | Email Address (`s_email`) | Department (`dept`) | Contact Number (`contactno`) | Default Password |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **`S001`** | Taswi Tawde | `taswi.tawde@example.com` | Computer Science | `1234567890` | `Student@123` |
| **`S101`** | Alex Mercer | `alex.mercer@vaccess.edu` | Computer Science | `9876543210` | `Student@123` |
| **`ST001`** | Aarav Sharma | `aarav.sharma@example.com` | Computer Engineering | `9876543210` | `Student@123` |
| **`ST002`** | Ananya Patil | `ananya.patil@example.com` | Information Technology | `9876543211` | `Student@123` |
| **`ST003`** | Rohan Mehta | `rohan.mehta@example.com` | Computer Engineering | `9876543212` | `Student@123` |
| **`ST004`** | Isha Kulkarni | `isha.kulkarni@example.com` | Electronics Engineering | `9876543213` | `Student@123` |
| **`ST005`** | Vedant Joshi | `vedant.joshi@example.com` | Computer Engineering | `9876543214` | `Student@123` |

---

## 🔐 Security & Authentication Notes

1. **Password Encryption**: All passwords stored in PostgreSQL are hashed using **bcrypt** with a work factor of 10 (`$2b$10$...`).
2. **Session Storage**: Login sessions utilize server-side sessions stored in the PostgreSQL database (`session` table) via `connect-pg-simple` and HTTP-only signed cookies (`connect.sid`).
3. **Role Determination**: Upon authentication, the backend queries the database sequentially (`admin` → `faculty` → `student`) to assign the normalized role (`admin`, `faculty`, or `student`).
4. **Database Configuration**:
   - **Host**: `aws-0-ap-northeast-2.pooler.supabase.com`
   - **Port**: `5432`
   - **Database**: `postgres`
   - **SSL**: Enabled (`rejectUnauthorized: false`)

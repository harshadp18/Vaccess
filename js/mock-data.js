/**
 * vAccess — mock-data.js
 * Centralized data schema strictly aligned with the ER Model entities:
 * 1. Student (rno, S_name, S_Email, Dept, ContactNo.)
 * 2. Faculty (fno, F_name, F_Email, Dept, ContactNo.)
 * 3. Venue (V_ID, Capacity, Category, SubType, V_type, V_Status)
 * 4. Booking (B_ID, B_Date, B_Status, Purpose, noOfMembers, V_ID, fno, rno)
 * 5. TimeSlot (Slot_ID, EventDate, StartTime, EndTime, B_ID)
 * 6. Approval (Ap_ID, Ap_Date, Decision, Remark, B_ID, A_ID)
 * 7. Admin (A_ID, A_Name, A_Email)
 *
 * Clean initial state: dummy bookings, dummy approvals, dummy notifications,
 * and demo credentials have been removed. Data is stored in localStorage.
 */

// Storage Schema Version (bumps clear legacy dummy data on first load)
const DB_VERSION_KEY = 'va_schema_version_clean_v4';

// ============================================================
// CAMPUS VENUES (Standard facility directory matching ER diagram)
// ============================================================
const DEFAULT_VENUES = [
  {
    V_ID: 'V001',
    V_type: 'Auditorium',
    SubType: 'Main Hall',
    Category: 'Large Events',
    Capacity: 500,
    V_Status: 'Available'
  },
  {
    V_ID: 'V002',
    V_type: 'Seminar Hall',
    SubType: 'Academic Block A',
    Category: 'Academic',
    Capacity: 120,
    V_Status: 'Available'
  },
  {
    V_ID: 'V003',
    V_type: 'Conference Room',
    SubType: 'Admin Block',
    Category: 'Meeting',
    Capacity: 30,
    V_Status: 'Available'
  },
  {
    V_ID: 'V004',
    V_type: 'Seminar Hall',
    SubType: 'Academic Block B',
    Category: 'Academic',
    Capacity: 80,
    V_Status: 'Available'
  },
  {
    V_ID: 'V005',
    V_type: 'Sports Ground',
    SubType: 'Football Field',
    Category: 'Sports',
    Capacity: 1000,
    V_Status: 'Available'
  },
  {
    V_ID: 'V006',
    V_type: 'Laboratory',
    SubType: 'Computer Lab 1',
    Category: 'Technical',
    Capacity: 60,
    V_Status: 'Available'
  },
  {
    V_ID: 'V007',
    V_type: 'Conference Room',
    SubType: 'Library Block',
    Category: 'Meeting',
    Capacity: 20,
    V_Status: 'Maintenance'
  },
  {
    V_ID: 'V008',
    V_type: 'Auditorium',
    SubType: 'Mini Theatre',
    Category: 'Large Events',
    Capacity: 200,
    V_Status: 'Available'
  }
];

// Standard booking time slots (operational campus hours)
const STANDARD_TIMESLOTS = [
  { StartTime: '08:00', EndTime: '09:00', label: '08:00 – 09:00' },
  { StartTime: '09:00', EndTime: '10:00', label: '09:00 – 10:00' },
  { StartTime: '10:00', EndTime: '11:00', label: '10:00 – 11:00' },
  { StartTime: '11:00', EndTime: '12:00', label: '11:00 – 12:00' },
  { StartTime: '12:00', EndTime: '13:00', label: '12:00 – 13:00' },
  { StartTime: '13:00', EndTime: '14:00', label: '13:00 – 14:00' },
  { StartTime: '14:00', EndTime: '15:00', label: '14:00 – 15:00' },
  { StartTime: '15:00', EndTime: '16:00', label: '15:00 – 16:00' },
  { StartTime: '16:00', EndTime: '17:00', label: '16:00 – 17:00' },
  { StartTime: '17:00', EndTime: '18:00', label: '17:00 – 18:00' },
];

// ============================================================
// DEFAULT SYSTEM ACCOUNTS (Ready for login and evaluation)
// ============================================================
const DEFAULT_ADMINS = [
  {
    A_ID: 'ADM001',
    A_Name: 'Administrator',
    A_Email: 'admin@vaccess.edu',
    password: 'Admin@123',
    role: 'admin'
  },
  {
    A_ID: 'ADM002',
    A_Name: 'System Admin',
    A_Email: 'admin@college.edu',
    password: 'admin',
    role: 'admin'
  }
];

const DEFAULT_STUDENTS = [
  {
    rno: 'S001',
    S_name: 'Alex Mercer',
    S_Email: 'alex.mercer@vaccess.edu',
    password: 'Student@123',
    Dept: 'Computer Science',
    ContactNo: '9876543210'
  },
  {
    rno: 'S002',
    S_name: 'Aarav Mehta',
    S_Email: 'student@college.edu',
    password: 'Student@123',
    Dept: 'Computer Science',
    ContactNo: '9876543210'
  }
];

const DEFAULT_FACULTY = [
  {
    fno: 'F001',
    F_name: 'Dr. Sarah Jenkins',
    F_Email: 'sarah.jenkins@vaccess.edu',
    password: 'Faculty@123',
    Dept: 'Computer Science',
    ContactNo: '9811223344'
  },
  {
    fno: 'F002',
    F_name: 'Dr. Suresh Kumar',
    F_Email: 'faculty@college.edu',
    password: 'Faculty@123',
    Dept: 'Computer Science',
    ContactNo: '9811223344'
  }
];

/**
 * Initialize localStorage:
 * Ensures collections exist and default evaluation accounts are available.
 */
function initMockData() {
  const currentVersion = localStorage.getItem(DB_VERSION_KEY);

  // If old version or uninitialized, purge legacy dummy data
  if (currentVersion !== 'v5_clean') {
    localStorage.removeItem('va_bookings');
    localStorage.removeItem('va_timeslots');
    localStorage.removeItem('va_approvals');
    localStorage.removeItem('va_notifications');
    localStorage.removeItem('va_students');
    localStorage.removeItem('va_faculty');
    localStorage.removeItem('va_admins');
    localStorage.removeItem('va_session');
    localStorage.setItem(DB_VERSION_KEY, 'v5_clean');
  }

  // Ensure default accounts exist
  const storedAdmins = JSON.parse(localStorage.getItem('va_admins') || '[]');
  if (storedAdmins.length === 0) {
    localStorage.setItem('va_admins', JSON.stringify(DEFAULT_ADMINS));
  } else if (!storedAdmins.some(a => a.A_Email.toLowerCase() === 'admin@vaccess.edu')) {
    storedAdmins.push(DEFAULT_ADMINS[0]);
    localStorage.setItem('va_admins', JSON.stringify(storedAdmins));
  }

  const storedStudents = JSON.parse(localStorage.getItem('va_students') || '[]');
  if (storedStudents.length === 0) {
    localStorage.setItem('va_students', JSON.stringify(DEFAULT_STUDENTS));
  } else if (!storedStudents.some(s => s.S_Email.toLowerCase() === 'alex.mercer@vaccess.edu')) {
    storedStudents.push(DEFAULT_STUDENTS[0]);
    localStorage.setItem('va_students', JSON.stringify(storedStudents));
  }

  const storedFaculty = JSON.parse(localStorage.getItem('va_faculty') || '[]');
  if (storedFaculty.length === 0) {
    localStorage.setItem('va_faculty', JSON.stringify(DEFAULT_FACULTY));
  } else if (!storedFaculty.some(f => f.F_Email.toLowerCase() === 'sarah.jenkins@vaccess.edu')) {
    storedFaculty.push(DEFAULT_FACULTY[0]);
    localStorage.setItem('va_faculty', JSON.stringify(storedFaculty));
  }

  if (!localStorage.getItem('va_bookings'))      localStorage.setItem('va_bookings',      JSON.stringify([]));
  if (!localStorage.getItem('va_timeslots'))     localStorage.setItem('va_timeslots',     JSON.stringify([]));
  if (!localStorage.getItem('va_approvals'))     localStorage.setItem('va_approvals',     JSON.stringify([]));
  if (!localStorage.getItem('va_notifications')) localStorage.setItem('va_notifications', JSON.stringify([]));
  if (!localStorage.getItem('va_venues'))        localStorage.setItem('va_venues',        JSON.stringify(DEFAULT_VENUES));
}

/** Clear all data across all tables completely */
function clearAllSystemData() {
  localStorage.setItem('va_students',      JSON.stringify([]));
  localStorage.setItem('va_faculty',       JSON.stringify([]));
  localStorage.setItem('va_admins',        JSON.stringify([]));
  localStorage.setItem('va_bookings',      JSON.stringify([]));
  localStorage.setItem('va_timeslots',     JSON.stringify([]));
  localStorage.setItem('va_approvals',     JSON.stringify([]));
  localStorage.setItem('va_notifications', JSON.stringify([]));
  localStorage.setItem('va_venues',        JSON.stringify(DEFAULT_VENUES));
}

/**
 * Optional Helper: Seed Sample Academic Data
 * Available in the ER Diagram management page for quick review or presentation.
 */
function seedSampleAcademicData() {
  const students = [
    { rno: 'S001', S_name: 'Aarav Mehta',  ContactNo: '9876543210', S_Email: 'aarav.mehta@college.edu',  Dept: 'Computer Science', password: 'password123' },
    { rno: 'S002', S_name: 'Priya Sharma', ContactNo: '9765432109', S_Email: 'priya.sharma@college.edu', Dept: 'Electronics',      password: 'password123' },
    { rno: 'S003', S_name: 'Rohan Verma',  ContactNo: '9654321098', S_Email: 'rohan.verma@college.edu',  Dept: 'Mechanical',       password: 'password123' }
  ];

  const faculty = [
    { fno: 'F001', F_name: 'Dr. Suresh Kumar', ContactNo: '9811223344', F_Email: 'suresh.kumar@college.edu', Dept: 'Computer Science', password: 'password123' },
    { fno: 'F002', F_name: 'Prof. Meena Iyer', ContactNo: '9822334455', F_Email: 'meena.iyer@college.edu',   Dept: 'Electronics',      password: 'password123' }
  ];

  const admins = [
    { A_ID: 'ADM001', A_Name: 'Administrator', A_Email: 'admin@college.edu', password: 'admin', role: 'admin' }
  ];

  const bookings = [
    {
      B_ID: 'B001', B_Date: new Date().toISOString().split('T')[0], B_Status: 'Approved',
      Purpose: 'Annual Tech Symposium Orientation', noOfMembers: 80, rno: 'S001', fno: null, V_ID: 'V001'
    },
    {
      B_ID: 'B002', B_Date: new Date().toISOString().split('T')[0], B_Status: 'Pending',
      Purpose: 'Faculty Department Research Colloquium', noOfMembers: 35, rno: null, fno: 'F001', V_ID: 'V002'
    }
  ];

  const timeslots = [
    { Slot_ID: 'TS001', EventDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], StartTime: '10:00', EndTime: '12:00', B_ID: 'B001' },
    { Slot_ID: 'TS002', EventDate: new Date(Date.now() + 172800000).toISOString().split('T')[0], StartTime: '14:00', EndTime: '16:00', B_ID: 'B002' }
  ];

  const approvals = [
    {
      Ap_ID: 'AP001', Ap_Date: new Date().toISOString().split('T')[0],
      Decision: 'Approved', Remark: 'Approved for auditorium setup.',
      B_ID: 'B001', A_ID: 'ADM001', A_Name: 'Administrator'
    }
  ];

  localStorage.setItem('va_students',  JSON.stringify(students));
  localStorage.setItem('va_faculty',   JSON.stringify(faculty));
  localStorage.setItem('va_admins',    JSON.stringify(admins));
  localStorage.setItem('va_bookings',  JSON.stringify(bookings));
  localStorage.setItem('va_timeslots', JSON.stringify(timeslots));
  localStorage.setItem('va_approvals', JSON.stringify(approvals));
}

// Automatically initialize on script load
initMockData();

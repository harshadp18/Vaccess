/**
 * vAccess — admin.js
 * Administrative entity management and approval workflow logic.
 * Aligned with the 7 entities from the ER Diagram:
 * - Student, Faculty, Venue, Booking, TimeSlot, Approval, Admin
 */

// ============================================================
// APPROVAL WORKFLOW
// ============================================================

/** Get all admin approvals */
function getApprovals() {
  return JSON.parse(localStorage.getItem('va_approvals') || '[]');
}

/** Get the approval record for a specific booking */
function getApprovalForBooking(bId) {
  return getApprovals().find(a => a.B_ID === bId) || null;
}

/**
 * Approve a booking.
 * Creates an approval record, updates booking status, and sends notification.
 */
function approveBooking(bId, remark = '') {
  const session = getSession();
  if (!session || session.role !== 'admin') return false;

  const booking = getBookingById(bId);
  if (!booking) return false;

  updateBookingStatus(bId, 'Approved');
  _upsertApproval(bId, 'Approved', remark, session);

  const venue = getVenueById(booking.V_ID);
  const remarkNote = remark ? ` Remark: "${remark}"` : '';
  createNotification({
    type:    'success',
    message: `Your booking ${bId} for ${getVenueDisplayName(venue)} has been approved.${remarkNote}`,
    B_ID:    bId,
    rno:     booking.rno,
    fno:     booking.fno,
  });

  return true;
}

/**
 * Reject a booking.
 * Creates an approval record, updates booking status, and sends notification.
 */
function rejectBooking(bId, remark = '') {
  const session = getSession();
  if (!session || session.role !== 'admin') return false;

  const booking = getBookingById(bId);
  if (!booking) return false;

  updateBookingStatus(bId, 'Rejected');
  _upsertApproval(bId, 'Rejected', remark, session);

  const venue = getVenueById(booking.V_ID);
  const remarkNote = remark ? ` Reason: "${remark}"` : '';
  createNotification({
    type:    'danger',
    message: `Your booking ${bId} for ${getVenueDisplayName(venue)} was rejected.${remarkNote}`,
    B_ID:    bId,
    rno:     booking.rno,
    fno:     booking.fno,
  });

  return true;
}

/** Internal: Upsert approval entity record */
function _upsertApproval(bId, decision, remark, session) {
  const approvals = getApprovals();
  const existing  = approvals.findIndex(a => a.B_ID === bId);
  const record = {
    Ap_ID:    existing >= 0 ? approvals[existing].Ap_ID : generateApprovalId(),
    Ap_Date:  today(),
    A_ID:     session.id || session.A_ID || 'ADM001',
    A_Name:   session.name,
    A_Email:  session.email,
    Decision: decision,
    Remark:   remark,
    B_ID:     bId,
  };
  if (existing >= 0) {
    approvals[existing] = record;
  } else {
    approvals.push(record);
  }
  localStorage.setItem('va_approvals', JSON.stringify(approvals));
}

// ============================================================
// ER ENTITY 1: STUDENT (rno, S_name, S_Email, Dept, ContactNo.)
// ============================================================

function getStudents() {
  return JSON.parse(localStorage.getItem('va_students') || '[]');
}

function getStudentByRno(rno) {
  return getStudents().find(s => s.rno === rno) || null;
}

function saveStudent(data) {
  const students = getStudents();
  if (data.rno) {
    const idx = students.findIndex(s => s.rno === data.rno);
    if (idx !== -1) {
      students[idx] = { ...students[idx], ...data };
      localStorage.setItem('va_students', JSON.stringify(students));
      return students[idx];
    }
  }
  // New student
  const nums = students.map(s => parseInt(s.rno.replace('S', ''), 10)).filter(n => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newS = {
    rno: data.rno || ('S' + String(nextNum).padStart(3, '0')),
    S_name: data.S_name,
    S_Email: data.S_Email,
    Dept: data.Dept,
    ContactNo: data.ContactNo || '',
    password: data.password || 'password123'
  };
  students.push(newS);
  localStorage.setItem('va_students', JSON.stringify(students));
  return newS;
}

function deleteStudent(rno) {
  let students = getStudents();
  students = students.filter(s => s.rno !== rno);
  localStorage.setItem('va_students', JSON.stringify(students));
  return true;
}

// ============================================================
// ER ENTITY 2: FACULTY (fno, F_name, F_Email, Dept, ContactNo.)
// ============================================================

function getFacultyList() {
  return JSON.parse(localStorage.getItem('va_faculty') || '[]');
}

function getFacultyByFno(fno) {
  return getFacultyList().find(f => f.fno === fno) || null;
}

function saveFaculty(data) {
  const faculty = getFacultyList();
  if (data.fno) {
    const idx = faculty.findIndex(f => f.fno === data.fno);
    if (idx !== -1) {
      faculty[idx] = { ...faculty[idx], ...data };
      localStorage.setItem('va_faculty', JSON.stringify(faculty));
      return faculty[idx];
    }
  }
  const nums = faculty.map(f => parseInt(f.fno.replace('F', ''), 10)).filter(n => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newF = {
    fno: data.fno || ('F' + String(nextNum).padStart(3, '0')),
    F_name: data.F_name,
    F_Email: data.F_Email,
    Dept: data.Dept,
    ContactNo: data.ContactNo || '',
    password: data.password || 'password123'
  };
  faculty.push(newF);
  localStorage.setItem('va_faculty', JSON.stringify(faculty));
  return newF;
}

function deleteFaculty(fno) {
  let faculty = getFacultyList();
  faculty = faculty.filter(f => f.fno !== fno);
  localStorage.setItem('va_faculty', JSON.stringify(faculty));
  return true;
}

// ============================================================
// ER ENTITY 7: ADMIN (A_ID, A_Name, A_Email)
// ============================================================

function getAdminUsers() {
  return JSON.parse(localStorage.getItem('va_admins') || '[]');
}

function getAdminById(aId) {
  return getAdminUsers().find(a => a.A_ID === aId) || null;
}

function saveAdminUser(data) {
  const admins = getAdminUsers();
  if (data.A_ID) {
    const idx = admins.findIndex(a => a.A_ID === data.A_ID);
    if (idx !== -1) {
      admins[idx] = { ...admins[idx], ...data };
      localStorage.setItem('va_admins', JSON.stringify(admins));
      return admins[idx];
    }
  }
  const nums = admins.map(a => parseInt(a.A_ID.replace('ADM', ''), 10)).filter(n => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newA = {
    A_ID: data.A_ID || ('ADM' + String(nextNum).padStart(3, '0')),
    A_Name: data.A_Name,
    A_Email: data.A_Email,
    password: data.password || 'admin123',
    role: 'admin'
  };
  admins.push(newA);
  localStorage.setItem('va_admins', JSON.stringify(admins));
  return newA;
}

function deleteAdminUser(aId) {
  let admins = getAdminUsers();
  admins = admins.filter(a => a.A_ID !== aId);
  localStorage.setItem('va_admins', JSON.stringify(admins));
  return true;
}

// ============================================================
// ER ENTITY 5: TIMESLOT MANAGEMENT
// ============================================================

function deleteTimeslot(slotId) {
  let slots = getTimeslots();
  slots = slots.filter(s => s.Slot_ID !== slotId);
  localStorage.setItem('va_timeslots', JSON.stringify(slots));
  return true;
}

// ============================================================
// ER OVERALL STATISTICS
// ============================================================

function getAdminStats() {
  const venues    = getVenues();
  const stats     = getAllBookingStats();
  const students  = getStudents();
  const faculty   = getFacultyList();
  const approvals = getApprovals();
  const admins    = getAdminUsers();

  return {
    ...stats,
    availableVenues:   venues.filter(v => v.V_Status === 'Available').length,
    totalVenues:       venues.length,
    bookedVenues:      venues.filter(v => v.V_Status === 'Booked').length,
    maintenanceVenues: venues.filter(v => v.V_Status === 'Maintenance').length,
    totalStudents:     students.length,
    totalFaculty:      faculty.length,
    totalApprovals:    approvals.length,
    totalAdmins:       admins.length
  };
}

/**
 * Get all bookings enriched with requester, venue, and timeslot info.
 */
function getEnrichedBookings(filters = {}) {
  const bookings = filterBookings({ ...filters });
  return bookings.map(b => {
    const venue     = (b.venue && b.venue.V_type) ? b.venue : (getVenueById(b.V_ID) || null);
    const requester = (b.requester && b.requester.name) ? b.requester : (getRequesterInfo(b) || null);
    const slots     = (b.slots && b.slots.length) ? b.slots : getTimeslotsForBooking(b.B_ID);
    const approval  = b.approval || getApprovalForBooking(b.B_ID);
    const fallbackDate = b.eventDate || (slots.length ? slots[0].EventDate : (b.B_Date || null));
    const fallbackTime = b.timeRange || (slots.length && slots[0].StartTime ? `${formatTime(slots[0].StartTime)} – ${formatTime(slots[0].EndTime)}` : '—');

    return {
      ...b,
      venue,
      venueName:    venue ? getVenueDisplayName(venue) : (b.venueName || 'Unknown Venue'),
      requester:    requester || {
        name: b.student_name || b.faculty_name || (b.rno ? 'Student ' + b.rno : (b.fno ? 'Faculty ' + b.fno : 'Requester')),
        email: b.student_email || b.faculty_email || '',
        dept: b.student_dept || b.faculty_dept || 'General',
        type: b.rno ? 'Student' : (b.fno ? 'Faculty' : 'User'),
        role: b.rno ? 'Student' : (b.fno ? 'Faculty' : 'User'),
        contact: b.student_contact || b.faculty_contact || '—'
      },
      slots,
      approval,
      eventDate:    fallbackDate,
      timeRange:    fallbackTime,
    };
  });
}

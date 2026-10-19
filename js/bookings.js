/**
 * vAccess — bookings.js
 * Booking data access and business logic.
 *
 * These functions abstract all booking-related data operations.
 * REPLACE localStorage calls with fetch() API calls when integrating backend.
 */

// ============================================================
// BOOKING CRUD
// ============================================================

/**
 * Get all bookings.
 * REPLACE: return await fetch('/api/bookings').then(r => r.json())
 */
function getBookings() {
  return JSON.parse(localStorage.getItem('va_bookings') || '[]');
}

/**
 * Get a single booking by B_ID.
 * REPLACE: return await fetch(`/api/bookings/${bId}`).then(r => r.json())
 */
function getBookingById(bId) {
  return getBookings().find(b => b.B_ID === bId) || null;
}

/**
 * Get bookings for the currently logged-in user.
 * REPLACE: fetch with auth token which server uses to filter.
 */
function getMyBookings() {
  const session = getSession();
  if (!session) return [];
  const all = getBookings();
  if (session.role === 'student') return all.filter(b => b.rno === session.id);
  if (session.role === 'faculty') return all.filter(b => b.fno === session.id);
  return all; // admin sees all
}

/**
 * Create a new booking.
 * Returns the created booking object.
 *
 * REPLACE: return await fetch('/api/bookings', { method: 'POST', body: JSON.stringify(data) }).then(r => r.json())
 */
function createBooking({ V_ID, Purpose, noOfMembers, eventDate, startTime, endTime }) {
  const session = getSession();
  if (!session) return null;

  const newBooking = {
    B_ID:        generateBookingId(),
    B_Date:      today(),
    B_Status:    'Pending',
    Purpose,
    noOfMembers: parseInt(noOfMembers, 10),
    rno:         session.role === 'student' ? session.id : null,
    fno:         session.role === 'faculty' ? session.id : null,
    V_ID,
  };

  const bookings = getBookings();
  bookings.push(newBooking);
  localStorage.setItem('va_bookings', JSON.stringify(bookings));

  // Save associated timeslot
  const newSlot = {
    Slot_ID:   generateSlotId(),
    EventDate: eventDate,
    StartTime: startTime,
    EndTime:   endTime,
    B_ID:      newBooking.B_ID,
  };
  saveTimeslot(newSlot);

  // Create notification
  const venue = getVenueById(V_ID);
  createNotification({
    type: 'info',
    message: `Your booking ${newBooking.B_ID} for ${getVenueDisplayName(venue)} is pending approval.`,
    B_ID: newBooking.B_ID,
    rno:  newBooking.rno,
    fno:  newBooking.fno,
  });

  return newBooking;
}

/**
 * Update the status of a booking.
 * REPLACE: await fetch(`/api/bookings/${bId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
 */
function updateBookingStatus(bId, newStatus) {
  const bookings = getBookings();
  const idx = bookings.findIndex(b => b.B_ID === bId);
  if (idx === -1) return false;
  bookings[idx].B_Status = newStatus;
  localStorage.setItem('va_bookings', JSON.stringify(bookings));
  return true;
}

/**
 * Cancel a booking (user action).
 * Only pending bookings can be cancelled.
 */
function cancelBooking(bId) {
  const booking = getBookingById(bId);
  if (!booking || booking.B_Status !== 'Pending') return false;
  const success = updateBookingStatus(bId, 'Cancelled');
  if (success) {
    const venue = getVenueById(booking.V_ID);
    createNotification({
      type: 'warning',
      message: `Your booking ${bId} for ${getVenueDisplayName(venue)} has been cancelled.`,
      B_ID: bId,
      rno:  booking.rno,
      fno:  booking.fno,
    });
  }
  return success;
}

// ============================================================
// FILTERING
// ============================================================

/**
 * Filter bookings by various criteria.
 * Used by both admin and user booking list pages.
 */
function filterBookings({ bookings = null, search = '', status = '', vId = '', dept = '', date = '' } = {}) {
  let list = bookings || getBookings();

  if (search) {
    const term = search.toLowerCase();
    list = list.filter(b => {
      const requester = getRequesterInfo(b);
      return b.B_ID.toLowerCase().includes(term) ||
        b.Purpose.toLowerCase().includes(term) ||
        (requester && requester.name.toLowerCase().includes(term));
    });
  }
  if (status) list = list.filter(b => b.B_Status === status);
  if (vId)    list = list.filter(b => b.V_ID === vId);
  if (date)   list = list.filter(b => {
    const slots = getTimeslotsForBooking(b.B_ID);
    return slots.some(s => s.EventDate === date);
  });
  if (dept) {
    list = list.filter(b => {
      const info = getRequesterInfo(b);
      return info && info.dept && info.dept === dept;
    });
  }

  return list;
}

// ============================================================
// REQUESTER HELPER
// ============================================================

/**
 * Get requester (student or faculty) info from a booking.
 * Returns { name, email, dept, role, id }
 */
function getRequesterInfo(booking) {
  if (!booking) return null;
  if (booking.rno) {
    const students = JSON.parse(localStorage.getItem('va_students') || '[]');
    const s = students.find(st => st.rno === booking.rno);
    if (s) return { name: s.S_name, email: s.S_Email, dept: s.Dept, role: 'Student', id: s.rno, contactNo: s.ContactNo };
  }
  if (booking.fno) {
    const faculty = JSON.parse(localStorage.getItem('va_faculty') || '[]');
    const f = faculty.find(fc => fc.fno === booking.fno);
    if (f) return { name: f.F_name, email: f.F_Email, dept: f.Dept, role: 'Faculty', id: f.fno, contactNo: f.ContactNo || '—' };
  }
  return null;
}

// ============================================================
// BOOKING STATISTICS
// ============================================================

/** Get booking statistics for the current user */
function getMyBookingStats() {
  const bookings = getMyBookings();
  return {
    total:     bookings.length,
    pending:   bookings.filter(b => b.B_Status === 'Pending').length,
    approved:  bookings.filter(b => b.B_Status === 'Approved').length,
    rejected:  bookings.filter(b => b.B_Status === 'Rejected').length,
    cancelled: bookings.filter(b => b.B_Status === 'Cancelled').length,
  };
}

/** Get overall booking statistics (admin view) */
function getAllBookingStats() {
  const bookings = getBookings();
  return {
    total:     bookings.length,
    pending:   bookings.filter(b => b.B_Status === 'Pending').length,
    approved:  bookings.filter(b => b.B_Status === 'Approved').length,
    rejected:  bookings.filter(b => b.B_Status === 'Rejected').length,
    cancelled: bookings.filter(b => b.B_Status === 'Cancelled').length,
  };
}

/** Get upcoming bookings for the current user (approved, event date >= today) */
function getUpcomingBookings(limit = 3) {
  const now = today();
  return getMyBookings()
    .filter(b => b.B_Status === 'Approved')
    .filter(b => {
      const slots = getTimeslotsForBooking(b.B_ID);
      return slots.some(s => s.EventDate >= now);
    })
    .slice(0, limit);
}

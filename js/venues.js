/**
 * vAccess — venues.js
 * Venue data access layer.
 *
 * These functions abstract data access for venues and timeslots.
 * Replace localStorage calls with fetch() API calls when integrating backend.
 */

// ============================================================
// VENUE CRUD
// ============================================================

/** Get all venues from storage */
function getVenues() {
  return JSON.parse(localStorage.getItem('va_venues') || '[]');
}

/** Get a single venue by V_ID */
function getVenueById(vId) {
  return getVenues().find(v => String(v.V_ID) === String(vId) || String(v.v_id) === String(vId)) || null;
}

/** Get display name for a venue */
function getVenueDisplayName(venue) {
  if (!venue) return 'Unknown Venue';
  return `${venue.V_type} – ${venue.SubType}`;
}

/** Filter venues by criteria */
function filterVenues({ search = '', vType = '', subType = '', category = '', status = '', minCapacity = '', maxCapacity = '' } = {}) {
  let venues = getVenues();

  if (search) {
    const term = search.toLowerCase();
    venues = venues.filter(v =>
      v.V_ID.toLowerCase().includes(term) ||
      v.V_type.toLowerCase().includes(term) ||
      v.SubType.toLowerCase().includes(term) ||
      v.Category.toLowerCase().includes(term)
    );
  }
  if (vType)     venues = venues.filter(v => v.V_type === vType);
  if (subType)   venues = venues.filter(v => v.SubType === subType);
  if (category)  venues = venues.filter(v => v.Category === category);
  if (status)    venues = venues.filter(v => v.V_Status === status);
  if (minCapacity) venues = venues.filter(v => v.Capacity >= parseInt(minCapacity));
  if (maxCapacity) venues = venues.filter(v => v.Capacity <= parseInt(maxCapacity));

  return venues;
}

/** Get unique venue types */
function getVenueTypes() {
  return [...new Set(getVenues().map(v => v.V_type))].sort();
}

/** Get unique categories */
function getVenueCategories() {
  return [...new Set(getVenues().map(v => v.Category))].sort();
}

/** Update a venue's status */
function updateVenueStatus(vId, newStatus) {
  const venues = getVenues();
  const idx = venues.findIndex(v => v.V_ID === vId);
  if (idx === -1) return false;
  venues[idx].V_Status = newStatus;
  localStorage.setItem('va_venues', JSON.stringify(venues));
  return true;
}

/** Add a new venue (mock) */
function addVenue(venueData) {
  const venues = getVenues();
  const nums = venues.map(v => parseInt(v.V_ID.replace('V', ''), 10)).filter(n => !isNaN(n));
  const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
  const newVenue = {
    V_ID: 'V' + String(nextNum).padStart(3, '0'),
    ...venueData,
    V_Status: venueData.V_Status || 'Available',
  };
  venues.push(newVenue);
  localStorage.setItem('va_venues', JSON.stringify(venues));
  return newVenue;
}

// ============================================================
// TIMESLOT DATA ACCESS
// ============================================================

/** Get all timeslots */
function getTimeslots() {
  return JSON.parse(localStorage.getItem('va_timeslots') || '[]');
}

/**
 * Get available time slots for a given venue and date.
 * Returns an array of slot objects with { StartTime, EndTime, label, isBooked, Slot_ID? }
 *
 * REPLACE with fetch() when integrating backend:
 *   return await fetch(`/api/slots?venueId=${vId}&date=${date}`).then(r => r.json())
 */
function getAvailableSlots(vId, date) {
  // Get all bookings for this venue on this date with non-cancelled status
  const bookings = getBookings().filter(b =>
    (String(b.V_ID) === String(vId) || String(b.v_id) === String(vId)) &&
    String(b.B_Status).toLowerCase() !== 'cancelled' &&
    String(b.B_Status).toLowerCase() !== 'rejected'
  );
  const bookingIds = bookings.map(b => String(b.B_ID));

  // Get all timeslots for those bookings on this date
  const bookedSlots = getTimeslots().filter(ts =>
    ts.EventDate === date && (bookingIds.includes(String(ts.B_ID)) || bookingIds.includes(`B${String(ts.B_ID).padStart(3, '0')}`))
  );

  // Map standard time slots against booked ones
  return STANDARD_TIMESLOTS.map(slot => {
    const booked = bookedSlots.find(bs =>
      bs.StartTime === slot.StartTime && bs.EndTime === slot.EndTime
    );
    return {
      StartTime: slot.StartTime,
      EndTime:   slot.EndTime,
      label:     slot.label,
      isBooked:  !!booked,
      Slot_ID:   booked ? booked.Slot_ID : null,
      B_ID:      booked ? booked.B_ID : null,
    };
  });
}

/** Save a new timeslot record */
function saveTimeslot(slotData) {
  const slots = getTimeslots();
  slots.push(slotData);
  localStorage.setItem('va_timeslots', JSON.stringify(slots));
}

/** Get timeslot(s) for a booking */
function getTimeslotsForBooking(bId) {
  return getTimeslots().filter(ts => ts.B_ID === bId);
}

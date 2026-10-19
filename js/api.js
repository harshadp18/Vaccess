/**
 * vAccess — api.js
 * Unified API Client & Backend Integration Layer.
 * Connects the frontend to the vAccess Express backend at http://localhost:5000/api
 * Handles CORS, session credentials, and normalized ER data models.
 */

(function (window) {
  'use strict';

  // Configurable base URL (prefers config.js API_BASE if defined, then active browser origin)
  function resolveApiBaseUrl() {
    if (typeof API_BASE !== 'undefined' && API_BASE) {
      return String(API_BASE).replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
      return `${window.location.origin}/api`;
    }
    return 'http://localhost:3000/api';
  }

  let API_BASE_URL = resolveApiBaseUrl();

  // Validate and sanitize stored API URL
  try {
    const stored = localStorage.getItem('va_api_url');
    if (stored) {
      if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
        const storedOrigin = new URL(stored).origin;
        if (storedOrigin === window.location.origin) {
          API_BASE_URL = stored.replace(/\/+$/, '');
        } else {
          // Purge stale port from older run (e.g., 5000 when running on 3000)
          localStorage.removeItem('va_api_url');
          API_BASE_URL = resolveApiBaseUrl();
        }
      } else {
        API_BASE_URL = stored.replace(/\/+$/, '');
      }
    }
  } catch {
    API_BASE_URL = resolveApiBaseUrl();
  }

  function setApiBaseUrl(url) {
    if (!url) url = resolveApiBaseUrl();
    API_BASE_URL = url.replace(/\/+$/, '');
    localStorage.setItem('va_api_url', API_BASE_URL);
  }

  function getApiBaseUrl() {
    return API_BASE_URL;
  }

  /**
   * Safe fetch with credentials and JSON headers
   */
  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

    const config = {
      ...options,
      signal: controller.signal,
      credentials: 'include', // Ensures session cookie connect.sid is sent
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(url, config);
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        const errorMsg = (data && data.error) || (data && data.message) || `HTTP ${res.status}: ${res.statusText}`;
        const err = new Error(errorMsg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('API request timed out.');
      }
      throw err;
    }
  }

  /**
   * Normalizer for Venue objects across backend SQL & frontend ER model
   */
  function normalizeVenue(v) {
    if (!v) return null;
    return {
      V_ID: v.v_id || v.V_ID || '',
      v_id: v.v_id || v.V_ID || '',
      V_type: v.v_type || v.V_type || 'General Venue',
      SubType: v.subtype || v.SubType || '',
      Category: v.category || v.Category || 'General',
      V_Status: v.v_status || v.V_Status || 'Available',
      Capacity: parseInt(v.capacity || v.Capacity || 50, 10),
      ContactNo: v.contactno || v.ContactNo || '—'
    };
  }

  /**
   * Normalizer for Booking objects across backend SQL & frontend ER model
   */
  function normalizeBooking(b) {
    if (!b) return null;
    const rawId = b.b_id !== undefined ? b.b_id : b.B_ID;
    const bookingIdStr = String(rawId).startsWith('B') ? String(rawId) : `B${String(rawId).padStart(3, '0')}`;
    const rawDate = b.eventdate || b.EventDate || b.b_date || b.B_Date || '';
    const dateStr = rawDate ? String(rawDate).split('T')[0] : '';
    const startTime = b.starttime || b.StartTime || '';
    const endTime = b.endtime || b.EndTime || '';

    let formattedTime = '—';
    if (startTime && endTime) {
      if (typeof formatTime === 'function') {
        formattedTime = `${formatTime(startTime)} – ${formatTime(endTime)}`;
      } else {
        formattedTime = `${startTime} – ${endTime}`;
      }
    }

    const requesterName = b.student_name || b.faculty_name || (b.requester ? b.requester.name : null) || 'Unknown Requester';
    const requesterDept = b.student_dept || b.faculty_dept || b.dept || (b.requester ? b.requester.dept : null) || 'General';
    const requesterRole = b.rno ? 'Student' : b.fno ? 'Faculty' : (b.requester ? b.requester.role || b.requester.type : 'User');
    const requesterEmail = b.student_email || b.faculty_email || (b.requester ? b.requester.email : '');
    const requesterContact = b.student_contact || b.faculty_contact || b.contactno || (b.requester ? b.requester.contact : '—');

    let approvalObj = null;
    if (b.decision || b.ap_id || b.approval) {
      approvalObj = {
        Ap_ID: b.ap_id || (b.approval ? b.approval.Ap_ID : null),
        Ap_Date: b.ap_date ? String(b.ap_date).split('T')[0] : (b.approval ? b.approval.Ap_Date : null),
        Decision: b.decision || (b.approval ? b.approval.Decision : null),
        Remark: b.remark !== undefined ? b.remark : (b.approval ? b.approval.Remark : ''),
        A_ID: b.a_id || (b.approval ? b.approval.A_ID : null),
        A_Name: b.admin_name || (b.approval ? b.approval.A_Name : 'Administrator'),
        A_Email: b.admin_email || (b.approval ? b.approval.A_Email : '')
      };
    }

    return {
      B_ID: bookingIdStr,
      b_id: rawId,
      B_Date: b.b_date ? String(b.b_date).split('T')[0] : new Date().toISOString().split('T')[0],
      B_Status: b.b_status || b.B_Status || 'Pending',
      Purpose: b.purpose || b.Purpose || '',
      noOfMembers: parseInt(b.noofmembers || b.noOfMembers || 1, 10),
      rno: b.rno || null,
      fno: b.fno || null,
      V_ID: b.v_id || b.V_ID || '',
      v_id: b.v_id || b.V_ID || '',
      eventDate: dateStr,
      startTime: startTime,
      endTime: endTime,
      timeRange: formattedTime,
      venueName: b.v_type ? `${b.v_type}${b.subtype ? ' – ' + b.subtype : ''}` : (b.venueName || 'Venue'),
      venue: {
        V_ID: b.v_id || b.V_ID || '',
        v_id: b.v_id || b.V_ID || '',
        V_type: b.v_type || '',
        SubType: b.subtype || '',
        Category: b.category || '',
        Capacity: b.capacity || 50
      },
      requester: {
        name: requesterName,
        email: requesterEmail,
        dept: requesterDept,
        role: requesterRole,
        type: requesterRole.toLowerCase(),
        id: b.rno || b.fno || '',
        contact: requesterContact
      },
      approval: approvalObj
    };
  }

  // ============================================================
  // vAccess API Client Object
  // ============================================================
  const vAccessAPI = {
    setApiBaseUrl,
    getApiBaseUrl,
    request,
    normalizeVenue,
    normalizeBooking,

    // ----------------------------------------------------
    // AUTHENTICATION
    // ----------------------------------------------------
    async login(email, password, role) {
      email = email.trim();
      try {
        const res = await request('/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        if (res && res.user) {
          const u = res.user;
          const backendRole = String(u.role || '').toLowerCase();
          const selectedRole = String(role || '').toLowerCase();

          if (backendRole && selectedRole && backendRole !== selectedRole) {
            await this.logout();
            return {
              success: false,
              error: 'Please select the correct role for this account.'
            };
          }

          const session = {
            role: backendRole,
            id: u.id,
            name: u.name,
            email: u.email,
            dept: u.dept || (backendRole === 'admin' ? null : 'General'),
            contactNo: u.contactno || u.contactNo || '',
            A_ID: backendRole === 'admin' ? (u.id || 'ADM001') : null
          };

          if (typeof setSession === 'function') {
            setSession(session);
          }
          return { success: true, session, user: session };
        }
      } catch (err) {
        console.warn('Backend login request error:', err.message);
        if (typeof mockLogin === 'function') {
          const mockRes = mockLogin(email, password, role);
          if (mockRes.success) return mockRes;
          if (mockRes.error) return mockRes;
        }
        return { success: false, error: err.message || 'Login failed.' };
      }

      if (typeof mockLogin === 'function') {
        return mockLogin(email, password, role);
      }
      return { success: false, error: 'Could not connect to authentication service.' };
    },

    async register(data) {
      try {
        const res = await request('/auth/register', {
          method: 'POST',
          body: data
        });
        if (res && res.session) {
          if (typeof setSession === 'function') {
            setSession(res.session);
          }
          return { success: true, message: res.message, session: res.session };
        }
      } catch (err) {
        console.warn('Backend registration error:', err.message);
        return { success: false, error: err.message || 'Registration failed.' };
      }

      if (typeof mockRegister === 'function') {
        return mockRegister(data);
      }
      return { success: false, error: 'Registration failed.' };
    },

    async logout(redirectTo) {
      try {
        await request('/auth/logout', { method: 'POST' });
      } catch (err) {
        console.warn('Backend logout request error:', err.message);
      }

      if (typeof clearSession === 'function') {
        clearSession();
      } else {
        localStorage.removeItem('va_session');
      }

      const isPagesDir = window.location.pathname.includes('/pages/');
      const target = redirectTo || (isPagesDir ? 'login.html' : 'pages/login.html');
      window.location.href = target;
    },

    async getMe() {
      try {
        const res = await request('/auth/me');
        if (res && res.user) {
          return { success: true, user: res.user };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
      return { success: false, error: 'Not authenticated' };
    },

    getSession() {
      if (typeof getSession === 'function') {
        return getSession();
      }
      const raw = localStorage.getItem('va_session');
      try { return JSON.parse(raw); } catch { return null; }
    },

    // ----------------------------------------------------
    // VENUES
    // ----------------------------------------------------
    async getVenues(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.category && filters.category !== 'all') params.append('category', filters.category);
        if (filters.status && filters.status !== 'all') params.append('status', filters.status);
        const query = params.toString() ? `?${params.toString()}` : '';

        const res = await request(`/venues${query}`);
        if (Array.isArray(res)) {
          const venues = res.map(normalizeVenue);
          localStorage.setItem('va_venues', JSON.stringify(venues));
          return venues;
        }
      } catch (err) {
        console.warn('GET /api/venues error, falling back to local cache:', err.message);
      }

      if (typeof getVenues === 'function') {
        return filterVenues(filters);
      }
      return JSON.parse(localStorage.getItem('va_venues') || '[]');
    },

    async getVenueById(vId) {
      try {
        const res = await request(`/venues/${vId}`);
        if (res && res.v_id) {
          return normalizeVenue(res);
        }
      } catch (err) {
        console.warn(`GET /api/venues/${vId} error:`, err.message);
      }

      if (typeof window.getVenueById === 'function') {
        return window.getVenueById(vId);
      }
      const venues = JSON.parse(localStorage.getItem('va_venues') || '[]');
      return venues.find(v => String(v.V_ID) === String(vId) || String(v.v_id) === String(vId)) || null;
    },

    async getAvailableVenues(date, startTime, endTime) {
      try {
        const params = new URLSearchParams({ date, startTime, endTime });
        const res = await request(`/venues/available?${params.toString()}`);
        if (Array.isArray(res)) {
          return res.map(normalizeVenue);
        }
      } catch (err) {
        console.warn('GET /api/venues/available error:', err.message);
      }

      const all = await this.getVenues();
      return all.filter(v => v.V_Status === 'Available');
    },

    // ----------------------------------------------------
    // BOOKINGS & TIMESLOTS
    // ----------------------------------------------------
    async createBooking(bookingData) {
      const session = this.getSession();
      const payload = {
        v_id: bookingData.V_ID || bookingData.v_id,
        rno: session && session.role === 'student' ? session.id : null,
        fno: session && session.role === 'faculty' ? session.id : null,
        purpose: bookingData.Purpose || bookingData.purpose,
        noofmembers: parseInt(bookingData.noOfMembers || bookingData.noofmembers || 1, 10),
        eventdate: bookingData.eventDate || bookingData.eventdate,
        starttime: bookingData.startTime || bookingData.starttime,
        endtime: bookingData.endTime || bookingData.endtime
      };

      let backendResult = null;
      try {
        const res = await request('/bookings', {
          method: 'POST',
          body: payload
        });
        if (res && res.booking) {
          backendResult = normalizeBooking(res.booking);
        }
      } catch (err) {
        console.error('POST /api/bookings error:', err.message);
        throw err;
      }

      let newBooking;
      if (backendResult) {
        newBooking = {
          B_ID: backendResult.B_ID,
          b_id: backendResult.b_id,
          B_Date: backendResult.B_Date,
          B_Status: 'Pending',
          Purpose: payload.purpose,
          noOfMembers: payload.noofmembers,
          rno: payload.rno,
          fno: payload.fno,
          V_ID: payload.v_id,
          venueName: backendResult.venueName,
          eventDate: payload.eventdate,
          startTime: payload.starttime,
          endTime: payload.endtime,
          timeRange: `${payload.starttime} – ${payload.endtime}`
        };
      } else {
        const bId = typeof generateBookingId === 'function' ? generateBookingId() : `B${Math.floor(Math.random() * 900) + 100}`;
        newBooking = {
          B_ID: bId,
          b_id: parseInt(bId.replace(/^B/i, ''), 10) || 1,
          B_Date: new Date().toISOString().split('T')[0],
          B_Status: 'Pending',
          Purpose: payload.purpose,
          noOfMembers: payload.noofmembers,
          rno: payload.rno,
          fno: payload.fno,
          V_ID: payload.v_id,
          eventDate: payload.eventdate,
          startTime: payload.starttime,
          endTime: payload.endtime,
          timeRange: `${payload.starttime} – ${payload.endtime}`
        };
      }

      // Update local storage
      const bookings = JSON.parse(localStorage.getItem('va_bookings') || '[]');
      if (!bookings.some(b => String(b.B_ID) === String(newBooking.B_ID))) {
        bookings.push(newBooking);
        localStorage.setItem('va_bookings', JSON.stringify(bookings));
      }

      const timeslots = JSON.parse(localStorage.getItem('va_timeslots') || '[]');
      const slotId = typeof generateSlotId === 'function' ? generateSlotId() : `TS_${newBooking.B_ID}`;
      timeslots.push({
        Slot_ID: slotId,
        EventDate: payload.eventdate,
        StartTime: payload.starttime,
        EndTime: payload.endtime,
        B_ID: newBooking.B_ID
      });
      localStorage.setItem('va_timeslots', JSON.stringify(timeslots));

      if (typeof createNotification === 'function') {
        createNotification({
          type: 'info',
          message: `Your booking ${newBooking.B_ID} is pending approval.`,
          B_ID: newBooking.B_ID,
          rno: newBooking.rno,
          fno: newBooking.fno
        });
      }

      return newBooking;
    },

    async getBookings(filters = {}) {
      const session = this.getSession();
      if (session && session.role && session.role.toLowerCase() === 'admin') {
        return this.getAdminBookings(filters);
      }
      return this.getMyBookings(filters);
    },

    async getMyBookings(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters.date) params.append('date', filters.date);
        const query = params.toString() ? `?${params.toString()}` : '';

        const res = await request(`/bookings${query}`);
        if (Array.isArray(res)) {
          const normalized = res.map(normalizeBooking);
          this._syncLocalBookings(normalized);
          return normalized;
        }
      } catch (err) {
        console.warn('GET /api/bookings error, fallback to local cache:', err.message);
      }

      if (typeof getMyBookings === 'function') {
        return getMyBookings();
      }
      return JSON.parse(localStorage.getItem('va_bookings') || '[]');
    },

    async getBookingById(bId) {
      const cleanId = String(bId).replace(/^B/i, '');
      try {
        const res = await request(`/bookings/${cleanId}`);
        if (res && (res.b_id !== undefined || res.B_ID !== undefined)) {
          const normalized = normalizeBooking(res);
          this._syncLocalBookings([normalized]);
          return normalized;
        }
      } catch (err) {
        console.warn(`GET /api/bookings/${cleanId} error:`, err.message);
      }

      const bookings = JSON.parse(localStorage.getItem('va_bookings') || '[]');
      const found = bookings.find(b => 
        String(b.B_ID) === String(bId) || 
        String(b.b_id) === String(cleanId) ||
        String(b.B_ID) === String(cleanId) ||
        `B${String(b.b_id).padStart(3, '0')}` === String(bId)
      );
      return found ? normalizeBooking(found) : null;
    },

    async cancelBooking(bId) {
      if (typeof cancelBooking === 'function') {
        return cancelBooking(bId);
      }
      return false;
    },

    // ----------------------------------------------------
    // ADMIN APPROVAL WORKFLOW
    // ----------------------------------------------------
    async getAdminBookings(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.status && filters.status !== 'all') params.append('status', filters.status);
        if (filters.date) params.append('date', filters.date);
        const query = params.toString() ? `?${params.toString()}` : '';

        const res = await request(`/admin/bookings${query}`);
        if (Array.isArray(res)) {
          const normalized = res.map(normalizeBooking);
          this._syncLocalBookings(normalized);
          return normalized;
        }
      } catch (err) {
        console.warn('GET /api/admin/bookings error, fallback to local cache:', err.message);
      }

      if (typeof getEnrichedBookings === 'function') {
        return getEnrichedBookings(filters);
      }
      return JSON.parse(localStorage.getItem('va_bookings') || '[]');
    },

    async approveBooking(bId, remark = '') {
      const cleanId = String(bId).replace(/^B/i, '');
      const session = this.getSession();

      try {
        const res = await request(`/bookings/${cleanId}/approve`, {
          method: 'POST',
          body: {
            remark: remark || 'Approved by administrator'
          }
        });

        // Update local cache
        this._updateLocalDecision(bId, 'Approved', remark, session, res && res.approvalId);
        return res || { success: true };
      } catch (err) {
        console.error('Approve booking failed:', err.message);
        throw err;
      }
    },

    async rejectBooking(bId, remark = 'Rejected by administrator') {
      const cleanId = String(bId).replace(/^B/i, '');
      const session = this.getSession();

      try {
        const res = await request(`/bookings/${cleanId}/reject`, {
          method: 'POST',
          body: {
            remark: remark || 'Rejected by administrator'
          }
        });

        // Update local cache
        this._updateLocalDecision(bId, 'Rejected', remark, session, res && res.approvalId);
        return res || { success: true };
      } catch (err) {
        console.error('Reject booking failed:', err.message);
        throw err;
      }
    },

    async getApprovals() {
      if (typeof getApprovals === 'function') {
        return getApprovals();
      }
      return JSON.parse(localStorage.getItem('va_approvals') || '[]');
    },

    // ----------------------------------------------------
    // NOTIFICATIONS
    // ----------------------------------------------------
    async getNotifications() {
      try {
        const session = typeof getSession === 'function' ? getSession() : null;
        let endpoint = '/notifications';
        if (session && session.role) {
          const uId = session.id || session.rno || session.fno || session.A_ID || '';
          endpoint += `?role=${encodeURIComponent(session.role)}&userId=${encodeURIComponent(uId)}`;
        }
        const res = await request(endpoint);
        if (Array.isArray(res)) {
          const existing = JSON.parse(localStorage.getItem('va_notifications') || '[]');
          const readMap = new Map();
          existing.forEach(e => {
            if (e.read || e.isRead) readMap.set(String(e.id), true);
          });
          const mapped = res.map(n => {
            const isItemRead = readMap.has(String(n.id)) ? true : Boolean(n.read || n.isRead);
            return {
              id: n.id,
              type: n.type || 'info',
              title: n.title || 'Notification',
              message: n.message,
              time: n.time || new Date().toISOString(),
              read: isItemRead,
              isRead: isItemRead,
              B_ID: n.B_ID || null,
              b_id: n.b_id || null,
              rno: n.rno || null,
              fno: n.fno || null
            };
          });
          localStorage.setItem('va_notifications', JSON.stringify(mapped));
          if (typeof updateNotifBadge === 'function') updateNotifBadge();
          return mapped;
        }
      } catch (err) {
        console.warn('GET /api/notifications error:', err.message);
      }

      if (typeof getMyNotifications === 'function') {
        return getMyNotifications();
      }
      return JSON.parse(localStorage.getItem('va_notifications') || '[]');
    },

    // ----------------------------------------------------
    // FACULTY & STUDENT DIRECTORIES
    // ----------------------------------------------------
    async getAdminFaculty() {
      try {
        const res = await request('/admin/faculty');
        if (Array.isArray(res)) {
          const faculty = res.map(f => ({
            fno: f.fno,
            F_name: f.f_name || f.F_name,
            F_Email: f.f_email || f.F_Email,
            Dept: f.dept || f.Dept || 'General',
            ContactNo: f.contactno || f.ContactNo || '—',
            bookingCount: parseInt(f.booking_count || 0, 10)
          }));
          localStorage.setItem('va_faculty', JSON.stringify(faculty));
          return faculty;
        }
      } catch (err) {
        console.warn('GET /api/admin/faculty error:', err.message);
      }
      return JSON.parse(localStorage.getItem('va_faculty') || '[]');
    },

    async saveFaculty(data) {
      if (data.fno) {
        try {
          const res = await request(`/admin/faculty/${data.fno}`, {
            method: 'PUT',
            body: data
          });
          await this.getAdminFaculty();
          return res.faculty || data;
        } catch {
          try {
            const res = await request('/admin/faculty', { method: 'POST', body: data });
            await this.getAdminFaculty();
            return res.faculty || data;
          } catch (e) {
            console.warn('Save faculty API error:', e.message);
          }
        }
      } else {
        const res = await request('/admin/faculty', { method: 'POST', body: data });
        await this.getAdminFaculty();
        return res.faculty || data;
      }
      if (typeof saveFaculty === 'function') return saveFaculty(data);
      return data;
    },

    async deleteFaculty(fno) {
      try {
        await request(`/admin/faculty/${fno}`, { method: 'DELETE' });
        await this.getAdminFaculty();
        return true;
      } catch (err) {
        console.warn('DELETE /api/admin/faculty error:', err.message);
        if (typeof deleteFaculty === 'function') return deleteFaculty(fno);
        throw err;
      }
    },

    async getAdminStudents() {
      try {
        const res = await request('/admin/students');
        if (Array.isArray(res)) {
          const students = res.map(s => ({
            rno: s.rno,
            S_name: s.s_name || s.S_name,
            S_Email: s.s_email || s.S_Email,
            Dept: s.dept || s.Dept || 'General',
            ContactNo: s.contactno || s.ContactNo || '—',
            bookingCount: parseInt(s.booking_count || 0, 10)
          }));
          localStorage.setItem('va_students', JSON.stringify(students));
          return students;
        }
      } catch (err) {
        console.warn('GET /api/admin/students error:', err.message);
      }
      return JSON.parse(localStorage.getItem('va_students') || '[]');
    },

    async saveStudent(data) {
      if (data.rno) {
        try {
          const res = await request(`/admin/students/${data.rno}`, {
            method: 'PUT',
            body: data
          });
          await this.getAdminStudents();
          return res.student || data;
        } catch {
          try {
            const res = await request('/admin/students', { method: 'POST', body: data });
            await this.getAdminStudents();
            return res.student || data;
          } catch (e) {
            console.warn('Save student API error:', e.message);
          }
        }
      } else {
        const res = await request('/admin/students', { method: 'POST', body: data });
        await this.getAdminStudents();
        return res.student || data;
      }
      if (typeof saveStudent === 'function') return saveStudent(data);
      return data;
    },

    async deleteStudent(rno) {
      try {
        await request(`/admin/students/${rno}`, { method: 'DELETE' });
        await this.getAdminStudents();
        return true;
      } catch (err) {
        console.warn('DELETE /api/admin/students error:', err.message);
        if (typeof deleteStudent === 'function') return deleteStudent(rno);
        throw err;
      }
    },

    async getAdminUsers() {
      try {
        const res = await request('/admin/admins');
        if (Array.isArray(res)) {
          const admins = res.map(a => ({
            A_ID: a.a_id,
            A_Name: a.a_name,
            A_Email: a.a_email
          }));
          localStorage.setItem('va_admins', JSON.stringify(admins));
          return admins;
        }
      } catch (err) {
        console.warn('GET /api/admin/admins error:', err.message);
      }
      return JSON.parse(localStorage.getItem('va_admins') || '[]');
    },

    async toggleVenueMaintenance(vId) {
      try {
        const res = await request(`/admin/venues/${vId}/toggle-maintenance`, { method: 'POST' });
        await this.getVenues();
        return res;
      } catch (err) {
        console.warn('toggle maintenance error:', err.message);
        throw err;
      }
    },

    // ----------------------------------------------------
    // DASHBOARD STATS
    // ----------------------------------------------------
    async getAdminDashboardStats() {
      try {
        const res = await request('/admin/dashboard');
        if (res && typeof res.pendingBookings !== 'undefined') {
          return {
            total: (res.pendingBookings || 0) + (res.approvedBookings || 0) + (res.rejectedBookings || 0),
            pending: res.pendingBookings || 0,
            approved: res.approvedBookings || 0,
            rejected: res.rejectedBookings || 0,
            cancelled: 0,
            totalVenues: res.activeVenues || 0
          };
        }
      } catch (err) {
        console.warn('GET /api/admin/dashboard error:', err.message);
      }

      if (typeof getAdminStats === 'function') {
        return getAdminStats();
      }
      return { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, totalVenues: 0 };
    },

    async getStudentDashboardStats() {
      if (typeof getMyBookingStats === 'function') {
        return getMyBookingStats();
      }
      return { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    },

    // ----------------------------------------------------
    // Internal cache sync helpers
    // ----------------------------------------------------
    _syncLocalBookings(normalizedList) {
      if (!Array.isArray(normalizedList)) return;
      const localBookings = JSON.parse(localStorage.getItem('va_bookings') || '[]');
      const localTimeslots = JSON.parse(localStorage.getItem('va_timeslots') || '[]');
      const localApprovals = JSON.parse(localStorage.getItem('va_approvals') || '[]');

      normalizedList.forEach(nb => {
        const cleanId = String(nb.b_id || nb.B_ID).replace(/^B/i, '');
        const idx = localBookings.findIndex(b => 
          String(b.B_ID) === String(nb.B_ID) || 
          String(b.B_ID).replace(/^B/i, '') === cleanId
        );

        const bRecord = {
          B_ID: nb.B_ID,
          b_id: nb.b_id,
          B_Date: nb.B_Date,
          B_Status: nb.B_Status,
          Purpose: nb.Purpose,
          noOfMembers: nb.noOfMembers,
          rno: nb.rno,
          fno: nb.fno,
          V_ID: nb.V_ID,
          venueName: nb.venueName,
          venue: nb.venue,
          requester: nb.requester,
          eventDate: nb.eventDate,
          startTime: nb.startTime,
          endTime: nb.endTime,
          timeRange: nb.timeRange
        };

        if (idx >= 0) {
          localBookings[idx] = { ...localBookings[idx], ...bRecord };
        } else {
          localBookings.push(bRecord);
        }

        if (nb.eventDate && nb.startTime && nb.endTime) {
          const tsIdx = localTimeslots.findIndex(t => 
            String(t.B_ID) === String(nb.B_ID) || 
            String(t.B_ID).replace(/^B/i, '') === cleanId
          );
          const tsRecord = {
            Slot_ID: tsIdx >= 0 ? localTimeslots[tsIdx].Slot_ID : `TS_${cleanId}`,
            EventDate: nb.eventDate,
            StartTime: nb.startTime,
            EndTime: nb.endTime,
            B_ID: nb.B_ID
          };
          if (tsIdx >= 0) {
            localTimeslots[tsIdx] = tsRecord;
          } else {
            localTimeslots.push(tsRecord);
          }
        }

        if (nb.approval) {
          const apIdx = localApprovals.findIndex(a => 
            String(a.B_ID) === String(nb.B_ID) || 
            String(a.B_ID).replace(/^B/i, '') === cleanId
          );
          const apRecord = {
            Ap_ID: nb.approval.Ap_ID,
            Ap_Date: nb.approval.Ap_Date,
            A_ID: nb.approval.A_ID,
            A_Name: nb.approval.A_Name,
            A_Email: nb.approval.A_Email,
            Decision: nb.approval.Decision,
            Remark: nb.approval.Remark,
            B_ID: nb.B_ID
          };
          if (apIdx >= 0) {
            localApprovals[apIdx] = apRecord;
          } else {
            localApprovals.push(apRecord);
          }
        }
      });

      localStorage.setItem('va_bookings', JSON.stringify(localBookings));
      localStorage.setItem('va_timeslots', JSON.stringify(localTimeslots));
      localStorage.setItem('va_approvals', JSON.stringify(localApprovals));
    },

    _updateLocalDecision(bId, decision, remark, session, approvalId) {
      const cleanId = String(bId).replace(/^B/i, '');
      const localBookings = JSON.parse(localStorage.getItem('va_bookings') || '[]');
      const bIdx = localBookings.findIndex(b => 
        String(b.B_ID) === String(bId) || 
        String(b.B_ID).replace(/^B/i, '') === cleanId
      );

      if (bIdx >= 0) {
        localBookings[bIdx].B_Status = decision;
        localStorage.setItem('va_bookings', JSON.stringify(localBookings));
      }

      const approvals = JSON.parse(localStorage.getItem('va_approvals') || '[]');
      const apIdx = approvals.findIndex(a => 
        String(a.B_ID) === String(bId) || 
        String(a.B_ID).replace(/^B/i, '') === cleanId
      );

      const record = {
        Ap_ID: approvalId || (apIdx >= 0 ? approvals[apIdx].Ap_ID : (typeof generateApprovalId === 'function' ? generateApprovalId() : `AP_${cleanId}`)),
        Ap_Date: new Date().toISOString().split('T')[0],
        A_ID: session && (session.id || session.A_ID) ? (session.id || session.A_ID) : 'ADM001',
        A_Name: session && session.name ? session.name : 'Administrator',
        A_Email: session && session.email ? session.email : 'admin@college.edu',
        Decision: decision,
        Remark: remark,
        B_ID: bId
      };

      if (apIdx >= 0) {
        approvals[apIdx] = record;
      } else {
        approvals.push(record);
      }
      localStorage.setItem('va_approvals', JSON.stringify(approvals));
    }
  };

  window.vAccessAPI = vAccessAPI;

})(window);

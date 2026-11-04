/**
 * CinemaPro – Customer Dashboard Client Application
 * Handles customer authentication state, movie selection, 20-seat interactive map,
 * group booking, personal booking history, cancellation, and printable digital E-Tickets.
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // STATE
    // =========================================================================
    const state = {
        currentShowId: 1,
        shows: [],
        currentSeats: [],
        selectedSeats: new Set(),
        myBookings: [],
        pendingCancelBookingId: null
    };

    // Customer profile info passed from Flask session
    const customer = window.CUSTOMER_USER || {};

    // =========================================================================
    // DOM REFERENCES
    // =========================================================================
    const dom = {
        // Clock
        custLiveClock: document.getElementById("custLiveClock"),

        // Shows & Movies
        custMoviesGrid: document.getElementById("custMoviesGrid"),
        custShowSelect: document.getElementById("custShowSelect"),
        custHallTitle: document.getElementById("custHallTitle"),
        custHallTime: document.getElementById("custHallTime"),
        custHallScreen: document.getElementById("custHallScreen"),
        custHallPrice: document.getElementById("custHallPrice"),
        custHallShowPoster: document.getElementById("custHallShowPoster"),

        // Seats & Dock
        custSeatsGrid: document.getElementById("custSeatsGrid"),
        custSelectedPills: document.getElementById("custSelectedPills"),
        custDockCount: document.getElementById("custDockCount"),
        custDockTotal: document.getElementById("custDockTotal"),
        custClearSeatsBtn: document.getElementById("custClearSeatsBtn"),
        custProceedBtn: document.getElementById("custProceedBtn"),

        // Checkout
        custBookingForm: document.getElementById("custBookingForm"),
        custName: document.getElementById("custName"),
        custPhone: document.getElementById("custPhone"),
        custEmail: document.getElementById("custEmail"),
        custConfirmBtn: document.getElementById("custConfirmBtn"),
        custBookingTypeBadge: document.getElementById("custBookingTypeBadge"),

        // Summary
        custSummaryThumb: document.getElementById("custSummaryThumb"),
        custSummaryTitle: document.getElementById("custSummaryTitle"),
        custSummaryMeta: document.getElementById("custSummaryMeta"),
        custSummarySeats: document.getElementById("custSummarySeats"),
        custSummaryRate: document.getElementById("custSummaryRate"),
        custSummaryCount: document.getElementById("custSummaryCount"),
        custSummaryTotal: document.getElementById("custSummaryTotal"),

        // Personal Bookings
        myBookingsTableBody: document.getElementById("myBookingsTableBody"),
        myBookingsBadgeCount: document.getElementById("myBookingsBadgeCount"),
        refreshMyBookingsBtn: document.getElementById("refreshMyBookingsBtn"),

        // E-Ticket Modal
        customerTicketModal: document.getElementById("customerTicketModal"),
        custModalRefCode: document.getElementById("custModalRefCode"),
        custModalMovie: document.getElementById("custModalMovie"),
        custModalCustomer: document.getElementById("custModalCustomer"),
        custModalTime: document.getElementById("custModalTime"),
        custModalSeats: document.getElementById("custModalSeats"),
        custModalTotal: document.getElementById("custModalTotal"),
        custModalCloseBtn: document.getElementById("custModalCloseBtn"),
        custModalPrintBtn: document.getElementById("custModalPrintBtn"),

        // Cancel Modal
        cancelConfirmModal: document.getElementById("cancelConfirmModal"),
        cancelTargetCode: document.getElementById("cancelTargetCode"),
        cancelTargetSeats: document.getElementById("cancelTargetSeats"),
        cancelProceedBtn: document.getElementById("cancelProceedBtn"),
        cancelAbortBtn: document.getElementById("cancelAbortBtn"),
        closeCancelModalBtn: document.getElementById("closeCancelModalBtn"),

        // Toasts
        custToastContainer: document.getElementById("custToastContainer")
    };

    // =========================================================================
    // 1. LIVE CLOCK
    // =========================================================================
    function startClock() {
        const update = () => {
            const now = new Date();
            if (dom.custLiveClock) {
                dom.custLiveClock.textContent = now.toLocaleTimeString('en-US', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                });
            }
        };
        update();
        setInterval(update, 1000);
    }

    // =========================================================================
    // 2. FETCH & RENDER SHOWS
    // =========================================================================
    async function fetchShows() {
        try {
            const res = await fetch("/api/shows");
            const data = await res.json();
            if (!data.success) return;

            state.shows = data.shows;
            populateShowDropdown();
            renderMoviesGrid();

            if (state.shows.length > 0) {
                const currentExists = state.shows.some(s => s.id === state.currentShowId);
                if (!currentExists) state.currentShowId = state.shows[0].id;
                selectShow(state.currentShowId);
            }
        } catch (err) {
            console.error("Error fetching shows:", err);
            showToast("Failed to load cinema shows. Please refresh.", "danger");
        }
    }

    function populateShowDropdown() {
        if (!dom.custShowSelect) return;
        dom.custShowSelect.innerHTML = "";
        state.shows.forEach(show => {
            const opt = document.createElement("option");
            opt.value = show.id;
            opt.textContent = `${show.title} (${show.time} - ${show.screen})`;
            if (show.id === state.currentShowId) opt.selected = true;
            dom.custShowSelect.appendChild(opt);
        });
    }

    function renderMoviesGrid() {
        if (!dom.custMoviesGrid) return;
        dom.custMoviesGrid.innerHTML = "";

        state.shows.forEach(show => {
            const booked = show.booked_seats || 0;
            const total = show.total_seats || 20;
            const available = show.available_seats !== undefined ? show.available_seats : (total - booked);
            const occupancyPct = Math.round((booked / total) * 100);

            const card = document.createElement("div");
            card.className = "movie-poster-card dashboard-card";
            if (show.id === state.currentShowId) card.classList.add("movie-card-selected");

            const posterSrc = show.poster_url || "/static/images/inception.jpg";

            card.innerHTML = `
                <div class="poster-image-box">
                    <img src="${posterSrc}" alt="${escapeHtml(show.title)}" class="poster-img" onerror="this.src='/static/images/inception.jpg'">
                    <span class="poster-badge genre-badge">${escapeHtml(show.genre || "Action")}</span>
                    <span class="poster-badge price-pill">₹${show.price.toFixed(2)}</span>
                </div>
                <div class="poster-info-box">
                    <h3 class="poster-title">${escapeHtml(show.title)}</h3>
                    <p class="poster-synopsis">${escapeHtml(show.description || "Theatrical cinema presentation.")}</p>
                    <div class="poster-meta-row">
                        <span><i class="fa-regular fa-clock"></i> ${escapeHtml(show.time)}</span>
                        <span><i class="fa-solid fa-desktop"></i> ${escapeHtml(show.screen)}</span>
                    </div>
                    <div class="poster-occupancy-row">
                        <div class="occ-label-row">
                            <span class="occ-text">Occupancy (${booked}/${total} Booked)</span>
                            <span class="occ-percent">${occupancyPct}%</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${occupancyPct}%;"></div>
                        </div>
                    </div>
                    <div class="poster-action-row">
                        <button type="button" class="btn btn-primary w-100 select-movie-btn" data-show-id="${show.id}">
                            <i class="fa-solid fa-couch"></i> Select & Book Seats
                        </button>
                    </div>
                </div>
            `;

            card.querySelector(".select-movie-btn").addEventListener("click", () => {
                selectShow(show.id);
                document.getElementById("seat-selection").scrollIntoView({ behavior: "smooth" });
            });

            dom.custMoviesGrid.appendChild(card);
        });
    }

    function selectShow(showId) {
        state.currentShowId = showId;
        state.selectedSeats.clear();

        if (dom.custShowSelect) dom.custShowSelect.value = showId;

        const selectedShow = state.shows.find(s => s.id === showId);
        if (selectedShow) {
            if (dom.custHallTitle) dom.custHallTitle.textContent = selectedShow.title;
            if (dom.custHallTime) dom.custHallTime.textContent = selectedShow.time;
            if (dom.custHallScreen) dom.custHallScreen.textContent = selectedShow.screen;
            if (dom.custHallPrice) dom.custHallPrice.textContent = `₹${selectedShow.price.toFixed(2)} / seat`;
            if (dom.custHallShowPoster) {
                dom.custHallShowPoster.src = selectedShow.poster_url || "/static/images/inception.jpg";
            }

            if (dom.custSummaryTitle) dom.custSummaryTitle.textContent = selectedShow.title;
            if (dom.custSummaryMeta) dom.custSummaryMeta.textContent = `${selectedShow.screen} • ${selectedShow.time}`;
            if (dom.custSummaryThumb) {
                dom.custSummaryThumb.src = selectedShow.poster_url || "/static/images/inception.jpg";
            }
            if (dom.custSummaryRate) dom.custSummaryRate.textContent = `₹${selectedShow.price.toFixed(2)} / seat`;
        }

        // Highlight selected movie card
        document.querySelectorAll(".movie-poster-card").forEach(c => {
            const btn = c.querySelector(".select-movie-btn");
            if (btn && parseInt(btn.dataset.showId) === showId) {
                c.classList.add("movie-card-selected");
            } else {
                c.classList.remove("movie-card-selected");
            }
        });

        loadShowSeats(showId);
        updateSelectionDock();
    }

    // =========================================================================
    // 3. FETCH & RENDER 20 SEATS (A1 to A20)
    // =========================================================================
    async function loadShowSeats(showId) {
        try {
            const res = await fetch(`/api/shows/${showId}/seats`);
            const data = await res.json();
            if (!data.success) return;

            state.currentSeats = data.seats;

            // Remove any selected seats that may have just been booked by another user
            const bookedSeats = new Set(data.seats.filter(s => s.status === 'booked').map(s => s.seat_number));
            let hadConflict = false;
            state.selectedSeats.forEach(s => {
                if (bookedSeats.has(s)) {
                    state.selectedSeats.delete(s);
                    hadConflict = true;
                }
            });

            if (hadConflict) {
                showToast("One of your selected seats was just reserved by another user.", "warning");
            }

            renderSeatsGrid();
            updateSelectionDock();
        } catch (err) {
            console.error("Error loading seats:", err);
        }
    }

    function renderSeatsGrid() {
        if (!dom.custSeatsGrid) return;
        dom.custSeatsGrid.innerHTML = "";

        state.currentSeats.forEach(seat => {
            const isBooked = seat.status === "booked";
            const isSelected = state.selectedSeats.has(seat.seat_number);

            const seatEl = document.createElement("div");
            seatEl.className = "seat-box";

            if (isBooked) {
                seatEl.classList.add("seat-booked");
                seatEl.title = `Seat ${seat.seat_number} - Already Reserved`;
            } else if (isSelected) {
                seatEl.classList.add("seat-selected");
                seatEl.title = `Seat ${seat.seat_number} - Selected by You (Click to deselect)`;
            } else {
                seatEl.classList.add("seat-available");
                seatEl.title = `Seat ${seat.seat_number} - Available (Click to select)`;
            }

            seatEl.innerHTML = `
                <i class="fa-solid fa-couch seat-icon"></i>
                <span class="seat-code">${seat.seat_number}</span>
            `;

            if (!isBooked) {
                seatEl.addEventListener("click", () => {
                    toggleSeatSelection(seat.seat_number);
                });
            }

            dom.custSeatsGrid.appendChild(seatEl);
        });
    }

    function toggleSeatSelection(seatNumber) {
        if (state.selectedSeats.has(seatNumber)) {
            state.selectedSeats.delete(seatNumber);
        } else {
            state.selectedSeats.add(seatNumber);
        }
        renderSeatsGrid();
        updateSelectionDock();
    }

    function quickSelectGroup(count) {
        state.selectedSeats.clear();
        const available = state.currentSeats.filter(s => s.status === "available");
        const toSelect = available.slice(0, count);

        toSelect.forEach(s => state.selectedSeats.add(s.seat_number));
        renderSeatsGrid();
        updateSelectionDock();

        if (toSelect.length < count) {
            showToast(`Only ${toSelect.length} available seats were found in this screening.`, "warning");
        } else {
            showToast(`Auto-selected ${toSelect.length} consecutive seats for your group.`, "info");
        }
    }

    // =========================================================================
    // 4. SELECTION DOCK & PRICING
    // =========================================================================
    function updateSelectionDock() {
        const count = state.selectedSeats.size;
        const currentShow = state.shows.find(s => s.id === state.currentShowId) || { price: 350.0 };
        const pricePerSeat = currentShow.price || 0;
        const total = count * pricePerSeat;

        if (dom.custDockCount) dom.custDockCount.textContent = `${count} Seat${count === 1 ? '' : 's'}`;
        if (dom.custDockTotal) dom.custDockTotal.textContent = `₹${total.toFixed(2)}`;

        // Render pills
        if (dom.custSelectedPills) {
            dom.custSelectedPills.innerHTML = "";
            if (count === 0) {
                dom.custSelectedPills.innerHTML = `<span class="no-selection-hint">Click available green seats above or use Quick Group Select.</span>`;
            } else {
                Array.from(state.selectedSeats).sort().forEach(seatNum => {
                    const pill = document.createElement("span");
                    pill.className = "selected-seat-pill";
                    pill.innerHTML = `${seatNum} <i class="fa-solid fa-xmark remove-pill-btn"></i>`;
                    pill.querySelector(".remove-pill-btn").addEventListener("click", (e) => {
                        e.stopPropagation();
                        state.selectedSeats.delete(seatNum);
                        renderSeatsGrid();
                        updateSelectionDock();
                    });
                    dom.custSelectedPills.appendChild(pill);
                });
            }
        }

        // Enable / Disable buttons
        if (dom.custProceedBtn) dom.custProceedBtn.disabled = count === 0;
        if (dom.custConfirmBtn) dom.custConfirmBtn.disabled = count === 0;

        // Update Checkout Summary
        if (dom.custSummarySeats) {
            dom.custSummarySeats.textContent = count > 0 ? Array.from(state.selectedSeats).sort().join(", ") : "None";
        }
        if (dom.custSummaryCount) dom.custSummaryCount.textContent = count;
        if (dom.custSummaryTotal) dom.custSummaryTotal.textContent = `₹${total.toFixed(2)}`;

        // Update Badge
        if (dom.custBookingTypeBadge) {
            if (count === 0) {
                dom.custBookingTypeBadge.textContent = "Select Seats Above";
                dom.custBookingTypeBadge.className = "badge badge-group";
            } else if (count === 1) {
                dom.custBookingTypeBadge.textContent = "Single Seat Reservation";
                dom.custBookingTypeBadge.className = "badge badge-group";
            } else {
                dom.custBookingTypeBadge.textContent = `Group Booking (${count} Seats)`;
                dom.custBookingTypeBadge.className = "badge badge-group badge-highlight";
            }
        }
    }

    // =========================================================================
    // 5. CUSTOMER BOOKING SUBMISSION (/api/customer/book)
    // =========================================================================
    if (dom.custBookingForm) {
        dom.custBookingForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const seatsArray = Array.from(state.selectedSeats).sort();
            if (seatsArray.length === 0) {
                showToast("Please select at least one seat to book.", "warning");
                return;
            }

            const name = dom.custName.value.trim() || customer.fullName || "Customer";
            const phone = dom.custPhone.value.trim() || customer.phone || "";
            const email = dom.custEmail.value.trim() || customer.email || "";

            if (!phone || phone.length < 8) {
                showToast("Please enter a valid mobile number for ticket confirmation.", "warning");
                dom.custPhone.focus();
                return;
            }

            // Disable button during network request
            dom.custConfirmBtn.disabled = true;
            dom.custConfirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Securing Seats with Mutex...`;

            try {
                const response = await fetch("/api/customer/book", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        show_id: state.currentShowId,
                        seats: seatsArray,
                        customer_name: name,
                        customer_phone: phone,
                        customer_email: email,
                        use_mutex: true
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showToast(`Booking ${data.booking_code} Confirmed! Mutual exclusion lock secured.`, "success");

                    // Open E-Ticket modal
                    const currentShow = state.shows.find(s => s.id === state.currentShowId);
                    openTicketModal({
                        booking_code: data.booking_code,
                        show_title: currentShow ? currentShow.title : "CinemaPro Feature",
                        customer_name: name,
                        seats: seatsArray,
                        total_amount: data.total_amount || (seatsArray.length * (currentShow ? currentShow.price : 350))
                    });

                    // Clear selections
                    state.selectedSeats.clear();
                    updateSelectionDock();

                    // Refresh seats & my bookings
                    await loadShowSeats(state.currentShowId);
                    await fetchMyBookings();
                } else {
                    showToast(data.message || "Booking rejected. Seats may have been taken.", "danger");
                    await loadShowSeats(state.currentShowId);
                }
            } catch (err) {
                console.error("Booking submission error:", err);
                showToast("Network error during booking. Please try again.", "danger");
            } finally {
                dom.custConfirmBtn.disabled = state.selectedSeats.size === 0;
                dom.custConfirmBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Confirm & Book Tickets (₹ INR)`;
            }
        });
    }

    // =========================================================================
    // 6. PERSONAL BOOKING HISTORY & CANCELLATION (/api/customer/my-bookings)
    // =========================================================================
    async function fetchMyBookings() {
        if (!dom.myBookingsTableBody) return;

        try {
            const res = await fetch("/api/customer/my-bookings");
            const data = await res.json();

            if (!data.success) {
                dom.myBookingsTableBody.innerHTML = `
                    <tr><td colspan="9" style="text-align: center; padding: 20px; color: var(--status-danger);">Failed to load personal bookings.</td></tr>
                `;
                return;
            }

            state.myBookings = data.bookings || [];

            if (dom.myBookingsBadgeCount) {
                dom.myBookingsBadgeCount.textContent = state.myBookings.length;
            }

            renderMyBookingsTable();
        } catch (err) {
            console.error("Error fetching customer bookings:", err);
            dom.myBookingsTableBody.innerHTML = `
                <tr><td colspan="9" style="text-align: center; padding: 20px; color: var(--status-danger);">Error retrieving booking records.</td></tr>
            `;
        }
    }

    function renderMyBookingsTable() {
        if (!dom.myBookingsTableBody) return;

        if (state.myBookings.length === 0) {
            dom.myBookingsTableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <i class="fa-regular fa-folder-open" style="font-size: 28px; margin-bottom: 10px; display: block; opacity: 0.6;"></i>
                        <p style="margin: 0; font-size: 14px;">No personal bookings found under your customer account yet.</p>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">Select a movie and book seats above to generate your first E-Ticket!</p>
                    </td>
                </tr>
            `;
            return;
        }

        dom.myBookingsTableBody.innerHTML = "";

        state.myBookings.forEach(b => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td><code style="color: var(--primary-blue); font-weight: 700;">${escapeHtml(b.booking_code)}</code></td>
                <td>
                    <strong style="color: #fff;">${escapeHtml(b.show_title || 'Cinema Screening')}</strong>
                </td>
                <td>
                    <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(b.screen || 'Screen 1')} &bull; ${escapeHtml(b.show_time || '--')}</span>
                </td>
                <td>
                    <span class="seat-badge-list" style="color: var(--primary-purple); font-weight: 700;">${escapeHtml(b.seats_list)}</span>
                </td>
                <td>
                    <span class="badge ${b.seat_count > 1 ? 'badge-group' : 'badge-single'}">${b.seat_count} Seat${b.seat_count > 1 ? 's' : ''}</span>
                </td>
                <td>
                    <strong style="color: var(--status-success);">₹${parseFloat(b.total_amount).toFixed(2)}</strong>
                </td>
                <td>
                    <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(b.booking_time || '--')}</span>
                </td>
                <td>
                    <span class="status-pill status-confirmed"><i class="fa-solid fa-circle-check"></i> Confirmed</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn btn-outline btn-sm view-ticket-btn" style="margin-right: 6px;" title="Print E-Ticket Receipt">
                        <i class="fa-solid fa-receipt"></i> E-Ticket
                    </button>
                    <button type="button" class="btn btn-outline btn-sm btn-danger cancel-booking-btn" title="Cancel this reservation and release seats">
                        <i class="fa-solid fa-trash-can"></i> Cancel
                    </button>
                </td>
            `;

            // View Ticket handler
            tr.querySelector(".view-ticket-btn").addEventListener("click", () => {
                openTicketModal({
                    booking_code: b.booking_code,
                    show_title: b.show_title,
                    customer_name: b.customer_name,
                    seats: b.seats_list.split(", "),
                    total_amount: b.total_amount
                });
            });

            // Cancel Booking handler
            tr.querySelector(".cancel-booking-btn").addEventListener("click", () => {
                promptCancelBooking(b);
            });

            dom.myBookingsTableBody.appendChild(tr);
        });
    }

    function promptCancelBooking(booking) {
        state.pendingCancelBookingId = booking.id;
        if (dom.cancelTargetCode) dom.cancelTargetCode.textContent = booking.booking_code;
        if (dom.cancelTargetSeats) dom.cancelTargetSeats.textContent = booking.seats_list;
        if (dom.cancelConfirmModal) dom.cancelConfirmModal.style.display = "flex";
    }

    // Modal cancellation proceed
    if (dom.cancelProceedBtn) {
        dom.cancelProceedBtn.addEventListener("click", async () => {
            if (!state.pendingCancelBookingId) return;

            dom.cancelProceedBtn.disabled = true;
            dom.cancelProceedBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...`;

            try {
                const res = await fetch(`/api/customer/bookings/${state.pendingCancelBookingId}`, {
                    method: "DELETE"
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    showToast(data.message || "Booking successfully cancelled. Seats released.", "success");
                    if (dom.cancelConfirmModal) dom.cancelConfirmModal.style.display = "none";
                    state.pendingCancelBookingId = null;

                    // Refresh both bookings and seat map
                    await fetchMyBookings();
                    await loadShowSeats(state.currentShowId);
                } else {
                    showToast(data.message || "Failed to cancel booking.", "danger");
                }
            } catch (err) {
                console.error("Cancellation error:", err);
                showToast("Network error cancelling reservation.", "danger");
            } finally {
                dom.cancelProceedBtn.disabled = false;
                dom.cancelProceedBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Yes, Cancel Booking`;
            }
        });
    }

    if (dom.cancelAbortBtn) {
        dom.cancelAbortBtn.addEventListener("click", () => {
            if (dom.cancelConfirmModal) dom.cancelConfirmModal.style.display = "none";
            state.pendingCancelBookingId = null;
        });
    }
    if (dom.closeCancelModalBtn) {
        dom.closeCancelModalBtn.addEventListener("click", () => {
            if (dom.cancelConfirmModal) dom.cancelConfirmModal.style.display = "none";
            state.pendingCancelBookingId = null;
        });
    }

    if (dom.refreshMyBookingsBtn) {
        dom.refreshMyBookingsBtn.addEventListener("click", () => {
            fetchMyBookings();
            showToast("Personal bookings refreshed.", "info");
        });
    }

    // =========================================================================
    // 7. DIGITAL E-TICKET RECEIPT MODAL
    // =========================================================================
    function openTicketModal(ticketData) {
        if (!dom.customerTicketModal) return;

        if (dom.custModalRefCode) dom.custModalRefCode.textContent = ticketData.booking_code;
        if (dom.custModalMovie) dom.custModalMovie.textContent = ticketData.show_title;
        if (dom.custModalCustomer) dom.custModalCustomer.textContent = ticketData.customer_name;
        const currentShow = state.shows.find(s => s.id === state.currentShowId);
        if (dom.custModalTime) {
            dom.custModalTime.textContent = currentShow ? `${currentShow.time} • ${currentShow.screen}` : "Theatrical Screening";
        }
        if (dom.custModalSeats) dom.custModalSeats.textContent = Array.isArray(ticketData.seats) ? ticketData.seats.join(", ") : ticketData.seats;
        if (dom.custModalTotal) dom.custModalTotal.textContent = `₹${parseFloat(ticketData.total_amount).toFixed(2)}`;

        dom.customerTicketModal.style.display = "flex";
    }

    if (dom.custModalCloseBtn) {
        dom.custModalCloseBtn.addEventListener("click", () => {
            dom.customerTicketModal.style.display = "none";
        });
    }

    if (dom.custModalPrintBtn) {
        dom.custModalPrintBtn.addEventListener("click", () => {
            window.print();
        });
    }

    // Close modals on backdrop click
    window.addEventListener("click", (e) => {
        if (e.target === dom.customerTicketModal) dom.customerTicketModal.style.display = "none";
        if (e.target === dom.cancelConfirmModal) dom.cancelConfirmModal.style.display = "none";
    });

    // =========================================================================
    // 8. EVENT LISTENERS
    // =========================================================================
    if (dom.custShowSelect) {
        dom.custShowSelect.addEventListener("change", (e) => {
            selectShow(parseInt(e.target.value));
        });
    }

    document.querySelectorAll(".cust-quick-select").forEach(btn => {
        btn.addEventListener("click", () => {
            const count = parseInt(btn.dataset.count);
            quickSelectGroup(count);
        });
    });

    if (dom.custClearSeatsBtn) {
        dom.custClearSeatsBtn.addEventListener("click", () => {
            state.selectedSeats.clear();
            renderSeatsGrid();
            updateSelectionDock();
            showToast("Seat selections cleared.", "info");
        });
    }

    if (dom.custProceedBtn) {
        dom.custProceedBtn.addEventListener("click", () => {
            document.getElementById("customer-checkout").scrollIntoView({ behavior: "smooth" });
            if (dom.custName) dom.custName.focus();
        });
    }

    // =========================================================================
    // 9. TOAST NOTIFICATIONS & UTILITIES
    // =========================================================================
    function showToast(message, type = "info", duration = 4000) {
        if (!dom.custToastContainer) return;
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;

        let icon = "fa-circle-info";
        if (type === "success") icon = "fa-circle-check text-success";
        else if (type === "danger") icon = "fa-circle-xmark text-danger";
        else if (type === "warning") icon = "fa-triangle-exclamation text-warning";

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${escapeHtml(message)}</span>
        `;

        dom.custToastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(100%)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================================
    // 10. INITIALIZATION & LIVE SYNCHRONIZATION
    // =========================================================================
    startClock();
    fetchShows();
    fetchMyBookings();

    // Poll seat updates every 3 seconds so the layout is continuously synchronized
    setInterval(() => {
        if (state.currentShowId) {
            loadShowSeats(state.currentShowId);
        }
    }, 3000);
});

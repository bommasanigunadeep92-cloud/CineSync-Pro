/**
 * CinemaPro – Online Customer Ticket Booking Portal
 * Client State, Interactive Seating, Real-time Reservation & E-Ticket Management
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // STATE
    // =========================================================================
    const state = {
        currentShowId: 1,
        shows: [],
        currentSeats: [],
        selectedSeats: new Set()
    };

    // =========================================================================
    // DOM ELEMENTS
    // =========================================================================
    const dom = {
        // Clock
        custLiveClock: document.getElementById("custLiveClock"),

        // Movies & Shows
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

        // Checkout & Form
        custBookingForm: document.getElementById("custBookingForm"),
        custName: document.getElementById("custName"),
        custPhone: document.getElementById("custPhone"),
        custEmail: document.getElementById("custEmail"),
        custConfirmBtn: document.getElementById("custConfirmBtn"),
        custBookingTypeBadge: document.getElementById("custBookingTypeBadge"),

        // Order Summary
        custSummaryThumb: document.getElementById("custSummaryThumb"),
        custSummaryTitle: document.getElementById("custSummaryTitle"),
        custSummaryMeta: document.getElementById("custSummaryMeta"),
        custSummarySeats: document.getElementById("custSummarySeats"),
        custSummaryRate: document.getElementById("custSummaryRate"),
        custSummaryCount: document.getElementById("custSummaryCount"),
        custSummaryTotal: document.getElementById("custSummaryTotal"),

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

        // Find Ticket Modal
        openFindTicketBtn: document.getElementById("openFindTicketBtn"),
        findTicketModal: document.getElementById("findTicketModal"),
        closeFindTicketBtn: document.getElementById("closeFindTicketBtn"),
        findTicketInput: document.getElementById("findTicketInput"),
        searchTicketBtn: document.getElementById("searchTicketBtn"),
        foundTicketsResults: document.getElementById("foundTicketsResults"),

        // Toasts
        custToastContainer: document.getElementById("custToastContainer")
    };

    // =========================================================================
    // 1. LIVE CLOCK
    // =========================================================================
    function startClock() {
        const update = () => {
            const now = new Date();
            dom.custLiveClock.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        };
        update();
        setInterval(update, 1000);
    }

    // =========================================================================
    // 2. FETCH & RENDER MOVIES & SHOWS
    // =========================================================================
    async function fetchShows() {
        try {
            const res = await fetch("/api/shows");
            const data = await res.json();
            if (!data.success) return;

            state.shows = data.shows;
            populateShowDropdown();
            renderMoviesGrid();

            // Load seats for current active show
            await loadShowSeats(state.currentShowId);
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
            dom.custShowSelect.appendChild(opt);
        });
        dom.custShowSelect.value = state.currentShowId;
    }

    function renderMoviesGrid() {
        if (!dom.custMoviesGrid) return;
        dom.custMoviesGrid.innerHTML = "";

        state.shows.forEach(show => {
            const booked = show.booked_seats || 0;
            const total = show.total_seats || 20;
            const available = total - booked;
            const pct = Math.round((booked / total) * 100);

            const card = document.createElement("div");
            card.className = "showcase-movie-card";
            card.innerHTML = `
                <div class="showcase-poster-frame">
                    <img src="${show.poster_url || '/static/images/fallback_poster.svg'}" 
                         alt="${escapeHtml(show.title)}" 
                         class="showcase-poster-img"
                         onerror="this.onerror=null; this.src='/static/images/fallback_poster.svg';">
                    <span class="showcase-badge-overlay"><i class="fa-solid fa-film"></i> ${show.genre}</span>
                    <span class="showcase-price-overlay">₹${show.price.toFixed(2)}</span>
                </div>
                <div class="showcase-card-body">
                    <h4 class="showcase-movie-title">${show.title}</h4>
                    <p class="showcase-movie-synopsis">${escapeHtml(show.description || 'Critically acclaimed theatrical screening presented in high definition surround sound.')}</p>
                    <div class="show-occupancy-bar-wrapper" style="margin-top: 4px;">
                        <div class="occupancy-labels" style="font-size: 11px;">
                            <span>${available} seats left (${booked}/${total} booked)</span>
                            <span style="color: ${pct > 80 ? 'var(--status-danger)' : 'var(--status-success)'};">${pct}% Full</span>
                        </div>
                        <div class="mini-progress-bar">
                            <div class="mini-progress-fill" style="width: ${pct}%; background: ${pct > 80 ? 'var(--status-danger)' : 'var(--primary-indigo)'};"></div>
                        </div>
                    </div>
                    <div class="showcase-movie-footer">
                        <span class="showcase-meta"><i class="fa-regular fa-clock"></i> ${show.time} | ${show.screen}</span>
                        <button class="btn btn-primary btn-sm cust-book-shortcut-btn" data-show-id="${show.id}">
                            <i class="fa-solid fa-couch"></i> Book Seats
                        </button>
                    </div>
                </div>
            `;

            card.querySelector(".cust-book-shortcut-btn").addEventListener("click", () => {
                selectShow(show.id);
                document.getElementById("seat-selection").scrollIntoView({ behavior: "smooth" });
                showToast(`Selected "${show.title}". Choose your seats below!`, "info");
            });

            dom.custMoviesGrid.appendChild(card);
        });
    }

    function selectShow(showId) {
        state.currentShowId = showId;
        dom.custShowSelect.value = showId;
        state.selectedSeats.clear();
        loadShowSeats(showId);
    }

    // =========================================================================
    // 3. LOAD & RENDER SEATS
    // =========================================================================
    async function loadShowSeats(showId) {
        try {
            state.currentShowId = showId;
            const res = await fetch(`/api/shows/${showId}/seats`);
            const data = await res.json();
            if (!data.success) return;

            const show = data.show;
            state.currentSeats = data.seats;

            // Update Hall Header
            dom.custHallTitle.textContent = show.title;
            dom.custHallTime.textContent = show.time;
            dom.custHallScreen.textContent = show.screen;
            dom.custHallPrice.textContent = `₹${show.price.toFixed(2)} / seat`;
            if (dom.custHallShowPoster) {
                dom.custHallShowPoster.src = show.poster_url || '/static/images/fallback_poster.svg';
            }

            // Update Summary Card
            if (dom.custSummaryThumb) {
                dom.custSummaryThumb.src = show.poster_url || '/static/images/fallback_poster.svg';
            }
            dom.custSummaryTitle.textContent = show.title;
            dom.custSummaryMeta.textContent = `${show.screen} • ${show.time}`;
            dom.custSummaryRate.textContent = `₹${show.price.toFixed(2)} / seat`;

            // Filter out seats that are already booked
            const validSelected = new Set();
            state.selectedSeats.forEach(seatCode => {
                const sObj = state.currentSeats.find(s => s.seat_number === seatCode);
                if (sObj && sObj.status === 'available') {
                    validSelected.add(seatCode);
                }
            });
            state.selectedSeats = validSelected;

            renderSeatsGrid();
            updateSelectionDock();
        } catch (err) {
            console.error("Error loading show seats:", err);
        }
    }

    function renderSeatsGrid() {
        dom.custSeatsGrid.innerHTML = "";

        state.currentSeats.forEach(seat => {
            const seatEl = document.createElement("div");
            const isSelected = state.selectedSeats.has(seat.seat_number);
            const isBooked = seat.status === "booked";

            let statusClass = "seat-available";
            if (isBooked) statusClass = "seat-booked";
            else if (isSelected) statusClass = "seat-selected";

            seatEl.className = `seat-item ${statusClass}`;
            seatEl.dataset.seatNumber = seat.seat_number;
            seatEl.innerHTML = `
                <i class="fa-solid fa-couch seat-icon"></i>
                <span class="seat-code">${seat.seat_number}</span>
            `;

            if (isBooked) {
                seatEl.title = `Seat ${seat.seat_number} (BOOKED)\nReserved by another customer`;
            } else {
                seatEl.title = `Seat ${seat.seat_number} (AVAILABLE)\nClick to select for booking`;
            }

            seatEl.addEventListener("click", () => {
                if (isBooked) {
                    showToast(`Seat ${seat.seat_number} is already reserved. Please choose another seat.`, "warning");
                    return;
                }
                toggleSeatSelection(seat.seat_number);
            });

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

    // Quick Group Selection
    function quickSelectGroup(count) {
        const availableSeats = state.currentSeats
            .filter(s => s.status === "available")
            .map(s => s.seat_number);

        if (availableSeats.length < count) {
            showToast(`Only ${availableSeats.length} seats available for this show. Cannot select group of ${count}.`, "warning");
            return;
        }

        state.selectedSeats.clear();
        for (let i = 0; i < count; i++) {
            state.selectedSeats.add(availableSeats[i]);
        }

        renderSeatsGrid();
        updateSelectionDock();
        showToast(`Auto-selected group of ${count} seats: ${Array.from(state.selectedSeats).join(", ")}`, "info");
    }

    // Update Floating Selection Dock & Order Summary
    function updateSelectionDock() {
        const seatsArr = Array.from(state.selectedSeats).sort((a, b) => {
            return parseInt(a.slice(1)) - parseInt(b.slice(1));
        });

        const show = state.shows.find(s => s.id == state.currentShowId);
        const pricePerSeat = show ? show.price : 350.0;
        const totalAmount = seatsArr.length * pricePerSeat;

        // Render Pills
        dom.custSelectedPills.innerHTML = "";
        if (seatsArr.length === 0) {
            dom.custSelectedPills.innerHTML = `<span class="no-selection-hint">Click available green seats above or use Quick Group Select.</span>`;
            dom.custProceedBtn.disabled = true;
            dom.custConfirmBtn.disabled = true;
            dom.custBookingTypeBadge.textContent = "Select Seats Above";
        } else {
            dom.custProceedBtn.disabled = false;
            dom.custConfirmBtn.disabled = false;
            dom.custBookingTypeBadge.textContent = seatsArr.length > 1 ? `Group Booking (${seatsArr.length} Seats)` : "Individual Booking (1 Seat)";

            seatsArr.forEach(seat => {
                const pill = document.createElement("span");
                pill.className = "seat-pill";
                pill.innerHTML = `${seat} <i class="fa-solid fa-xmark seat-pill-remove" title="Deselect"></i>`;
                pill.querySelector(".seat-pill-remove").addEventListener("click", (e) => {
                    e.stopPropagation();
                    state.selectedSeats.delete(seat);
                    renderSeatsGrid();
                    updateSelectionDock();
                });
                dom.custSelectedPills.appendChild(pill);
            });
        }

        // Numbers
        dom.custDockCount.textContent = `${seatsArr.length} Seat${seatsArr.length === 1 ? '' : 's'}`;
        dom.custDockTotal.textContent = `₹${totalAmount.toFixed(2)}`;

        // Summary Card
        dom.custSummarySeats.textContent = seatsArr.length > 0 ? seatsArr.join(", ") : "None";
        dom.custSummaryCount.textContent = seatsArr.length;
        dom.custSummaryTotal.textContent = `₹${totalAmount.toFixed(2)}`;
    }

    // =========================================================================
    // 4. CHECKOUT FORM SUBMISSION (WITH MUTEX BACKEND)
    // =========================================================================
    dom.custBookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const seats = Array.from(state.selectedSeats);
        if (seats.length === 0) {
            showToast("Please select at least one seat from the seating chart.", "warning");
            document.getElementById("seat-selection").scrollIntoView({ behavior: "smooth" });
            return;
        }

        const customerName = dom.custName.value.trim();
        const customerPhone = dom.custPhone.value.trim();
        const customerEmail = dom.custEmail.value.trim();

        if (customerName.length < 2) {
            showToast("Please enter your full name (at least 2 characters).", "warning");
            dom.custName.focus();
            return;
        }

        const phoneDigits = customerPhone.replace(/\D/g, "");
        if (phoneDigits.length < 8 || phoneDigits.length > 15) {
            showToast("Please provide a valid contact mobile number (8 to 15 digits).", "warning");
            dom.custPhone.focus();
            return;
        }

        const payload = {
            show_id: state.currentShowId,
            seats: seats,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_email: customerEmail,
            use_mutex: true
        };

        dom.custConfirmBtn.disabled = true;
        dom.custConfirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Securing Seats with Mutex...`;

        try {
            const res = await fetch("/api/book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.success) {
                showToast("Booking confirmed! Your seats are successfully reserved.", "success");
                openTicketModal(data);

                // Reset form & selections
                state.selectedSeats.clear();
                dom.custBookingForm.reset();

                // Refresh shows and seats
                await fetchShows();
            } else {
                showToast(data.message || "Failed to book seats. Please check seat availability.", "danger");
                // Refresh seats to show which seat was contested
                await loadShowSeats(state.currentShowId);
            }
        } catch (err) {
            showToast("Network error while submitting your reservation.", "danger");
        } finally {
            dom.custConfirmBtn.disabled = false;
            dom.custConfirmBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Confirm & Book Tickets`;
        }
    });

    // =========================================================================
    // 5. TICKET RECEIPT MODAL
    // =========================================================================
    function openTicketModal(data) {
        dom.custModalRefCode.textContent = data.booking_code || "TKT-CONFIRMED";
        dom.custModalMovie.textContent = data.show_title || dom.custHallTitle.textContent;
        dom.custModalCustomer.textContent = data.customer_name || dom.custName.value || "Valued Customer";
        dom.custModalTime.textContent = `${dom.custHallTime.textContent} • ${dom.custHallScreen.textContent}`;
        dom.custModalSeats.textContent = Array.isArray(data.seats) ? data.seats.join(", ") : data.seats;
        dom.custModalTotal.textContent = `₹${parseFloat(data.total_amount || 0).toFixed(2)}`;

        dom.customerTicketModal.style.display = "flex";
    }

    dom.custModalCloseBtn.addEventListener("click", () => {
        dom.customerTicketModal.style.display = "none";
    });

    dom.custModalPrintBtn.addEventListener("click", () => {
        window.print();
    });

    // =========================================================================
    // 6. FIND MY TICKET SEARCH MODAL
    // =========================================================================
    dom.openFindTicketBtn.addEventListener("click", () => {
        dom.findTicketModal.style.display = "flex";
        dom.findTicketInput.focus();
    });

    dom.closeFindTicketBtn.addEventListener("click", () => {
        dom.findTicketModal.style.display = "none";
    });

    dom.searchTicketBtn.addEventListener("click", async () => {
        const query = dom.findTicketInput.value.trim();
        if (!query) {
            showToast("Please enter a mobile number or booking reference code.", "warning");
            return;
        }

        dom.searchTicketBtn.disabled = true;
        dom.searchTicketBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Searching...`;
        dom.foundTicketsResults.innerHTML = "";

        try {
            const res = await fetch(`/api/customer/tickets?query=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (data.success && data.tickets.length > 0) {
                data.tickets.forEach(t => {
                    const item = document.createElement("div");
                    item.className = "found-ticket-card";
                    item.style.padding = "14px";
                    item.style.background = "var(--bg-card-subtle)";
                    item.style.border = "1px solid var(--border-subtle)";
                    item.style.borderRadius = "var(--radius-md)";
                    item.style.marginBottom = "10px";
                    item.style.display = "flex";
                    item.style.justifyContent = "space-between";
                    item.style.alignItems = "center";

                    item.innerHTML = `
                        <div>
                            <div style="font-weight: 700; color: #fff;">${t.show_title}</div>
                            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                Ref: <code style="color: var(--primary-blue);">${t.booking_code}</code> &bull; Seats: <strong style="color: var(--primary-purple);">${t.seats_list}</strong>
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                                Customer: ${t.customer_name} &bull; Paid: <strong style="color: var(--status-success);">₹${t.total_amount.toFixed(2)}</strong>
                            </div>
                        </div>
                        <button type="button" class="btn btn-primary btn-sm view-found-ticket-btn">
                            <i class="fa-solid fa-receipt"></i> View Ticket
                        </button>
                    `;

                    item.querySelector(".view-found-ticket-btn").addEventListener("click", () => {
                        dom.findTicketModal.style.display = "none";
                        openTicketModal({
                            booking_code: t.booking_code,
                            show_title: t.show_title,
                            customer_name: t.customer_name,
                            seats: t.seats_list.split(", "),
                            total_amount: t.total_amount
                        });
                    });

                    dom.foundTicketsResults.appendChild(item);
                });
            } else {
                dom.foundTicketsResults.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                        <i class="fa-regular fa-folder-open" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <p>No confirmed reservations found for "${escapeHtml(query)}".</p>
                    </div>
                `;
            }
        } catch (err) {
            showToast("Error retrieving tickets.", "danger");
        } finally {
            dom.searchTicketBtn.disabled = false;
            dom.searchTicketBtn.innerHTML = `<i class="fa-solid fa-search"></i> Search Tickets`;
        }
    });

    // Close modals on outside click
    window.addEventListener("click", (e) => {
        if (e.target === dom.customerTicketModal) dom.customerTicketModal.style.display = "none";
        if (e.target === dom.findTicketModal) dom.findTicketModal.style.display = "none";
    });

    // =========================================================================
    // 7. EVENT LISTENERS
    // =========================================================================
    dom.custShowSelect.addEventListener("change", (e) => {
        selectShow(parseInt(e.target.value));
    });

    document.querySelectorAll(".cust-quick-select").forEach(btn => {
        btn.addEventListener("click", () => {
            const count = parseInt(btn.dataset.count);
            quickSelectGroup(count);
        });
    });

    dom.custClearSeatsBtn.addEventListener("click", () => {
        state.selectedSeats.clear();
        renderSeatsGrid();
        updateSelectionDock();
        showToast("Seat selections cleared.", "info");
    });

    dom.custProceedBtn.addEventListener("click", () => {
        document.getElementById("customer-checkout").scrollIntoView({ behavior: "smooth" });
        dom.custName.focus();
    });

    // =========================================================================
    // 8. TOAST NOTIFICATIONS & UTILITIES
    // =========================================================================
    function showToast(message, type = "info", duration = 4000) {
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
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================================
    // 9. INITIALIZATION & LIVE POLLING
    // =========================================================================
    startClock();
    fetchShows();

    // Poll seat updates every 2.5 seconds so customers see newly booked seats live
    setInterval(() => {
        if (state.currentShowId) {
            loadShowSeats(state.currentShowId);
        }
    }, 2500);
});

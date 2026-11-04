/**
 * CinemaPro – Cinema Group Ticket Booking System Dashboard
 * Frontend Architecture, State Management, Real-time Visualizer & Concurrency Lab
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================
    const state = {
        currentShowId: 1,
        shows: [],
        currentSeats: [],
        selectedSeats: new Set(),
        concurrencyLogs: [],
        autoScrollLogs: true,
        notificationAlerts: [],
        charts: {
            occupancy: null,
            ratio: null
        }
    };

    // =========================================================================
    // DOM ELEMENTS
    // =========================================================================
    const dom = {
        // Clock
        liveClockTime: document.getElementById("liveClockTime"),
        liveClockDate: document.getElementById("liveClockDate"),

        // Stats
        statTotalBookings: document.getElementById("statTotalBookings"),
        statBookedSeats: document.getElementById("statBookedSeats"),
        occupancyRateBadge: document.getElementById("occupancyRateBadge"),
        occupancyProgressBar: document.getElementById("occupancyProgressBar"),
        statAvailableSeats: document.getElementById("statAvailableSeats"),
        statGroupBookings: document.getElementById("statGroupBookings"),

        // Seats & Hall
        showSelectDropdown: document.getElementById("showSelectDropdown"),
        currentShowTitle: document.getElementById("currentShowTitle"),
        currentShowTime: document.getElementById("currentShowTime"),
        currentShowPrice: document.getElementById("currentShowPrice"),
        currentShowPoster: document.getElementById("currentShowPoster"),
        seatsGrid: document.getElementById("seatsGrid"),
        selectedSeatsPills: document.getElementById("selectedSeatsPills"),
        dockSelectedCount: document.getElementById("dockSelectedCount"),
        dockTotalPrice: document.getElementById("dockTotalPrice"),
        proceedToBookBtn: document.getElementById("proceedToBookBtn"),
        clearSelectionBtn: document.getElementById("clearSelectionBtn"),
        resetShowSeatsBtn: document.getElementById("resetShowSeatsBtn"),

        // Group Booking Form
        ticketBookingForm: document.getElementById("ticketBookingForm"),
        bookingCustomerName: document.getElementById("bookingCustomerName"),
        bookingPhone: document.getElementById("bookingPhone"),
        bookingEmail: document.getElementById("bookingEmail"),
        bookingShowSelect: document.getElementById("bookingShowSelect"),
        bookingSeatsInput: document.getElementById("bookingSeatsInput"),
        bookingSeatsCount: document.getElementById("bookingSeatsCount"),
        formTotalAmount: document.getElementById("formTotalAmount"),
        formBookingTypeBadge: document.getElementById("formBookingTypeBadge"),

        // Concurrency Lab & Meters
        sidebarMutexBadge: document.getElementById("sidebarMutexBadge"),
        sidebarMutexStatus: document.getElementById("sidebarMutexStatus"),
        sidebarSemaphoreStatus: document.getElementById("sidebarSemaphoreStatus"),
        meterMutexStatus: document.getElementById("meterMutexStatus"),
        meterSemaphoreSlots: document.getElementById("meterSemaphoreSlots"),
        meterConflictsBlocked: document.getElementById("meterConflictsBlocked"),
        meterRaceCollisions: document.getElementById("meterRaceCollisions"),
        semaphoreDots: document.getElementById("semaphoreDots"),

        // Stress Simulator
        simShowSelect: document.getElementById("simShowSelect"),
        simSeatsInput: document.getElementById("simSeatsInput"),
        simThreadsCount: document.getElementById("simThreadsCount"),
        threadsCountVal: document.getElementById("threadsCountVal"),
        simMutexToggle: document.getElementById("simMutexToggle"),
        simMutexLabel: document.getElementById("simMutexLabel"),
        runSimulationBtn: document.getElementById("runSimulationBtn"),
        simStatusMsg: document.getElementById("simStatusMsg"),
        simResultsBanner: document.getElementById("simResultsBanner"),
        resThreadsLaunched: document.getElementById("resThreadsLaunched"),
        resSuccessful: document.getElementById("resSuccessful"),
        resConflicts: document.getElementById("resConflicts"),
        resCollisions: document.getElementById("resCollisions"),
        resTimeMs: document.getElementById("resTimeMs"),

        // Presets
        presetSafe5: document.getElementById("presetSafe5"),
        presetHazard5: document.getElementById("presetHazard5"),
        presetSafe10: document.getElementById("presetSafe10"),

        // Logs
        syncLogsContainer: document.getElementById("syncLogsContainer"),
        clearLogsBtn: document.getElementById("clearLogsBtn"),
        toggleLogAutoScroll: document.getElementById("toggleLogAutoScroll"),

        // Shows & Bookings
        showsCardsGrid: document.getElementById("showsCardsGrid"),
        moviesShowcaseGrid: document.getElementById("moviesShowcaseGrid"),
        bookingsTableBody: document.getElementById("bookingsTableBody"),
        bookingSearchInput: document.getElementById("bookingSearchInput"),
        refreshAnalyticsBtn: document.getElementById("refreshAnalyticsBtn"),

        // Settings
        semaphoreLimitInput: document.getElementById("semaphoreLimitInput"),
        saveSemaphoreLimitBtn: document.getElementById("saveSemaphoreLimitBtn"),
        resetSystemBtn: document.getElementById("resetSystemBtn"),

        // Notifications & Modal
        notificationBtn: document.getElementById("notificationBtn"),
        notificationDropdown: document.getElementById("notificationDropdown"),
        notificationCount: document.getElementById("notificationCount"),
        notificationHeaderCount: document.getElementById("notificationHeaderCount"),
        notificationList: document.getElementById("notificationList"),

        receiptModal: document.getElementById("receiptModal"),
        modalTicketCode: document.getElementById("modalTicketCode"),
        modalMovieTitle: document.getElementById("modalMovieTitle"),
        modalCustomerName: document.getElementById("modalCustomerName"),
        modalSeatsList: document.getElementById("modalSeatsList"),
        modalTotalPaid: document.getElementById("modalTotalPaid"),
        modalSyncMode: document.getElementById("modalSyncMode"),
        closeReceiptModalBtn: document.getElementById("closeReceiptModalBtn"),
        dismissReceiptBtn: document.getElementById("dismissReceiptBtn"),
        printReceiptBtn: document.getElementById("printReceiptBtn"),
        toastContainer: document.getElementById("toastContainer"),

        // Navigation
        sidebar: document.getElementById("sidebar"),
        mobileToggle: document.getElementById("mobileToggle"),
        navLinks: document.querySelectorAll(".nav-link")
    };

    // =========================================================================
    // 1. CLOCK & INITIALIZATION
    // =========================================================================
    function startClock() {
        const update = () => {
            const now = new Date();
            const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
            const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };

            dom.liveClockTime.textContent = now.toLocaleTimeString('en-US', timeOptions);
            dom.liveClockDate.textContent = now.toLocaleDateString('en-US', dateOptions);
        };
        update();
        setInterval(update, 1000);
    }

    // =========================================================================
    // 2. REST API CALLS & REFRESHERS
    // =========================================================================

    // A. Fetch Key Statistics
    async function fetchStats() {
        try {
            const res = await fetch("/api/stats");
            const data = await res.json();
            if (!data.success) return;

            const { stats, concurrency } = data;

            // Render stats
            dom.statTotalBookings.textContent = stats.total_bookings;
            dom.statBookedSeats.textContent = stats.total_booked_seats;
            dom.statAvailableSeats.textContent = stats.total_available_seats;
            dom.statGroupBookings.textContent = stats.total_group_bookings;

            const totalCapacity = stats.total_booked_seats + stats.total_available_seats;
            const occupancyPct = totalCapacity > 0 ? Math.round((stats.total_booked_seats / totalCapacity) * 100) : 0;
            dom.occupancyRateBadge.textContent = `${occupancyPct}% Occupied`;
            dom.occupancyProgressBar.style.width = `${occupancyPct}%`;

            // Render Concurrency Telemetry
            dom.meterConflictsBlocked.textContent = concurrency.total_conflicts_prevented;
            dom.meterRaceCollisions.textContent = concurrency.race_collisions_detected;

            const mutexActive = concurrency.mutex_locked;
            dom.meterMutexStatus.textContent = mutexActive ? "LOCKED (Busy)" : "UNLOCKED (Ready)";
            dom.meterMutexStatus.style.color = mutexActive ? "var(--status-warning)" : "var(--status-success)";

            const maxSlots = concurrency.max_semaphore_permits || 3;
            const curSlots = concurrency.current_semaphore_permits;
            dom.meterSemaphoreSlots.textContent = `${curSlots} / ${maxSlots} Slots Free`;
            dom.sidebarSemaphoreStatus.textContent = `${curSlots}/${maxSlots} Slots Free`;

            // Update Semaphore Visual Dots
            dom.semaphoreDots.innerHTML = "";
            for (let i = 0; i < maxSlots; i++) {
                const dot = document.createElement("span");
                dot.className = `sem-dot ${i < curSlots ? "active" : "busy"}`;
                dot.title = `Slot ${i + 1}: ${i < curSlots ? "Available" : "Occupied"}`;
                dom.semaphoreDots.appendChild(dot);
            }
        } catch (err) {
            console.error("Error fetching stats:", err);
        }
    }

    // B. Fetch Cinema Shows
    async function fetchShows() {
        try {
            const res = await fetch("/api/shows");
            const data = await res.json();
            if (!data.success) return;

            state.shows = data.shows;

            // Populate show selectors if needed
            populateShowSelectors();

            // Render Show Management Cards & Overview Showcase
            renderShowCards();
            renderOverviewShowcase();

            // Load seats for current active show
            await loadShowSeats(state.currentShowId);
        } catch (err) {
            console.error("Error fetching shows:", err);
        }
    }

    function populateShowSelectors() {
        const selects = [dom.showSelectDropdown, dom.bookingShowSelect, dom.simShowSelect];
        selects.forEach(select => {
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = "";
            state.shows.forEach(show => {
                const opt = document.createElement("option");
                opt.value = show.id;
                opt.textContent = `Show ${show.id}: ${show.title} - ${show.time}`;
                select.appendChild(opt);
            });
            if (currentVal && state.shows.some(s => s.id == currentVal)) {
                select.value = currentVal;
            } else {
                select.value = state.currentShowId;
            }
        });
    }

    // C. Fetch Seats for a specific Show (20 seats: A1 to A20)
    async function loadShowSeats(showId) {
        try {
            state.currentShowId = showId;
            const res = await fetch(`/api/shows/${showId}/seats`);
            const data = await res.json();
            if (!data.success) return;

            const show = data.show;
            state.currentSeats = data.seats;

            // Update Hall Header
            dom.currentShowTitle.textContent = show.title;
            dom.currentShowTime.textContent = show.time;
            dom.currentShowPrice.textContent = `₹${show.price.toFixed(2)} / seat`;
            if (dom.currentShowPoster) {
                dom.currentShowPoster.src = show.poster_url || '/static/images/fallback_poster.svg';
            }
            dom.showSelectDropdown.value = showId;
            dom.bookingShowSelect.value = showId;

            // Clear selected seats that are already booked
            const validSelected = new Set();
            state.selectedSeats.forEach(seatCode => {
                const seatObj = state.currentSeats.find(s => s.seat_number === seatCode);
                if (seatObj && seatObj.status === 'available') {
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

    // D. Render 20 Seats Grid
    function renderSeatsGrid() {
        dom.seatsGrid.innerHTML = "";

        state.currentSeats.forEach(seat => {
            const seatEl = document.createElement("div");
            const isSelected = state.selectedSeats.has(seat.seat_number);
            const isBooked = seat.status === "booked";

            let statusClass = "seat-available";
            if (isBooked) statusClass = "seat-booked";
            else if (isSelected) statusClass = "seat-selected";

            seatEl.className = `seat-item ${statusClass}`;
            seatEl.dataset.seatNumber = seat.seat_number;
            seatEl.dataset.status = seat.status;
            seatEl.innerHTML = `
                <i class="fa-solid fa-couch seat-icon"></i>
                <span class="seat-code">${seat.seat_number}</span>
            `;

            // Hover tooltip details
            if (isBooked) {
                seatEl.title = `Seat ${seat.seat_number} (BOOKED)\nCustomer: ${seat.customer_name || 'N/A'}\nRef: ${seat.booking_code || 'N/A'}`;
            } else {
                seatEl.title = `Seat ${seat.seat_number} (AVAILABLE)\nClick to select for group reservation`;
            }

            // Click Handler
            seatEl.addEventListener("click", () => {
                if (isBooked) {
                    showToast(`Seat ${seat.seat_number} is already booked by ${seat.customer_name || 'another customer'}.`, "warning");
                    return;
                }
                toggleSeatSelection(seat.seat_number);
            });

            dom.seatsGrid.appendChild(seatEl);
        });
    }

    // E. Toggle Seat Selection
    function toggleSeatSelection(seatNumber) {
        if (state.selectedSeats.has(seatNumber)) {
            state.selectedSeats.delete(seatNumber);
        } else {
            state.selectedSeats.add(seatNumber);
        }
        renderSeatsGrid();
        updateSelectionDock();
    }

    // F. Quick Group Select N contiguous seats
    function quickSelectGroup(count) {
        // Find next 'count' available seats
        const availableSeats = state.currentSeats
            .filter(s => s.status === "available")
            .map(s => s.seat_number);

        if (availableSeats.length < count) {
            showToast(`Only ${availableSeats.length} seats available. Cannot select group of ${count}.`, "warning");
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

    // G. Update Selection Summary Dock & Form
    function updateSelectionDock() {
        const seatsArr = Array.from(state.selectedSeats).sort((a, b) => {
            return parseInt(a.slice(1)) - parseInt(b.slice(1));
        });

        const show = state.shows.find(s => s.id == state.currentShowId);
        const pricePerSeat = show ? show.price : 350.0;
        const totalAmount = seatsArr.length * pricePerSeat;

        // Update pills
        dom.selectedSeatsPills.innerHTML = "";
        if (seatsArr.length === 0) {
            dom.selectedSeatsPills.innerHTML = `<span class="no-selection-hint">No seats selected. Click seats above or use Quick Select.</span>`;
            dom.proceedToBookBtn.disabled = true;
        } else {
            dom.proceedToBookBtn.disabled = false;
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
                dom.selectedSeatsPills.appendChild(pill);
            });
        }

        // Update counts and prices
        dom.dockSelectedCount.textContent = `${seatsArr.length} Seat${seatsArr.length === 1 ? '' : 's'}`;
        dom.dockTotalPrice.textContent = `₹${totalAmount.toFixed(2)}`;

        // Sync with Group Booking Form
        dom.bookingSeatsInput.value = seatsArr.join(", ");
        dom.bookingSeatsCount.textContent = `${seatsArr.length} Seat${seatsArr.length === 1 ? '' : 's'}`;
        dom.formTotalAmount.textContent = `₹${totalAmount.toFixed(2)}`;
        dom.formBookingTypeBadge.textContent = seatsArr.length > 1 ? "Group Booking" : "Individual Booking";
    }

    // H. Fetch Analytics & Render Chart.js
    async function fetchAnalytics() {
        try {
            const res = await fetch("/api/analytics");
            const data = await res.json();
            if (!data.success) return;

            renderCharts(data);
        } catch (err) {
            console.error("Error fetching analytics:", err);
        }
    }

    function renderCharts(data) {
        // Chart 1: Shows Occupancy (Bar Chart)
        const ctxOccupancy = document.getElementById("showsOccupancyChart");
        if (ctxOccupancy) {
            const labels = data.occupancy.map(s => s.title.split("(")[0].trim());
            const bookedData = data.occupancy.map(s => s.booked);
            const availableData = data.occupancy.map(s => s.available);

            if (state.charts.occupancy) {
                state.charts.occupancy.data.labels = labels;
                state.charts.occupancy.data.datasets[0].data = bookedData;
                state.charts.occupancy.data.datasets[1].data = availableData;
                state.charts.occupancy.update();
            } else {
                state.charts.occupancy = new Chart(ctxOccupancy, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Booked Seats',
                                data: bookedData,
                                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                                borderColor: '#ef4444',
                                borderWidth: 1,
                                borderRadius: 6
                            },
                            {
                                label: 'Available Seats',
                                data: availableData,
                                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                                borderColor: '#10b981',
                                borderWidth: 1,
                                borderRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(12, 18, 32, 0.95)',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#94a3b8', font: { size: 11 } }
                            },
                            y: {
                                max: 20,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#94a3b8', stepSize: 5 }
                            }
                        }
                    }
                });
            }
        }

        // Chart 2: Available vs Booked Ratio (Doughnut Chart)
        const ctxRatio = document.getElementById("seatsRatioChart");
        if (ctxRatio) {
            const totalBooked = data.seat_distribution.booked;
            const totalAvailable = data.seat_distribution.available;

            const pillAvail = document.getElementById("pillAvailableCount");
            const pillBooked = document.getElementById("pillBookedCount");
            if (pillAvail) pillAvail.textContent = totalAvailable;
            if (pillBooked) pillBooked.textContent = totalBooked;

            if (state.charts.ratio) {
                state.charts.ratio.data.datasets[0].data = [totalAvailable, totalBooked];
                state.charts.ratio.update();
            } else {
                state.charts.ratio = new Chart(ctxRatio, {
                    type: 'doughnut',
                    data: {
                        labels: ['Available', 'Booked'],
                        datasets: [{
                            data: [totalAvailable, totalBooked],
                            backgroundColor: ['#10b981', '#ef4444'],
                            borderColor: '#0c1220',
                            borderWidth: 3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(12, 18, 32, 0.95)',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1
                            }
                        }
                    }
                });
            }
        }
    }

    // I. Render Show Cards in Show Management Section
    function renderShowCards() {
        dom.showsCardsGrid.innerHTML = "";

        state.shows.forEach(show => {
            const booked = show.booked_seats || 0;
            const total = show.total_seats || 20;
            const pct = Math.round((booked / total) * 100);

            const card = document.createElement("div");
            card.className = "show-card";
            card.innerHTML = `
                <div class="show-card-banner">
                    <img src="${show.poster_url || '/static/images/fallback_poster.svg'}" 
                         alt="${escapeHtml(show.title)}" 
                         class="show-poster-img"
                         onerror="this.onerror=null; this.src='/static/images/fallback_poster.svg';">
                    <span class="show-genre-badge">${show.genre}</span>
                    <div class="show-screen-tag"><i class="fa-solid fa-desktop"></i> ${show.screen}</div>
                </div>
                <div class="show-card-body">
                    <h4 class="show-title-text">${show.title}</h4>
                    <p class="show-synopsis" style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(show.description || '')}</p>
                    <div class="show-meta-row">
                        <span><i class="fa-regular fa-clock"></i> ${show.time}</span>
                        <span class="show-price-tag">₹${show.price.toFixed(2)}</span>
                    </div>
                    <div class="show-occupancy-bar-wrapper">
                        <div class="occupancy-labels">
                            <span>Occupancy: ${booked}/${total} seats</span>
                            <span>${pct}%</span>
                        </div>
                        <div class="mini-progress-bar">
                            <div class="mini-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                    <div class="show-card-actions">
                        <button class="btn btn-outline btn-sm select-show-btn" style="flex: 1;" data-show-id="${show.id}">
                            <i class="fa-solid fa-couch"></i> Select Seats
                        </button>
                        <button class="btn btn-danger-subtle btn-sm reset-show-btn" data-show-id="${show.id}" title="Reset seats for this show">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>
                </div>
            `;

            // Action: View Seats
            card.querySelector(".select-show-btn").addEventListener("click", () => {
                state.currentShowId = show.id;
                loadShowSeats(show.id);
                document.getElementById("seat-layout").scrollIntoView({ behavior: "smooth" });
                showToast(`Switched seat grid to Show #${show.id}: ${show.title}`, "info");
            });

            // Action: Reset Show
            card.querySelector(".reset-show-btn").addEventListener("click", async () => {
                if (confirm(`Reset all seats and bookings for "${show.title}"?`)) {
                    await resetShow(show.id);
                }
            });

            dom.showsCardsGrid.appendChild(card);
        });
    }

    // I.2 Render Movie Showcase in Overview Section
    function renderOverviewShowcase() {
        if (!dom.moviesShowcaseGrid) return;
        dom.moviesShowcaseGrid.innerHTML = "";

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
                            <span>${available} available (${booked}/${total} booked)</span>
                            <span style="color: ${pct > 80 ? 'var(--status-danger)' : 'var(--status-success)'};">${pct}% Full</span>
                        </div>
                        <div class="mini-progress-bar">
                            <div class="mini-progress-fill" style="width: ${pct}%; background: ${pct > 80 ? 'var(--status-danger)' : 'var(--primary-indigo)'};"></div>
                        </div>
                    </div>
                    <div class="showcase-movie-footer">
                        <span class="showcase-meta"><i class="fa-regular fa-clock"></i> ${show.time} | ${show.screen}</span>
                        <button class="btn btn-primary btn-sm showcase-book-btn" data-show-id="${show.id}">
                            <i class="fa-solid fa-couch"></i> Book Seats
                        </button>
                    </div>
                </div>
            `;

            card.querySelector(".showcase-book-btn").addEventListener("click", () => {
                state.currentShowId = show.id;
                loadShowSeats(show.id);
                document.getElementById("seat-layout").scrollIntoView({ behavior: "smooth" });
                showToast(`Selected "${show.title}". Choose your seats below!`, "info");
            });

            dom.moviesShowcaseGrid.appendChild(card);
        });
    }

    // J. Fetch Booking History
    async function fetchBookings(searchQuery = "") {
        try {
            let url = "/api/bookings";
            if (searchQuery) url += `?search=${encodeURIComponent(searchQuery)}`;

            const res = await fetch(url);
            const data = await res.json();
            if (!data.success) return;

            dom.bookingsTableBody.innerHTML = "";

            if (data.bookings.length === 0) {
                dom.bookingsTableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-center py-4 text-muted">
                            <i class="fa-regular fa-folder-open"></i> No booking records found matching your query.
                        </td>
                    </tr>
                `;
                return;
            }

            data.bookings.forEach(b => {
                const tr = document.createElement("tr");
                const isMutex = b.sync_mode.includes("Mutex");

                tr.innerHTML = `
                    <td>
                        <span class="table-booking-code">${b.booking_code}</span>
                    </td>
                    <td>
                        <strong style="color: #fff;">${b.customer_name}</strong>
                        <div style="font-size: 11px; color: var(--text-muted);">${b.customer_email || b.customer_phone || 'No contact info'}</div>
                    </td>
                    <td>
                        <div>${b.show_title}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${b.show_time} | ${b.screen}</div>
                    </td>
                    <td>
                        <span class="table-seats-badge">${b.seats_list}</span>
                    </td>
                    <td>
                        <strong style="color: var(--status-success);">₹${b.total_amount.toFixed(2)}</strong>
                    </td>
                    <td>
                        <span class="table-sync-badge ${isMutex ? 'sync-mutex' : 'sync-unsafe'}">
                            ${isMutex ? '<i class="fa-solid fa-lock"></i> Mutex' : '<i class="fa-solid fa-triangle-exclamation"></i> Unsafe'}
                        </span>
                    </td>
                    <td>
                        <code style="font-size: 11px;">${b.thread_name}</code>
                    </td>
                    <td style="font-size: 11px; color: var(--text-muted);">
                        ${b.booking_time ? b.booking_time.replace("T", " ").slice(0, 19) : 'Just now'}
                    </td>
                    <td>
                        <div class="table-actions-cell">
                            <button class="btn-icon-subtle view-receipt-btn" title="View Ticket Receipt">
                                <i class="fa-solid fa-receipt"></i>
                            </button>
                            <button class="btn-icon-subtle btn-icon-danger cancel-booking-btn" title="Cancel Booking & Free Seats">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </td>
                `;

                // View Receipt
                tr.querySelector(".view-receipt-btn").addEventListener("click", () => {
                    openReceiptModal({
                        booking_code: b.booking_code,
                        show_title: b.show_title,
                        customer_name: b.customer_name,
                        seats: b.seats_list.split(", "),
                        total_amount: b.total_amount,
                        sync_mode: b.sync_mode
                    });
                });

                // Cancel Booking
                tr.querySelector(".cancel-booking-btn").addEventListener("click", async () => {
                    if (confirm(`Cancel reservation ${b.booking_code} and release seats [${b.seats_list}]?`)) {
                        await cancelBooking(b.id);
                    }
                });

                dom.bookingsTableBody.appendChild(tr);
            });
        } catch (err) {
            console.error("Error fetching bookings:", err);
        }
    }

    // K. Fetch Live Synchronization Logs
    async function fetchSyncLogs() {
        try {
            const res = await fetch("/api/sync/logs");
            const data = await res.json();
            if (!data.success) return;

            const logs = data.logs;
            dom.syncLogsContainer.innerHTML = "";

            if (logs.length === 0) {
                dom.syncLogsContainer.innerHTML = `
                    <div class="log-entry log-INFO">
                        <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
                        <span class="log-thread">[MainThread]</span>
                        <span class="log-action">IDLE</span>
                        <span class="log-msg">Log buffer clean. Waiting for booking threads...</span>
                    </div>
                `;
                return;
            }

            logs.forEach(log => {
                const entry = document.createElement("div");
                entry.className = `log-entry log-${log.status}`;
                entry.innerHTML = `
                    <span class="log-time">[${log.timestamp}]</span>
                    <span class="log-thread">[${log.thread_name}]</span>
                    <span class="log-action">${log.action}</span>
                    <span class="log-msg">${escapeHtml(log.details)}</span>
                `;
                dom.syncLogsContainer.appendChild(entry);

                // Check for conflict/hazard alerts for notification bell
                if ((log.status === "CONFLICT" || log.status === "HAZARD") && !state.notificationAlerts.some(a => a.id === log.id)) {
                    addNotificationAlert(log);
                }
            });

            if (state.autoScrollLogs) {
                dom.syncLogsContainer.scrollTop = 0; // Recent logs at top
            }
        } catch (err) {
            console.error("Error fetching logs:", err);
        }
    }

    // =========================================================================
    // 3. BOOKING FORM HANDLER
    // =========================================================================
    dom.ticketBookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const showId = parseInt(dom.bookingShowSelect.value);
        const seats = Array.from(state.selectedSeats);

        if (seats.length === 0) {
            showToast("Please select at least one cinema seat from the seating map.", "warning");
            document.getElementById("seat-layout").scrollIntoView({ behavior: "smooth" });
            return;
        }

        const customerName = dom.bookingCustomerName.value.trim();
        const customerPhone = dom.bookingPhone.value.trim();
        const customerEmail = dom.bookingEmail.value.trim();

        if (customerName.length < 2) {
            showToast("Customer name must be at least 2 characters.", "warning");
            dom.bookingCustomerName.focus();
            return;
        }

        const phoneDigits = customerPhone.replace(/\D/g, "");
        if (phoneDigits.length < 8 || phoneDigits.length > 15) {
            showToast("Please enter a valid phone number (8 to 15 digits).", "warning");
            dom.bookingPhone.focus();
            return;
        }

        const syncModeInput = document.querySelector('input[name="syncMode"]:checked');
        const useMutex = syncModeInput ? syncModeInput.value === "mutex" : true;

        const payload = {
            show_id: showId,
            seats: seats,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_email: customerEmail,
            use_mutex: useMutex
        };

        const submitBtn = dom.ticketBookingForm.querySelector("#submitBookingBtn");
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reserving...`;

        try {
            const res = await fetch("/api/book", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                showToast(data.message, "success");
                openReceiptModal(data);

                // Reset form & selections
                state.selectedSeats.clear();
                dom.ticketBookingForm.reset();
                syncRadioStyles();

                // Refresh application state
                await refreshAll();
            } else {
                showToast(data.message || "Failed to book seats.", "danger");
                // Refresh seats to display which were taken
                await loadShowSeats(showId);
                await fetchSyncLogs();
            }
        } catch (err) {
            showToast("Server network error while submitting booking.", "danger");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Confirm Reservation`;
        }
    });

    // =========================================================================
    // 4. CONCURRENCY STRESS TEST SIMULATOR
    // =========================================================================
    dom.simThreadsCount.addEventListener("input", () => {
        dom.threadsCountVal.textContent = dom.simThreadsCount.value;
    });

    dom.simMutexToggle.addEventListener("change", () => {
        const isChecked = dom.simMutexToggle.checked;
        dom.simMutexLabel.textContent = isChecked ? "Mutex Lock ENABLED (Safe)" : "UNPROTECTED (Race Hazard Demo)";
        dom.simMutexLabel.style.color = isChecked ? "var(--status-success)" : "var(--status-danger)";
    });

    // Presets
    dom.presetSafe5.addEventListener("click", () => {
        dom.simThreadsCount.value = 5;
        dom.threadsCountVal.textContent = "5";
        dom.simSeatsInput.value = "SIM-01";
        dom.simMutexToggle.checked = true;
        dom.simMutexToggle.dispatchEvent(new Event("change"));
        showToast("Configured Preset: 5 Threads on SIM-01 with Mutex Protection (Safe)", "info");
    });

    dom.presetHazard5.addEventListener("click", () => {
        dom.simThreadsCount.value = 5;
        dom.threadsCountVal.textContent = "5";
        dom.simSeatsInput.value = "SIM-01";
        dom.simMutexToggle.checked = false;
        dom.simMutexToggle.dispatchEvent(new Event("change"));
        showToast("Configured Preset: 5 Threads on SIM-01 WITHOUT Mutex (Race Hazard Demo)", "warning");
    });

    dom.presetSafe10.addEventListener("click", () => {
        dom.simThreadsCount.value = 10;
        dom.threadsCountVal.textContent = "10";
        dom.simSeatsInput.value = "SIM-01";
        dom.simMutexToggle.checked = true;
        dom.simMutexToggle.dispatchEvent(new Event("change"));
        showToast("Configured Preset: 10 Threads on SIM-01 High-Concurrency Test", "info");
    });

    // Run Simulation
    dom.runSimulationBtn.addEventListener("click", async () => {
        const showId = parseInt(dom.simShowSelect.value);
        const targetSeat = dom.simSeatsInput.value.trim().toUpperCase() || "SIM-01";
        const seatsRaw = [targetSeat];

        const threadsCount = parseInt(dom.simThreadsCount.value);
        const useMutex = dom.simMutexToggle.checked;

        dom.runSimulationBtn.disabled = true;
        dom.runSimulationBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Firing ${threadsCount} Threads...`;
        dom.simStatusMsg.innerHTML = `<span style="color: var(--primary-indigo);"><i class="fa-solid fa-atom fa-spin"></i> Threads synchronized with <code>threading.Barrier</code>... Striking critical section!</span>`;

        try {
            const res = await fetch("/api/simulate/race-test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    show_id: showId,
                    seat: targetSeat,
                    seats: seatsRaw,
                    threads_count: threadsCount,
                    use_mutex: useMutex
                })
            });

            const data = await res.json();
            if (data.success) {
                const s = data.summary;
                dom.simResultsBanner.style.display = "flex";
                dom.resThreadsLaunched.textContent = s.threads_launched;
                dom.resSuccessful.textContent = s.successful_bookings;
                dom.resConflicts.textContent = s.conflicts_prevented;
                dom.resCollisions.textContent = s.race_collisions;
                dom.resTimeMs.textContent = `${s.execution_time_ms} ms`;

                if (useMutex) {
                    dom.simStatusMsg.innerHTML = `<strong style="color: var(--status-success);"><i class="fa-solid fa-shield-check"></i> Mutex Success! Exactly 1 thread succeeded, ${s.conflicts_prevented} conflict(s) blocked. 0 Overwrites.</strong>`;
                    showToast(`Simulation Finished: Mutex lock prevented ${s.conflicts_prevented} race conflict(s)!`, "success");
                } else {
                    dom.simStatusMsg.innerHTML = `<strong style="color: var(--status-danger);"><i class="fa-solid fa-triangle-exclamation"></i> RACE HAZARD DEMONSTRATED! Multiple threads booked same seats. ${s.race_collisions} collision(s) detected!</strong>`;
                    showToast(`RACE CONDITION DETECTED! ${s.race_collisions} collision(s) occurred without Mutex!`, "danger");
                }

                await refreshAll();
            }
        } catch (err) {
            showToast("Error executing concurrency simulation.", "danger");
        } finally {
            dom.runSimulationBtn.disabled = false;
            dom.runSimulationBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run Multithreaded Simulation`;
        }
    });

    // =========================================================================
    // 5. HELPER ACTIONS & EVENT LISTENERS
    // =========================================================================

    // Show dropdown change
    dom.showSelectDropdown.addEventListener("change", (e) => {
        loadShowSeats(parseInt(e.target.value));
    });

    dom.bookingShowSelect.addEventListener("change", (e) => {
        state.currentShowId = parseInt(e.target.value);
        loadShowSeats(state.currentShowId);
    });

    // Quick Group Select Buttons
    document.querySelectorAll("[data-quick-select]").forEach(btn => {
        btn.addEventListener("click", () => {
            const count = parseInt(btn.dataset.quickSelect);
            quickSelectGroup(count);
        });
    });

    // Clear Selection
    dom.clearSelectionBtn.addEventListener("click", () => {
        state.selectedSeats.clear();
        renderSeatsGrid();
        updateSelectionDock();
        showToast("Seat selections cleared.", "info");
    });

    // Proceed to Book
    dom.proceedToBookBtn.addEventListener("click", () => {
        document.getElementById("group-booking").scrollIntoView({ behavior: "smooth" });
        dom.bookingCustomerName.focus();
    });

    // Reset current show seats
    dom.resetShowSeatsBtn.addEventListener("click", async () => {
        const show = state.shows.find(s => s.id == state.currentShowId);
        const title = show ? show.title : `Show #${state.currentShowId}`;
        if (confirm(`Reset all 20 seats for "${title}"?`)) {
            await resetShow(state.currentShowId);
        }
    });

    // Reset single show function
    async function resetShow(showId) {
        try {
            const res = await fetch(`/api/shows/${showId}/reset`, { method: "POST" });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, "success");
                state.selectedSeats.clear();
                await refreshAll();
            }
        } catch (err) {
            showToast("Failed to reset show seats.", "danger");
        }
    }

    // Cancel Booking Function
    async function cancelBooking(bookingId) {
        try {
            const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showToast(data.message, "success");
                await refreshAll();
            }
        } catch (err) {
            showToast("Failed to cancel booking.", "danger");
        }
    }

    // Clear Logs Button
    dom.clearLogsBtn.addEventListener("click", async () => {
        await fetch("/api/sync/logs/clear", { method: "POST" });
        await fetchSyncLogs();
        showToast("Log buffer cleared.", "info");
    });

    // Toggle Auto Scroll
    dom.toggleLogAutoScroll.addEventListener("click", () => {
        state.autoScrollLogs = !state.autoScrollLogs;
        dom.toggleLogAutoScroll.innerHTML = `<i class="fa-solid fa-arrows-down-to-line"></i> Auto-Scroll: ${state.autoScrollLogs ? "ON" : "OFF"}`;
    });

    // Search Bookings
    let searchDebounce = null;
    dom.bookingSearchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            fetchBookings(e.target.value.trim());
        }, 300);
    });

    // Refresh Analytics Button
    dom.refreshAnalyticsBtn.addEventListener("click", async () => {
        await refreshAll();
        showToast("Dashboard analytics refreshed from SQLite.", "info");
    });

    // Update Semaphore Limit Setting
    dom.saveSemaphoreLimitBtn.addEventListener("click", async () => {
        const newLimit = parseInt(dom.semaphoreLimitInput.value);
        if (isNaN(newLimit) || newLimit < 1 || newLimit > 10) {
            showToast("Please enter a valid capacity between 1 and 10.", "warning");
            return;
        }

        try {
            const res = await fetch("/api/settings/semaphore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: newLimit })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Semaphore capacity updated to ${newLimit} permits.`, "success");
                await fetchStats();
                await fetchSyncLogs();
            }
        } catch (err) {
            showToast("Failed to update semaphore limit.", "danger");
        }
    });

    // Reset Entire System Button
    dom.resetSystemBtn.addEventListener("click", async () => {
        if (confirm("WARNING: This will wipe all current bookings, reset all 80 seats, and restore initial seed data. Continue?")) {
            try {
                const res = await fetch("/api/reset-all", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, "success");
                    state.selectedSeats.clear();
                    await refreshAll();
                }
            } catch (err) {
                showToast("Failed to reset system.", "danger");
            }
        }
    });

    // Radio Card Styles Sync
    function syncRadioStyles() {
        document.querySelectorAll(".radio-card").forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            if (radio && radio.checked) {
                card.classList.add("selected-radio");
            } else {
                card.classList.remove("selected-radio");
            }
        });
    }

    document.querySelectorAll('input[name="syncMode"]').forEach(radio => {
        radio.addEventListener("change", syncRadioStyles);
    });

    // Mobile Sidebar Toggle
    dom.mobileToggle.addEventListener("click", () => {
        dom.sidebar.classList.toggle("mobile-open");
    });

    // Navigation Smooth Scroll & Active highlight
    dom.navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const targetSection = link.dataset.section;
            if (!targetSection) return;

            dom.navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");

            const el = document.getElementById(targetSection);
            if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth" });
                if (window.innerWidth <= 768) {
                    dom.sidebar.classList.remove("mobile-open");
                }
            }
        });
    });

    // Notification Dropdown Toggle
    dom.notificationBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dom.notificationDropdown.classList.toggle("show");
    });

    document.addEventListener("click", (e) => {
        if (!dom.notificationDropdown.contains(e.target) && e.target !== dom.notificationBtn) {
            dom.notificationDropdown.classList.remove("show");
        }
    });

    function addNotificationAlert(log) {
        state.notificationAlerts.unshift(log);
        dom.notificationCount.textContent = state.notificationAlerts.length;
        dom.notificationHeaderCount.textContent = `${state.notificationAlerts.length} events`;

        const isHazard = log.status === "HAZARD";
        const item = document.createElement("div");
        item.style.padding = "8px 10px";
        item.style.borderBottom = "1px solid var(--border-subtle)";
        item.style.fontSize = "11px";
        item.innerHTML = `
            <div style="font-weight: 700; color: ${isHazard ? 'var(--status-danger)' : 'var(--status-warning)'};">
                <i class="fa-solid ${isHazard ? 'fa-triangle-exclamation' : 'fa-shield-halved'}"></i> ${log.action}
            </div>
            <div style="color: var(--text-secondary); margin-top: 2px;">${escapeHtml(log.details)}</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${log.timestamp} | ${log.thread_name}</div>
        `;

        if (dom.notificationList.querySelector(".empty-notifications")) {
            dom.notificationList.innerHTML = "";
        }
        dom.notificationList.prepend(item);
    }

    // Modal Handlers
    function openReceiptModal(data) {
        dom.modalTicketCode.textContent = data.booking_code || "TKT-CONFIRMED";
        dom.modalMovieTitle.textContent = data.show_title || "CinemaPro Screening";
        dom.modalCustomerName.textContent = data.customer_name || "Guest Customer";
        dom.modalSeatsList.textContent = Array.isArray(data.seats) ? data.seats.join(", ") : data.seats;
        dom.modalTotalPaid.textContent = `₹${parseFloat(data.total_amount || 0).toFixed(2)}`;
        dom.modalSyncMode.textContent = data.sync_mode || "Mutex-Protected";

        dom.receiptModal.style.display = "flex";
    }

    dom.closeReceiptModalBtn.addEventListener("click", () => {
        dom.receiptModal.style.display = "none";
    });

    dom.dismissReceiptBtn.addEventListener("click", () => {
        dom.receiptModal.style.display = "none";
    });

    dom.printReceiptBtn.addEventListener("click", () => {
        window.print();
    });

    // Toast Generator
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

        dom.toastContainer.appendChild(toast);

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
    // 5B. THEME TOGGLE (DARK / LIGHT MODE)
    // =========================================================================
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeIcon = document.getElementById("themeIcon");

    function applyTheme(theme) {
        if (theme === "light") {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            if (themeIcon) {
                themeIcon.className = "fa-solid fa-sun";
            }
        } else {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            if (themeIcon) {
                themeIcon.className = "fa-solid fa-moon";
            }
        }
    }

    const savedTheme = localStorage.getItem("cinemapro_theme") || "dark";
    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const isLight = document.body.classList.contains("light-theme");
            const newTheme = isLight ? "dark" : "light";
            applyTheme(newTheme);
            localStorage.setItem("cinemapro_theme", newTheme);
            showToast(`Theme switched to ${newTheme.toUpperCase()} mode`, "info", 2000);
        });
    }

    // =========================================================================
    // 5C. OS CONCEPTS LAB INTERACTIVE CONTROLS & DEMONSTRATION SUITE
    // =========================================================================

    // A. Quick Concept Navigator Filter Pills
    const labPills = document.querySelectorAll(".lab-pill");
    const labCards = document.querySelectorAll(".lab-module-card, .concept-card");

    labPills.forEach(pill => {
        pill.addEventListener("click", () => {
            labPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const filter = pill.dataset.filter;

            if (filter === "all") {
                labCards.forEach(card => card.style.display = "");
            } else {
                labCards.forEach(card => {
                    if (card.id === `module-${filter}`) {
                        card.style.display = "";
                        card.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                        card.style.display = "none";
                    }
                });
            }
        });
    });

    // B. Three-Stage Interactive Workflow Inspector
    const stageInspector = document.getElementById("stageInspector");
    const inspectorTitle = document.getElementById("inspectorTitle");
    const inspectorContent = document.getElementById("inspectorContent");
    const closeInspectorBtn = document.getElementById("closeInspectorBtn");

    const stageData = {
        "1": {
            title: "STAGE 1 – SYNCHRONIZATION GATE (Access Throttling & Lock Acquisition)",
            theory: "When a customer submits a booking request, an independent worker thread is assigned. Before accessing any shared database state, the thread MUST pass through the synchronization gate by acquiring a Mutex lock (Mutual Exclusion) or a Counting Semaphore permit. If the lock is held or permits are exhausted, the thread is suspended in a queue, preventing race conditions.",
            code: `# Python Backend (Cinema_Group_Ticket_Dashboard/app.py)
# 1. Counting Semaphore Throttles Burst Traffic:
acquired_sem = concurrency_semaphore.acquire(blocking=True, timeout=10.0)
if not acquired_sem:
    return jsonify({"success": False, "error": "Server busy. Try again."}), 503

# 2. Mutex Lock Enforces Exclusive Critical Section Access:
with booking_mutex:
    # Thread has entered Critical Section!
    # ... Database operations happen safely here ...
    pass  # Lock is automatically released upon exit`,
            hazard: "WITHOUT THIS GATE: Multiple threads read is_booked = 0 simultaneously, resulting in double-booking and SQLite database locks."
        },
        "2": {
            title: "STAGE 2 – DATABASE PROCESSING (Critical Section & Atomic Commit)",
            theory: "Inside the protected Critical Section, the thread queries SQLite to verify that all requested seats are still available. For group bookings (e.g. 3 seats), atomicity is mandatory: if even one seat is already reserved, the entire transaction rolls back cleanly (ACID principle). If all seats are available, they are reserved together.",
            code: `# Python Backend (Cinema_Group_Ticket_Dashboard/app.py)
with sqlite3.connect(DATABASE_PATH) as conn:
    cursor = conn.cursor()
    # Check availability under Mutex lock:
    placeholders = ','.join('?' for _ in seats)
    cursor.execute(f"SELECT seat_number, is_booked FROM seats WHERE show_id = ? AND seat_number IN ({placeholders})", (show_id, *seats))
    rows = cursor.fetchall()
    
    # Atomic validation:
    if any(row[1] == 1 for row in rows):
        raise ConcurrencyConflictException("Seats already booked by another user!")
        
    # Atomic update:
    cursor.execute(f"UPDATE seats SET is_booked = 1 WHERE show_id = ? AND seat_number IN ({placeholders})", (show_id, *seats))
    conn.commit()`,
            hazard: "WITHOUT ATOMICITY: Customer A gets 2 of 3 seats, Customer B gets 1 seat, splitting the group and corrupting booking records."
        },
        "3": {
            title: "STAGE 3 – WEBSITE REAL-TIME UPDATE (UI Synchronization & Receipt)",
            theory: "Once database changes are committed, the backend constructs an audit receipt with a unique alphanumeric reference (e.g., GRP-89F12A). The frontend updates via DOM rendering or WebSocket, immediately changing seat buttons from Green (Available) to Red (Booked) and refreshing dashboard telemetry.",
            code: `# Python Backend Response -> Frontend JavaScript (static/script.js)
# Backend returns:
booking_ref = f"GRP-{uuid.uuid4().hex[:6].upper()}"
return jsonify({
    "success": True,
    "booking_reference": booking_ref,
    "seats": seats,
    "total_amount": total_amount
})

# Frontend handles confirmation:
renderSeatsGrid(); // Turns booked seats to Red
showReceiptModal(data); // Displays printable ticket receipt
fetchStats(); // Updates live occupancy rate`,
            hazard: "WITHOUT REAL-TIME UI SYNC: Stale client state causes customers to keep clicking seats that have already been reserved."
        }
    };

    function showStageDetails(stageNum) {
        document.querySelectorAll(".workflow-step-card").forEach(c => c.classList.remove("active"));
        const card = document.getElementById(`wfStep${stageNum}`);
        if (card) card.classList.add("active");

        const data = stageData[stageNum];
        if (!data || !stageInspector) return;

        inspectorTitle.textContent = data.title;
        inspectorContent.innerHTML = `
            <div class="inspector-section">
                <h6><i class="fa-solid fa-graduation-cap text-primary"></i> Operating System Principle</h6>
                <p>${escapeHtml(data.theory)}</p>
            </div>
            <div class="inspector-section">
                <h6><i class="fa-brands fa-python text-warning"></i> Exact Python Implementation</h6>
                <pre class="code-preview"><code>${escapeHtml(data.code)}</code></pre>
            </div>
            <div class="inspector-section hazard-box">
                <h6><i class="fa-solid fa-triangle-exclamation text-danger"></i> Failure Hazard if Skipped</h6>
                <p class="text-danger">${escapeHtml(data.hazard)}</p>
            </div>
        `;
        stageInspector.classList.add("open");
    }

    document.querySelectorAll(".workflow-step-card").forEach(card => {
        card.addEventListener("click", () => {
            const stage = card.dataset.stage;
            showStageDetails(stage);
        });
    });

    if (closeInspectorBtn) {
        closeInspectorBtn.addEventListener("click", () => {
            stageInspector.classList.remove("open");
        });
    }

    // C. Activity Monitor Telemetry Fetcher
    async function fetchLabMonitorState() {
        try {
            const res = await fetch("/api/lab/monitor-state");
            const data = await res.json();
            if (!data.success) return;

            const nameEl = document.getElementById("monThreadName");
            const idEl = document.getElementById("monThreadId");
            const statusEl = document.getElementById("monThreadStatus");
            const seatEl = document.getElementById("monTargetSeat");
            const mutexEl = document.getElementById("monMutexState");
            const semEl = document.getElementById("monSemState");
            const csEl = document.getElementById("monCriticalSection");
            const queueEl = document.getElementById("monWaitingQueue");
            const resultEl = document.getElementById("monLastResult");
            const timeEl = document.getElementById("monTimestamp");

            if (nameEl) nameEl.textContent = data.active_thread_name || "None (IDLE)";
            if (idEl) idEl.textContent = `Thread ID: ${data.active_thread_id || '-'}`;
            if (statusEl) {
                const s = data.active_thread_status || "IDLE";
                let badgeClass = "badge-subtle";
                if (s === "Running") badgeClass = "badge-primary";
                else if (s === "Completed") badgeClass = "badge-success";
                else if (s === "Blocked") badgeClass = "badge-danger";
                else if (s === "Waiting") badgeClass = "badge-warning";
                statusEl.innerHTML = `<span class="${badgeClass}">${escapeHtml(s)}</span>`;
            }
            if (seatEl) seatEl.textContent = data.contested_seat || "None";
            if (mutexEl) {
                mutexEl.textContent = data.mutex_locked ? "LOCKED (Busy)" : "UNLOCKED";
                mutexEl.style.color = data.mutex_locked ? "var(--status-warning)" : "var(--status-success)";
            }
            if (semEl) {
                semEl.textContent = `${data.semaphore_permits_free} / ${data.semaphore_capacity} Permits Free`;
            }
            if (csEl) {
                csEl.textContent = data.critical_section_occupant ? `${data.critical_section_occupant} Inside CS` : "IDLE (Empty)";
                csEl.style.color = data.critical_section_occupant ? "var(--status-warning)" : "var(--status-success)";
            }
            if (queueEl) {
                if (data.waiting_queue && data.waiting_queue.length > 0) {
                    queueEl.innerHTML = data.waiting_queue.map(t => `<span class="queue-chip">${escapeHtml(t)}</span>`).join("");
                } else {
                    queueEl.innerHTML = `<span class="queue-chip empty-chip">No threads waiting in queue</span>`;
                }
            }
            if (resultEl) resultEl.textContent = data.last_result || "System idle.";
            if (timeEl) timeEl.textContent = data.timestamp || "--:--:--.---";
        } catch (err) {
            console.error("Error fetching lab monitor state:", err);
        }
    }

    // D. Comparison Matrix Fetcher
    async function fetchLabComparison() {
        try {
            const res = await fetch("/api/lab/comparison");
            const data = await res.json();
            if (!data.success) return;

            const noM = data.no_mutex || {};
            const withM = data.with_mutex || {};
            const withS = data.with_semaphore || {};

            // Card 1: Without Mutex
            const uRuns = document.getElementById("cmpUnsafeRuns");
            const uReq = document.getElementById("cmpNoMutexRequests");
            const uSucc = document.getElementById("cmpNoMutexSuccess");
            const uRej = document.getElementById("cmpNoMutexRejected");
            const uColl = document.getElementById("cmpUnsafeCollisions");
            const uWait = document.getElementById("cmpNoMutexWaiting");
            const uSync = document.getElementById("cmpNoMutexSyncStatus");
            const uSeat = document.getElementById("cmpNoMutexFinalSeats");

            if (uRuns) uRuns.textContent = noM.runs ?? noM.total_runs ?? 0;
            if (uReq) uReq.textContent = noM.total_requests ?? 0;
            if (uSucc) uSucc.textContent = `${noM.successful ?? 0} (Unsafe)`;
            if (uRej) uRej.textContent = noM.rejected ?? 0;
            if (uColl) uColl.textContent = noM.race_collisions ?? noM.total_collisions ?? 0;
            if (uWait) uWait.textContent = `${noM.waiting_threads ?? 0} (No Wait Queue)`;
            if (uSync) uSync.textContent = noM.sync_status || "Unprotected (Hazard)";
            if (uSeat) uSeat.textContent = noM.final_seat_status || "Contested / Overwritten";

            // Card 2: With Mutex
            const mRuns = document.getElementById("cmpMutexRuns");
            const mReq = document.getElementById("cmpMutexRequests");
            const mSucc = document.getElementById("cmpMutexSuccess");
            const mRej = document.getElementById("cmpMutexRejected");
            const mBlock = document.getElementById("cmpMutexBlocked");
            const mWait = document.getElementById("cmpMutexWaiting");
            const mSync = document.getElementById("cmpMutexSyncStatus");
            const mSeat = document.getElementById("cmpMutexFinalSeats");

            if (mRuns) mRuns.textContent = withM.runs ?? withM.total_runs ?? 0;
            if (mReq) mReq.textContent = withM.total_requests ?? 0;
            if (mSucc) mSucc.textContent = withM.successful ?? 0;
            if (mRej) mRej.textContent = withM.rejected ?? withM.conflicts_prevented ?? 0;
            if (mBlock) mBlock.textContent = withM.conflicts_prevented ?? withM.rejected ?? 0;
            if (mWait) mWait.textContent = `${withM.waiting_threads ?? 0} (Serialized)`;
            if (mSync) mSync.textContent = withM.sync_status || "Protected (threading.Lock)";
            if (mSeat) mSeat.textContent = withM.final_seat_status || "1 Booked, N Blocked";

            // Card 3: With Semaphore
            const sRuns = document.getElementById("cmpSemRuns");
            const sReq = document.getElementById("cmpSemRequests");
            const sSucc = document.getElementById("cmpSemSuccess");
            const sRej = document.getElementById("cmpSemRejected");
            const sCap = document.getElementById("cmpSemCapacity");
            const sWait = document.getElementById("cmpSemWaiting");
            const sSync = document.getElementById("cmpSemSyncStatus");
            const sSeat = document.getElementById("cmpSemFinalSeats");

            if (sRuns) sRuns.textContent = withS.runs ?? withS.total_runs ?? 0;
            if (sReq) sReq.textContent = withS.total_requests ?? 0;
            if (sSucc) sSucc.textContent = withS.successful ?? 0;
            if (sRej) sRej.textContent = withS.rejected ?? 0;
            if (sCap) sCap.textContent = `${withS.capacity || 3} Permits`;
            if (sWait) sWait.textContent = withS.waiting_threads ? `${withS.waiting_threads} Queued` : "Queued when > Capacity";
            if (sSync) sSync.textContent = withS.sync_status || "Throttled (threading.Semaphore)";
            if (sSeat) sSeat.textContent = withS.final_seat_status || "Batched in Waves";
        } catch (err) {
            console.error("Error fetching lab comparison:", err);
        }
    }

    // Helper to render logs into a terminal box
    function renderTerminalLogs(containerId, logs) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        logs.forEach(item => {
            const row = document.createElement("div");
            row.className = "t-line";
            let color = "text-muted";
            if (item.action.includes("CONFLICT") || item.action.includes("DOUBLE_BOOK")) color = "text-danger";
            else if (item.action.includes("SUCCESS") || item.action.includes("RELEASE")) color = "text-success";
            else if (item.action.includes("ACQUIRED") || item.action.includes("RUNNING")) color = "text-primary";
            else if (item.action.includes("WAITING") || item.action.includes("BARRIER")) color = "text-warning";

            row.innerHTML = `<span class="t-stamp">[${escapeHtml(item.time)}]</span> <span class="t-thread font-mono">[${escapeHtml(item.thread)}]</span> <strong class="${color}">${escapeHtml(item.action)}:</strong> ${escapeHtml(item.message)}`;
            container.appendChild(row);
        });
        container.scrollTop = container.scrollHeight;
    }

    // =========================================================================
    // 5D. INTERACTIVE LAB MODULE CONTROLLERS (A THROUGH H + RESET)
    // =========================================================================

    // Concept A: Threads Demo
    const runThreadsDemoBtn = document.getElementById("runThreadsDemoBtn");
    const resetThreadsDemoBtn = document.getElementById("resetThreadsDemoBtn");

    if (runThreadsDemoBtn) {
        runThreadsDemoBtn.addEventListener("click", async () => {
            runThreadsDemoBtn.disabled = true;
            runThreadsDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Spawning Threads...`;

            // Animate nodes to Waiting
            ["nodeThread1", "nodeThread2", "nodeThread3"].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.querySelector(".node-state").textContent = "WAITING";
                    el.querySelector(".node-state").className = "node-state badge-warning";
                    el.querySelector(".bar").style.width = "30%";
                }
            });

            try {
                const res = await fetch("/api/lab/threads-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("threadsDemoLogs", data.logs);
                    ["nodeThread1", "nodeThread2", "nodeThread3"].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.querySelector(".node-state").textContent = "COMPLETED";
                            el.querySelector(".node-state").className = "node-state badge-success";
                            el.querySelector(".bar").style.width = "100%";
                        }
                    });
                    showToast("Multithreading simulation completed successfully!", "success");
                    await fetchLabMonitorState();
                }
            } catch (err) {
                showToast("Failed to run multithreading demo.", "danger");
            } finally {
                runThreadsDemoBtn.disabled = false;
                runThreadsDemoBtn.innerHTML = `<i class="fa-solid fa-play"></i> Launch Multi-Customer Threads`;
            }
        });
    }

    if (resetThreadsDemoBtn) {
        resetThreadsDemoBtn.addEventListener("click", () => {
            ["nodeThread1", "nodeThread2", "nodeThread3"].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.querySelector(".node-state").textContent = "IDLE";
                    el.querySelector(".node-state").className = "node-state badge-subtle";
                    el.querySelector(".bar").style.width = "0%";
                }
            });
            const feed = document.getElementById("threadsDemoLogs");
            if (feed) feed.innerHTML = `<div class="t-line text-muted">[System] Reset complete. Ready to spawn threads.</div>`;
            showToast("Threads demo reset to idle state.", "info");
        });
    }

    // Concept B: Concurrency Demo
    const runConcurrencyDemoBtn = document.getElementById("runConcurrencyDemoBtn");
    if (runConcurrencyDemoBtn) {
        runConcurrencyDemoBtn.addEventListener("click", async () => {
            runConcurrencyDemoBtn.disabled = true;
            runConcurrencyDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Synchronizing at Barrier...`;

            const barrier = document.getElementById("concurrencyBarrierVisual");
            if (barrier) barrier.classList.add("barrier-active");

            try {
                const res = await fetch("/api/lab/concurrency-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("concurrencyDemoLogs", data.logs);
                    showToast(`Concurrency test finished. Processed ${data.threads_spawned} requests.`, "info");
                    await fetchLabMonitorState();
                }
            } catch (err) {
                showToast("Failed to run concurrency demo.", "danger");
            } finally {
                if (barrier) barrier.classList.remove("barrier-active");
                runConcurrencyDemoBtn.disabled = false;
                runConcurrencyDemoBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Fire 4 Concurrent Requests via Barrier`;
            }
        });
    }

    // Concept C: Race Hazard Demo
    const runRaceDemoBtn = document.getElementById("runRaceDemoBtn");
    if (runRaceDemoBtn) {
        runRaceDemoBtn.addEventListener("click", async () => {
            runRaceDemoBtn.disabled = true;
            runRaceDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Triggering Unsynchronized Race...`;

            try {
                const res = await fetch("/api/lab/race-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("raceDemoLogs", data.logs);
                    if (data.collision_detected) {
                        showToast(`RACE HAZARD CONFIRMED: Double-booking collision detected on ${data.target_seat}!`, "danger", 5000);
                    }
                    await fetchLabMonitorState();
                    await fetchLabComparison();
                    await fetchStats();
                }
            } catch (err) {
                showToast("Failed to trigger race condition demo.", "danger");
            } finally {
                runRaceDemoBtn.disabled = false;
                runRaceDemoBtn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Trigger Race Hazard on SIM-RACE`;
            }
        });
    }

    // Concept D: Critical Section Demo
    const runCriticalSectionDemoBtn = document.getElementById("runCriticalSectionDemoBtn");
    if (runCriticalSectionDemoBtn) {
        runCriticalSectionDemoBtn.addEventListener("click", async () => {
            runCriticalSectionDemoBtn.disabled = true;
            runCriticalSectionDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Stepping Through Phases...`;

            const entryEl = document.getElementById("csEntryOccupants");
            const critEl = document.getElementById("csCriticalOccupants");
            const exitEl = document.getElementById("csExitOccupants");
            const remEl = document.getElementById("csRemainderOccupants");

            if (entryEl) entryEl.innerHTML = `<span class="chip-active">Customer-1 Waiting</span>`;

            try {
                const res = await fetch("/api/lab/critical-section-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("csDemoLogs", data.logs);

                    // Animate to Critical Section
                    if (entryEl) entryEl.innerHTML = `<span class="chip-idle">Queue clear</span>`;
                    if (critEl) critEl.innerHTML = `<span class="chip-active text-warning"><i class="fa-solid fa-lock"></i> Customer-1 INSIDE CS</span>`;

                    setTimeout(() => {
                        if (critEl) critEl.innerHTML = `<span class="chip-idle">No thread inside</span>`;
                        if (exitEl) exitEl.innerHTML = `<span class="chip-active text-info">Customer-1 Exited</span>`;
                        if (remEl) remEl.innerHTML = `<span class="chip-active text-success">Customer-1 Ticket Issued</span>`;
                    }, 800);

                    showToast("Critical section 4-phase sequence completed.", "success");
                    await fetchLabMonitorState();
                }
            } catch (err) {
                showToast("Failed to run critical section demo.", "danger");
            } finally {
                runCriticalSectionDemoBtn.disabled = false;
                runCriticalSectionDemoBtn.innerHTML = `<i class="fa-solid fa-door-closed"></i> Animate 4-Phase Critical Section Flow`;
            }
        });
    }

    // Concept E: Mutex Lock Demo (Week 2 PDF)
    const runMutexDemoBtn = document.getElementById("runMutexDemoBtn");
    if (runMutexDemoBtn) {
        runMutexDemoBtn.addEventListener("click", async () => {
            runMutexDemoBtn.disabled = true;
            runMutexDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Locking Critical Section...`;

            const lockIcon = document.getElementById("mutexLockIcon");
            const lockLabel = document.getElementById("mutexVisualState");
            if (lockIcon) lockIcon.className = "fa-solid fa-lock text-warning fa-bounce";
            if (lockLabel) lockLabel.textContent = "ACQUIRING MUTEX LOCK...";

            try {
                const res = await fetch("/api/lab/mutex-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("mutexDemoLogs", data.logs);

                    if (lockIcon) lockIcon.className = "fa-solid fa-shield-halved text-success";
                    if (lockLabel) lockLabel.textContent = `PROTECTED – 1 WINNER (${data.winner}), 4 BLOCKED SAFELY`;

                    showToast(`Mutex Lock Successful: 1 booking confirmed, 4 safe rejections, 0 collisions.`, "success", 4000);
                    await fetchLabMonitorState();
                    await fetchLabComparison();
                    await fetchStats();
                }
            } catch (err) {
                showToast("Failed to run Mutex demo.", "danger");
            } finally {
                runMutexDemoBtn.disabled = false;
                runMutexDemoBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Test 5 Competing Threads on SIM-MUTEX`;
            }
        });
    }

    // Concept F: Counting Semaphore Demo (Week 3 PDF)
    const runSemaphoreDemoBtn = document.getElementById("runSemaphoreDemoBtn");
    const labSemCapacitySelect = document.getElementById("labSemCapacitySelect");

    function renderSemPermitSlots(capacity, activePermits = 0) {
        const container = document.getElementById("semPermitSlotsContainer");
        if (!container) return;
        container.innerHTML = "";
        for (let i = 0; i < capacity; i++) {
            const slot = document.createElement("div");
            slot.className = `permit-slot-box ${i < activePermits ? 'slot-occupied' : 'slot-free'}`;
            slot.innerHTML = `
                <i class="fa-solid fa-key"></i>
                <span>Permit ${i + 1}</span>
            `;
            container.appendChild(slot);
        }
    }

    if (labSemCapacitySelect) {
        labSemCapacitySelect.addEventListener("change", () => {
            renderSemPermitSlots(parseInt(labSemCapacitySelect.value), 0);
        });
        renderSemPermitSlots(parseInt(labSemCapacitySelect.value), 0);
    }

    if (runSemaphoreDemoBtn) {
        runSemaphoreDemoBtn.addEventListener("click", async () => {
            const cap = parseInt(labSemCapacitySelect ? labSemCapacitySelect.value : 2);
            runSemaphoreDemoBtn.disabled = true;
            runSemaphoreDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Throttling Waves...`;

            renderSemPermitSlots(cap, cap);

            try {
                const res = await fetch("/api/lab/semaphore-demo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ capacity: cap })
                });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("semaphoreDemoLogs", data.logs);
                    renderSemPermitSlots(cap, 0);

                    const waitersEl = document.getElementById("semWaitersChips");
                    if (waitersEl) waitersEl.innerHTML = `<span class="chip-empty text-success">All 6 waves completed</span>`;

                    showToast(`Semaphore processed 6 requests throttled at ${cap} concurrent permits.`, "info");
                    await fetchLabMonitorState();
                    await fetchLabComparison();
                    await fetchStats();
                }
            } catch (err) {
                showToast("Failed to run Semaphore demo.", "danger");
            } finally {
                runSemaphoreDemoBtn.disabled = false;
                runSemaphoreDemoBtn.innerHTML = `<i class="fa-solid fa-traffic-light"></i> Launch 6 Wave Requests`;
            }
        });
    }

    // Concept G: Thread Join Demo
    const runThreadJoinDemoBtn = document.getElementById("runThreadJoinDemoBtn");
    if (runThreadJoinDemoBtn) {
        runThreadJoinDemoBtn.addEventListener("click", async () => {
            runThreadJoinDemoBtn.disabled = true;
            runThreadJoinDemoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Joining Worker Threads...`;

            const mState = document.getElementById("mainThreadState");
            if (mState) {
                mState.textContent = "WAITING AT BARRIER (thread.join)";
                mState.className = "m-state badge-warning";
            }

            ["worker1Pill", "worker2Pill", "worker3Pill"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add("worker-running");
            });

            try {
                const res = await fetch("/api/lab/thread-join-demo", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    renderTerminalLogs("joinDemoLogs", data.logs);

                    ["worker1Pill", "worker2Pill", "worker3Pill"].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.classList.remove("worker-running");
                            el.classList.add("worker-done");
                        }
                    });

                    if (mState) {
                        mState.textContent = "COMPLETED & AGGREGATED (Receipt Issued)";
                        mState.className = "m-state badge-success";
                    }

                    showToast("All worker threads joined. Aggregated booking receipt finalized.", "success");
                    await fetchLabMonitorState();
                }
            } catch (err) {
                showToast("Failed to run thread join demo.", "danger");
            } finally {
                runThreadJoinDemoBtn.disabled = false;
                runThreadJoinDemoBtn.innerHTML = `<i class="fa-solid fa-link"></i> Launch 3 Workers & Execute thread.join()`;
            }
        });
    }

    // Concept H: Inspect Shared Data & Seats
    const inspectSharedDataBtn = document.getElementById("inspectSharedDataBtn");
    if (inspectSharedDataBtn) {
        inspectSharedDataBtn.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/lab/monitor-state");
                const data = await res.json();
                const tbody = document.getElementById("sharedSeatsTableBody");
                if (!tbody) return;

                if (data.seats && data.seats.length > 0) {
                    tbody.innerHTML = data.seats.map(s => {
                        const isB = s.is_booked === 1;
                        const statusBadge = isB 
                            ? `<span class="badge-danger">Booked</span>` 
                            : `<span class="badge-success">Available</span>`;
                        return `
                            <tr>
                                <td><strong>${escapeHtml(s.seat_number)}</strong></td>
                                <td>${escapeHtml(s.module || 'Lab Test')}</td>
                                <td>${statusBadge}</td>
                                <td>${escapeHtml(s.booked_by || 'Unassigned')}</td>
                                <td>${escapeHtml(s.booking_time || 'Pristine')}</td>
                            </tr>
                        `;
                    }).join("");
                } else {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No simulation seats found.</td></tr>`;
                }
                showToast("Shared database simulation state inspected.", "info");
            } catch (err) {
                showToast("Failed to inspect shared data.", "danger");
            }
        });
    }

    // Lab Reset Button
    const labResetBtn = document.getElementById("labResetBtn");
    if (labResetBtn) {
        labResetBtn.addEventListener("click", async () => {
            try {
                const res = await fetch("/api/lab/reset", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                    showToast(data.message, "success");
                    // Clear all lab demo logs
                    ["threadsDemoLogs", "concurrencyDemoLogs", "raceDemoLogs", "csDemoLogs", "mutexDemoLogs", "semaphoreDemoLogs", "joinDemoLogs"].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = `<div class="t-line text-muted">[System] Lab reset. Ready for demonstration.</div>`;
                    });
                    await fetchLabMonitorState();
                    await fetchLabComparison();
                    await fetchStats();
                }
            } catch (err) {
                showToast("Failed to reset lab test beds.", "danger");
            }
        });
    }

    // Refresh Comparison Matrix Button
    const refreshComparisonBtn = document.getElementById("refreshComparisonBtn");
    if (refreshComparisonBtn) {
        refreshComparisonBtn.addEventListener("click", async () => {
            await fetchLabComparison();
            showToast("Comparison matrix re-synchronized.", "info");
        });
    }

    // Comprehensive State Refresher
    async function refreshAll() {
        await Promise.all([
            fetchStats(),
            fetchShows(),
            fetchBookings(dom.bookingSearchInput.value.trim()),
            fetchAnalytics(),
            fetchSyncLogs(),
            fetchLabMonitorState(),
            fetchLabComparison()
        ]);
    }

    // =========================================================================
    // 6. APPLICATION STARTUP & BACKGROUND POLLING
    // =========================================================================
    startClock();
    syncRadioStyles();
    refreshAll();

    // Default inspector open for Stage 1
    showStageDetails("1");

    // Poll live concurrency logs and telemetry every 1.8 seconds
    setInterval(() => {
        fetchStats();
        fetchSyncLogs();
        fetchLabMonitorState();
    }, 1800);
});


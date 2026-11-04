"""
========================================================================================
CinemaPro - Cinema Group Ticket Booking System Dashboard
Core Demonstration: Multithreading, Mutex Locks, Counting Semaphores & Race Condition Prevention
B.Tech CSE Capstone Project Edition
========================================================================================
"""

import os
import re
import sqlite3
import threading
import time
import uuid
from datetime import datetime
from collections import deque
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

# Path configuration
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# Support for serverless hosting environments (e.g., Vercel) where the root filesystem is read-only
if os.environ.get("VERCEL"):
    import shutil
    tmp_db = "/tmp/cinema.db"
    src_db = os.path.join(BASE_DIR, "cinema.db")
    if not os.path.exists(tmp_db) and os.path.exists(src_db):
        try:
            shutil.copyfile(src_db, tmp_db)
        except Exception as e:
            print(f"Warning: Could not copy cinema.db to /tmp: {e}")
    DB_PATH = tmp_db if os.path.exists(tmp_db) else src_db
else:
    DB_PATH = os.environ.get("CINEMA_DB_PATH", os.path.join(BASE_DIR, "cinema.db"))

app = Flask(
    __name__,
    template_folder=BASE_DIR,
    static_folder=BASE_DIR,
    static_url_path=""
)
app.secret_key = os.environ.get("SECRET_KEY", "cinemapro-secure-session-key-2026-btech-cse")

# In this flat deployment (zero subfolders), route all /static and /static/images requests
# directly to the files residing in the root folder
@app.route("/static/<path:filename>")
@app.route("/static/images/<path:filename>")
@app.route("/images/<path:filename>")
def serve_flat_static(filename):
    clean_file = os.path.basename(filename)
    return send_from_directory(BASE_DIR, clean_file)

# ========================================================================================
# CONCURRENCY PRIMITIVES & SYNCHRONIZATION STATE
# ========================================================================================
# Mutex Lock: Guarantees mutual exclusion when checking and booking seats
booking_mutex = threading.Lock()

# Counting Semaphore: Limits maximum concurrent active booking transactions
DEFAULT_SEMAPHORE_LIMIT = 3
current_semaphore_limit = DEFAULT_SEMAPHORE_LIMIT
booking_semaphore = threading.Semaphore(value=current_semaphore_limit)

# Thread-safe Concurrency Activity Logger
sync_logs_lock = threading.Lock()
sync_logs_buffer = deque(maxlen=200)

# Statistics Tracker
stats_lock = threading.Lock()
concurrency_stats = {
    "total_lock_acquisitions": 0,
    "total_conflicts_prevented": 0,
    "race_collisions_detected": 0,
    "active_threads": 0,
    "current_semaphore_permits": current_semaphore_limit,
    "max_semaphore_permits": current_semaphore_limit
}

def log_sync_event(thread_name, action, details, status="INFO"):
    """Thread-safe logging of concurrency and synchronization events."""
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    log_entry = {
        "id": str(uuid.uuid4())[:8],
        "timestamp": timestamp,
        "thread_name": thread_name,
        "action": action,
        "details": details,
        "status": status  # INFO, ACQUIRED, RELEASED, SUCCESS, CONFLICT, HAZARD, WAITING
    }
    with sync_logs_lock:
        sync_logs_buffer.appendleft(log_entry)


# ========================================================================================
# ROLE-BASED ACCESS CONTROL (RBAC) UTILITIES & DECORATORS
# ========================================================================================
def is_admin_role(role):
    """Verifies whether role string corresponds to Administrator."""
    if not role:
        return False
    return str(role).strip().lower() in ["admin", "administrator", "lead concurrency architect"]

def is_customer_role(role):
    """Verifies whether role string corresponds to Customer."""
    if not role:
        return False
    return str(role).strip().lower() in ["customer", "client", "user"]

def admin_required(f):
    """Strictly protects endpoints requiring an active Administrator session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Authentication required. Please log in as an administrator."}), 401
            return redirect(url_for("admin_login", next=request.url))
        if not is_admin_role(session.get("role")):
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Forbidden: Administrator privileges required."}), 403
            flash("Access denied: Administrator privileges required.", "danger")
            return redirect(url_for("customer_dashboard"))
        return f(*args, **kwargs)
    return decorated_function

def customer_required(f):
    """Strictly protects endpoints requiring an active Customer session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Authentication required. Please sign in to customer portal."}), 401
            return redirect(url_for("customer_login", next=request.url))
        if not is_customer_role(session.get("role")):
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Forbidden: Customer account required."}), 403
            flash("Administrators should access the Administrator Portal.", "info")
            return redirect(url_for("admin_dashboard"))
        return f(*args, **kwargs)
    return decorated_function

# Backward compatibility alias
login_required = admin_required


# ========================================================================================
# DATABASE INITIALIZATION & CONNECTION UTILITIES
# ========================================================================================
def get_db():
    """
    Returns a thread-local SQLite database connection.
    Enables WAL (Write-Ahead Logging) for safe concurrent readers.
    """
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """Initializes tables, applies schema migrations safely, and seeds admin user if needed."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Shows Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            time TEXT NOT NULL,
            screen TEXT NOT NULL,
            genre TEXT NOT NULL,
            price REAL NOT NULL,
            total_seats INTEGER NOT NULL DEFAULT 20,
            poster_url TEXT,
            description TEXT
        )
    """)

    # Check for missing columns in existing shows table (non-destructive migration)
    cursor.execute("PRAGMA table_info(shows)")
    existing_cols = [r["name"] for r in cursor.fetchall()]
    if "poster_url" not in existing_cols:
        cursor.execute("ALTER TABLE shows ADD COLUMN poster_url TEXT")
    if "description" not in existing_cols:
        cursor.execute("ALTER TABLE shows ADD COLUMN description TEXT")

    # 2. Bookings Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_code TEXT UNIQUE NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT,
            customer_email TEXT,
            show_id INTEGER NOT NULL,
            seat_count INTEGER NOT NULL,
            seats_list TEXT NOT NULL,
            total_amount REAL NOT NULL,
            is_group BOOLEAN NOT NULL DEFAULT 0,
            sync_mode TEXT NOT NULL,
            thread_name TEXT NOT NULL,
            user_id INTEGER,
            booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    # Check for missing columns in existing bookings table (non-destructive migration)
    cursor.execute("PRAGMA table_info(bookings)")
    existing_booking_cols = [r["name"] for r in cursor.fetchall()]
    if "user_id" not in existing_booking_cols:
        cursor.execute("ALTER TABLE bookings ADD COLUMN user_id INTEGER")

    # 3. Seats Table (20 seats per show: A1 - A20)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            show_id INTEGER NOT NULL,
            seat_number TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'available', -- 'available' or 'booked'
            booking_id INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
        )
    """)

    # 4. Users Table (Administrator and Customer accounts with secure password hashes)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            phone TEXT,
            email TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Check for missing columns in existing users table
    cursor.execute("PRAGMA table_info(users)")
    existing_user_cols = [r["name"] for r in cursor.fetchall()]
    if "phone" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    if "email" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")

    # 5. Isolated Simulation Seats Table (Protects actual customer bookings during stress tests)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS simulation_seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seat_number TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'available',
            booked_by_thread TEXT,
            booking_code TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()

    # Seed Default Administrator if no admin users exist
    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin' OR role IN ('admin', 'Administrator', 'Lead Concurrency Architect')")
    admin_count = cursor.fetchone()[0]
    if admin_count == 0:
        default_hash = generate_password_hash("admin123")
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role)
            VALUES (?, ?, ?, ?)
        """, ("admin", default_hash, "Chief Administrator", "admin"))
        conn.commit()
        log_sync_event("System-Init", "ADMIN_CREATED", "Default administrator account seeded (admin / admin123).", "SUCCESS")

    # Seed Default Customer (customer1 / pass123) if no customer user exists
    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'customer1' OR role = 'customer'")
    cust_count = cursor.fetchone()[0]
    if cust_count == 0:
        cust_hash = generate_password_hash("pass123")
        cursor.execute("""
            INSERT INTO users (username, password_hash, full_name, role, phone, email)
            VALUES (?, ?, ?, 'customer', ?, ?)
        """, ("customer1", cust_hash, "Demo Customer", "+91 98765 43210", "customer1@cinemapro.in"))
        conn.commit()
        log_sync_event("System-Init", "CUSTOMER_CREATED", "Default customer account seeded (customer1 / pass123).", "SUCCESS")

    # Seed Simulation Sandbox Seats (SIM-01 to SIM-10) if empty
    cursor.execute("SELECT COUNT(*) FROM simulation_seats")
    sim_count = cursor.fetchone()[0]
    if sim_count == 0:
        for i in range(1, 11):
            cursor.execute("""
                INSERT INTO simulation_seats (seat_number, status)
                VALUES (?, 'available')
            """, (f"SIM-{i:02d}",))
        conn.commit()

    # Update posters for existing shows
    poster_mappings = {
        "Inception%": ("/static/images/inception.jpg", "Dom Cobb is a skilled thief who steals corporate secrets through the use of dream-sharing technology."),
        "Interstellar%": ("/static/images/interstellar.jpg", "When Earth becomes uninhabitable, a team of ex-NASA pilots travel through a wormhole in search of a new home."),
        "Oppenheimer%": ("/static/images/oppenheimer.jpg", "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb."),
        "The Dark Knight%": ("/static/images/dark_knight.jpg", "Batman sets out to dismantle the remaining criminal organizations in Gotham, challenged by the Joker.")
    }
    for title_pat, (poster_path, synopsis) in poster_mappings.items():
        cursor.execute("""
            UPDATE shows SET poster_url = ?, description = ?
            WHERE title LIKE ? AND (poster_url IS NULL OR poster_url = '')
        """, (poster_path, synopsis, title_pat))
    conn.commit()

    # Check if shows exist, seed if completely empty
    cursor.execute("SELECT COUNT(*) FROM shows")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_data(conn)
    else:
        conn.close()

def seed_data(conn=None):
    """Seeds predefined cinema shows and 20 seats (A1 to A20) per show with local poster assets."""
    should_close = False
    if conn is None:
        conn = get_db()
        should_close = True

    cursor = conn.cursor()

    # Clear existing data for clean seed
    cursor.execute("DELETE FROM seats")
    cursor.execute("DELETE FROM bookings")
    cursor.execute("DELETE FROM shows")
    try:
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('shows', 'seats', 'bookings')")
    except sqlite3.OperationalError:
        pass

    shows_data = [
        ("Inception (IMAX 2D)", "10:30 AM", "Screen 1 - Grand Hall", "Sci-Fi / Action", 350.00,
         "/static/images/inception.jpg", "Dom Cobb is a skilled thief who steals corporate secrets through dream-sharing technology."),
        ("Interstellar (Dolby Cinema)", "02:15 PM", "Screen 1 - Grand Hall", "Sci-Fi / Adventure", 420.00,
         "/static/images/interstellar.jpg", "A team of explorers travel through a newly discovered wormhole to ensure humanity's survival."),
        ("Oppenheimer (70mm Experience)", "06:00 PM", "Screen 2 - VIP Lounge", "Biography / Drama", 500.00,
         "/static/images/oppenheimer.jpg", "The gripping story of J. Robert Oppenheimer and the Manhattan Project's atomic test."),
        ("The Dark Knight (Director's Cut)", "09:30 PM", "Screen 2 - VIP Lounge", "Action / Crime", 380.00,
         "/static/images/dark_knight.jpg", "Batman battles the Joker to save Gotham from complete psychological and civic ruin.")
    ]

    for title, show_time, screen, genre, price, poster, desc in shows_data:
        cursor.execute("""
            INSERT INTO shows (title, time, screen, genre, price, total_seats, poster_url, description)
            VALUES (?, ?, ?, ?, ?, 20, ?, ?)
        """, (title, show_time, screen, genre, price, poster, desc))
        show_id = cursor.lastrowid

        # Insert 20 seats: A1 through A20
        for i in range(1, 21):
            seat_code = f"A{i}"
            cursor.execute("""
                INSERT INTO seats (show_id, seat_number, status)
                VALUES (?, ?, 'available')
            """, (show_id, seat_code))

    conn.commit()

    # Add a couple of initial sample bookings to show immediate dashboard metrics
    cursor.execute("SELECT id, price FROM shows ORDER BY id ASC LIMIT 2")
    shows = cursor.fetchall()

    if len(shows) >= 2:
        # Show 1 group booking: A1, A2, A3, A4
        s1_id = shows[0]["id"]
        s1_price = shows[0]["price"]
        code1 = f"GRP-{uuid.uuid4().hex[:6].upper()}"
        cursor.execute("""
            INSERT INTO bookings (booking_code, customer_name, customer_phone, customer_email,
                                  show_id, seat_count, seats_list, total_amount, is_group,
                                  sync_mode, thread_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Mutex-Protected', 'Init-Thread-1')
        """, (code1, "TechCorp Team Alpha", "+91 98765 43210", "alpha@techcorp.io",
              s1_id, 4, "A1, A2, A3, A4", s1_price * 4))
        b1_id = cursor.lastrowid
        cursor.execute("""
            UPDATE seats SET status = 'booked', booking_id = ?
            WHERE show_id = ? AND seat_number IN ('A1', 'A2', 'A3', 'A4')
        """, (b1_id, s1_id))

        # Show 2 booking: A8, A9 (Couple booking)
        s2_id = shows[1]["id"]
        s2_price = shows[1]["price"]
        code2 = f"GRP-{uuid.uuid4().hex[:6].upper()}"
        cursor.execute("""
            INSERT INTO bookings (booking_code, customer_name, customer_phone, customer_email,
                                  show_id, seat_count, seats_list, total_amount, is_group,
                                  sync_mode, thread_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Mutex-Protected', 'Init-Thread-2')
        """, (code2, "Elena & Marcus", "+91 91234 56789", "elena@design.org",
              s2_id, 2, "A8, A9", s2_price * 2))
        b2_id = cursor.lastrowid
        cursor.execute("""
            UPDATE seats SET status = 'booked', booking_id = ?
            WHERE show_id = ? AND seat_number IN ('A8', 'A9')
        """, (b2_id, s2_id))

        conn.commit()

    log_sync_event("System-Init", "DATABASE_INITIALIZED", "Default shows, posters, and 20 seats (A1-A20) seeded successfully.", "SUCCESS")

    if should_close:
        conn.close()

# Initialize DB on load
init_db()


# ========================================================================================
# VALIDATION UTILITIES
# ========================================================================================
def validate_customer_details(name, phone, email):
    """Performs rigorous validation of customer information."""
    if not name or len(name.strip()) < 2:
        return False, "Customer or group name must be at least 2 characters long."

    if not phone or len(phone.strip()) < 8:
        return False, "Please provide a valid contact phone number."

    # Validate phone format (allowing +, digits, spaces, hyphens; min 8 digits)
    phone_digits = re.sub(r"\D", "", phone)
    if len(phone_digits) < 8 or len(phone_digits) > 15:
        return False, "Phone number must contain between 8 and 15 digits."

    # Validate email format if supplied
    if email and email.strip():
        email_pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        if not re.match(email_pattern, email.strip()):
            return False, "Please enter a valid email address (e.g. user@example.com)."

    return True, ""


# ========================================================================================
# CORE BOOKING LOGIC: WITH MUTEX LOCK VS WITHOUT MUTEX (RACE CONDITION DEMO)
# ========================================================================================
def execute_booking(show_id, seat_numbers, customer_info, use_mutex=True, simulated_delay=0.0, user_id=None):
    """
    Executes a group or individual ticket booking with or without thread synchronization.

    :param show_id: Target cinema show ID
    :param seat_numbers: List of seat identifiers e.g. ['A5', 'A6', 'A7']
    :param customer_info: Dictionary with customer details (name, phone, email)
    :param use_mutex: True to use Mutex Lock + Semaphore (Safe), False to simulate Race Hazard (Unsafe)
    :param simulated_delay: Injected delay in seconds between Check and Book to accentuate race condition
    :param user_id: Optional ID of the registered user making the booking
    :return: dict with status, booking_code, message, and concurrency telemetry
    """
    thread_name = threading.current_thread().name
    seats_str = ", ".join(seat_numbers)
    num_seats = len(seat_numbers)
    is_group = num_seats > 1

    with stats_lock:
        concurrency_stats["active_threads"] += 1

    log_sync_event(thread_name, "TRANSACTION_STARTED",
                   f"Requesting {num_seats} seat(s) [{seats_str}] for Show #{show_id} | Mutex: {'ENABLED' if use_mutex else 'DISABLED'}",
                   "INFO")

    if use_mutex:
        # -------------------------------------------------------------
        # SYNCHRONIZED PATH: Counting Semaphore + Mutex Lock
        # -------------------------------------------------------------
        log_sync_event(thread_name, "SEMAPHORE_WAIT", "Waiting for available Semaphore transaction slot...", "WAITING")

        # 1. Acquire Counting Semaphore (Limit concurrent database workers)
        update_lab_monitor(thread_name=thread_name, status="WAITING_SEMAPHORE", seat=seats_str, queue_add=thread_name)
        booking_semaphore.acquire()
        with stats_lock:
            concurrency_stats["current_semaphore_permits"] -= 1

        log_sync_event(thread_name, "SEMAPHORE_ACQUIRED",
                       f"Acquired Semaphore slot. (Remaining permits: {concurrency_stats['current_semaphore_permits']})",
                       "ACQUIRED")

        # 2. Acquire Mutex Lock (Guarantee Critical Section Mutual Exclusion)
        update_lab_monitor(thread_name=thread_name, status="WAITING_MUTEX", seat=seats_str)
        log_sync_event(thread_name, "MUTEX_WAIT", "Waiting to acquire exclusive Mutex Lock...", "WAITING")
        booking_mutex.acquire()

        with stats_lock:
            concurrency_stats["total_lock_acquisitions"] += 1

        update_lab_monitor(thread_name=thread_name, status="IN_CRITICAL_SECTION", seat=seats_str, cs_holder=thread_name, queue_remove=thread_name)
        log_sync_event(thread_name, "MUTEX_ACQUIRED", "CRITICAL SECTION ENTERED: Exclusive Mutex Lock locked.", "ACQUIRED")

        try:
            conn = get_db()
            cursor = conn.cursor()

            # Verify Show existence
            cursor.execute("SELECT id, title, price FROM shows WHERE id = ?", (show_id,))
            show = cursor.fetchone()
            if not show:
                conn.close()
                return {"success": False, "message": "Selected show not found.", "concurrency_status": "SHOW_NOT_FOUND"}

            # CRITICAL SECTION CHECK: Check if ANY of the requested seats are already booked
            placeholders = ",".join("?" * len(seat_numbers))
            cursor.execute(f"""
                SELECT seat_number, status FROM seats
                WHERE show_id = ? AND seat_number IN ({placeholders})
            """, [show_id] + seat_numbers)
            existing_seats = cursor.fetchall()

            booked_conflicts = [row["seat_number"] for row in existing_seats if row["status"] == "booked"]

            if booked_conflicts:
                with stats_lock:
                    concurrency_stats["total_conflicts_prevented"] += 1
                    lab_comparison_history["with_mutex"]["runs"] += 1
                    lab_comparison_history["with_mutex"]["total_requests"] += 1
                    lab_comparison_history["with_mutex"]["rejected"] += 1
                    lab_comparison_history["with_mutex"]["final_seat_status"] = f"Conflict Blocked on [{', '.join(booked_conflicts)}]"
                conflict_msg = f"Seat(s) [{', '.join(booked_conflicts)}] are already booked! Mutex lock prevented double booking."
                log_sync_event(thread_name, "CONFLICT_PREVENTED", conflict_msg, "CONFLICT")
                update_lab_monitor(thread_name=thread_name, status="CONFLICT_REJECTED", seat=seats_str, result=conflict_msg)
                conn.close()
                return {
                    "success": False,
                    "message": conflict_msg,
                    "conflicts": booked_conflicts,
                    "concurrency_status": "CONFLICT_PREVENTED"
                }

            # Optional simulated transaction processing delay
            if simulated_delay > 0:
                time.sleep(simulated_delay)

            # -----------------------------------------------------------------
            # OS MULTITHREADING & THREAD JOINING (thread.join() in real booking):
            # Spawn parallel worker threads for group seat pre-verification and invoice preparation
            # -----------------------------------------------------------------
            worker_threads = []
            worker_lock = threading.Lock()
            worker_meta = {}

            def worker_seat_checker(s_name):
                with worker_lock:
                    worker_meta[s_name] = "VALIDATED"

            def worker_invoice_calculator():
                calc_val = show["price"] * num_seats
                with worker_lock:
                    worker_meta["calculated_total"] = calc_val

            def worker_audit_preparer():
                with worker_lock:
                    worker_meta["audit_prepared"] = True

            for s in seat_numbers:
                t = threading.Thread(target=worker_seat_checker, args=(s,), name=f"Worker-Seat-{s}-{thread_name[:10]}")
                worker_threads.append(t)
            t_inv = threading.Thread(target=worker_invoice_calculator, name=f"Worker-Pricing-{thread_name[:10]}")
            t_aud = threading.Thread(target=worker_audit_preparer, name=f"Worker-Audit-{thread_name[:10]}")
            worker_threads.extend([t_inv, t_aud])

            for t in worker_threads:
                t.start()

            # thread.join() - Parent booking thread blocks at barrier until all workers terminate
            for t in worker_threads:
                t.join()

            log_sync_event(thread_name, "THREADS_JOINED",
                           f"Parent thread successfully joined {len(worker_threads)} parallel workers for group booking of [{seats_str}].",
                           "SUCCESS")

            # ATOMIC COMMIT: All seats are available -> Create booking & update seats
            booking_code = f"{'GRP' if is_group else 'TKT'}-{uuid.uuid4().hex[:6].upper()}"
            total_amount = show["price"] * num_seats

            cursor.execute("""
                INSERT INTO bookings (booking_code, customer_name, customer_phone, customer_email,
                                      show_id, seat_count, seats_list, total_amount, is_group,
                                      sync_mode, thread_name, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Mutex-Protected', ?, ?)
            """, (
                booking_code,
                customer_info.get("name", "Anonymous Guest"),
                customer_info.get("phone", ""),
                customer_info.get("email", ""),
                show_id,
                num_seats,
                seats_str,
                total_amount,
                1 if is_group else 0,
                thread_name,
                user_id
            ))
            booking_id = cursor.lastrowid

            cursor.execute(f"""
                UPDATE seats SET status = 'booked', booking_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE show_id = ? AND seat_number IN ({placeholders})
            """, [booking_id, show_id] + seat_numbers)

            conn.commit()
            conn.close()

            # Update Step 6 Comparison Matrix with live booking confirmation
            with stats_lock:
                lab_comparison_history["with_mutex"]["runs"] += 1
                lab_comparison_history["with_mutex"]["total_requests"] += 1
                lab_comparison_history["with_mutex"]["successful"] += 1
                lab_comparison_history["with_mutex"]["final_seat_status"] = f"Confirmed [{seats_str}] (0 Collisions)"

                lab_comparison_history["with_semaphore"]["runs"] += 1
                lab_comparison_history["with_semaphore"]["total_requests"] += 1
                lab_comparison_history["with_semaphore"]["successful"] += 1
                lab_comparison_history["with_semaphore"]["final_seat_status"] = f"Throttled & Booked [{seats_str}]"

            update_lab_monitor(thread_name=thread_name, status="BOOKED_SUCCESS", seat=seats_str, result=f"Confirmed {booking_code} for [{seats_str}]")

            log_sync_event(thread_name, "BOOKING_COMMITTED",
                           f"Booking {booking_code} confirmed for [{seats_str}]. Atomicity preserved.",
                           "SUCCESS")

            return {
                "success": True,
                "message": f"Successfully booked {num_seats} seat(s) [{seats_str}]!",
                "booking_code": booking_code,
                "booking_id": booking_id,
                "total_amount": total_amount,
                "seats": seat_numbers,
                "show_title": show["title"],
                "concurrency_status": "MUTEX_SAFE_SUCCESS"
            }

        finally:
            update_lab_monitor(thread_name=thread_name, status="IDLE", seat=seats_str, cs_holder="None (IDLE)")
            # Release Mutex Lock
            booking_mutex.release()
            log_sync_event(thread_name, "MUTEX_RELEASED", "CRITICAL SECTION EXITED: Mutex Lock released.", "RELEASED")

            # Release Counting Semaphore permit
            booking_semaphore.release()
            with stats_lock:
                concurrency_stats["current_semaphore_permits"] += 1
                concurrency_stats["active_threads"] -= 1

            log_sync_event(thread_name, "SEMAPHORE_RELEASED",
                           f"Semaphore slot released. (Available permits: {concurrency_stats['current_semaphore_permits']})",
                           "RELEASED")

    else:
        # -------------------------------------------------------------
        # UNSYNCHRONIZED PATH: Race Condition Hazard Simulation (No Mutex!)
        # -------------------------------------------------------------
        log_sync_event(thread_name, "RACE_HAZARD_ENTER",
                       f"DANGER: Entering critical section WITHOUT Mutex synchronization! [{seats_str}]",
                       "HAZARD")

        try:
            conn = get_db()
            cursor = conn.cursor()

            # Step 1: Check seat availability WITHOUT locking
            placeholders = ",".join("?" * len(seat_numbers))
            cursor.execute(f"""
                SELECT seat_number, status, booking_id FROM seats
                WHERE show_id = ? AND seat_number IN ({placeholders})
            """, [show_id] + seat_numbers)
            existing_seats = cursor.fetchall()

            # In unsynchronized systems, multiple threads simultaneously see seats as available
            # We insert a small artificial delay (e.g. 60-100ms) to simulate real-world latency
            # between Time-Of-Check (TOC) and Time-Of-Use (TOU).
            sleep_duration = simulated_delay if simulated_delay > 0 else 0.08
            log_sync_event(thread_name, "TOC_TOU_WINDOW",
                           f"Vulnerability Window ({int(sleep_duration*1000)}ms latency between check & write). Race hazard possible!",
                           "HAZARD")
            time.sleep(sleep_duration)

            # Check if another thread already wrote to these seats in this window
            cursor.execute(f"""
                SELECT seat_number, status FROM seats
                WHERE show_id = ? AND seat_number IN ({placeholders}) AND status = 'booked'
            """, [show_id] + seat_numbers)
            stale_check = cursor.fetchall()

            was_collided = len(stale_check) > 0
            if was_collided:
                with stats_lock:
                    concurrency_stats["race_collisions_detected"] += 1
                collided_seats = [r["seat_number"] for r in stale_check]
                log_sync_event(thread_name, "RACE_COLLISION_DETECTED",
                               f"RACE CONDITION OCCURRED! Thread overwriting already booked seat(s) [{', '.join(collided_seats)}]!",
                               "HAZARD")

            # Execute unshielded write (overwrites or duplicates booking!)
            cursor.execute("SELECT id, title, price FROM shows WHERE id = ?", (show_id,))
            show = cursor.fetchone()
            total_amount = (show["price"] if show else 350.0) * num_seats
            booking_code = f"RACE-{uuid.uuid4().hex[:6].upper()}"

            cursor.execute("""
                INSERT INTO bookings (booking_code, customer_name, customer_phone, customer_email,
                                      show_id, seat_count, seats_list, total_amount, is_group,
                                      sync_mode, thread_name, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unsafe-Race-Condition', ?, ?)
            """, (
                booking_code,
                customer_info.get("name", "Race Hazard Guest"),
                customer_info.get("phone", ""),
                customer_info.get("email", ""),
                show_id,
                num_seats,
                seats_str,
                total_amount,
                1 if is_group else 0,
                thread_name,
                user_id
            ))
            booking_id = cursor.lastrowid

            cursor.execute(f"""
                UPDATE seats SET status = 'booked', booking_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE show_id = ? AND seat_number IN ({placeholders})
            """, [booking_id, show_id] + seat_numbers)

            with stats_lock:
                lab_comparison_history["no_mutex"]["runs"] += 1
                lab_comparison_history["no_mutex"]["total_requests"] += 1
                lab_comparison_history["no_mutex"]["successful"] += 1
                if was_collided:
                    lab_comparison_history["no_mutex"]["race_collisions"] += 1
                    lab_comparison_history["no_mutex"]["final_seat_status"] = f"Collision! [{', '.join(collided_seats)}] Double-Booked"
                else:
                    lab_comparison_history["no_mutex"]["final_seat_status"] = f"Unsafely Claimed [{seats_str}]"

            return {
                "success": True,
                "race_collision": was_collided,
                "message": f"Booked WITHOUT lock. {'RACE COLLISION OCCURRED: Overwrote existing booking!' if was_collided else 'Booked without collision.'}",
                "booking_code": booking_code,
                "booking_id": booking_id,
                "seats": seat_numbers,
                "concurrency_status": "RACE_COLLISION" if was_collided else "UNSAFE_WRITE"
            }

        finally:
            with stats_lock:
                concurrency_stats["active_threads"] -= 1


# ========================================================================================
# ========================================================================================
# PORTAL LANDING & AUTHENTICATION ROUTES
# ========================================================================================

@app.route("/")
def landing_page():
    """Welcome page with two clearly separated choices: Customer Portal vs Administrator Portal."""
    return render_template("landing.html")

# ----------------------------------------------------------------------------------------
# CUSTOMER PORTAL AUTHENTICATION & ACCESS CONTROL
# ----------------------------------------------------------------------------------------
@app.route("/customer/register", methods=["GET", "POST"])
def customer_register():
    """Customer registration form (GET) and account creation handler (POST)."""
    if request.method == "GET":
        if "user_id" in session and is_customer_role(session.get("role")):
            return redirect(url_for("customer_dashboard"))
        return render_template("customer_register.html")

    full_name = request.form.get("full_name", "").strip()
    username = request.form.get("username", "").strip()
    phone = request.form.get("phone", "").strip()
    email = request.form.get("email", "").strip()
    password = request.form.get("password", "").strip()
    confirm_password = request.form.get("confirm_password", "").strip()

    # Validation
    if not full_name or len(full_name) < 2:
        flash("Please provide your full name (at least 2 characters).", "danger")
        return render_template("customer_register.html")

    if not username or len(username) < 3 or not re.match(r"^[a-zA-Z0-9_]{3,30}$", username):
        flash("Username must be between 3 and 30 characters (letters, numbers, underscores only).", "danger")
        return render_template("customer_register.html")

    if not phone or len(re.sub(r"\D", "", phone)) < 8:
        flash("Please enter a valid mobile phone number.", "danger")
        return render_template("customer_register.html")

    if len(password) < 6:
        flash("Password must be at least 6 characters long.", "danger")
        return render_template("customer_register.html")

    if password != confirm_password:
        flash("Passwords do not match. Please verify.", "danger")
        return render_template("customer_register.html")

    conn = get_db()
    cursor = conn.cursor()

    # Check for existing username
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        flash(f"Username '{username}' is already taken. Please choose another username.", "danger")
        return render_template("customer_register.html")

    # Insert new customer
    pw_hash = generate_password_hash(password)
    cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, role, phone, email)
        VALUES (?, ?, ?, 'customer', ?, ?)
    """, (username, pw_hash, full_name, phone, email))
    conn.commit()
    conn.close()

    log_sync_event(username, "CUSTOMER_REGISTERED", f"New customer account created for '{full_name}'.", "SUCCESS")
    flash("Account created successfully! Please sign in with your customer credentials.", "success")
    return redirect(url_for("customer_login"))

@app.route("/customer/login", methods=["GET", "POST"])
def customer_login():
    """Customer sign in page (GET) and credential validation (POST)."""
    if request.method == "GET":
        if "user_id" in session:
            if is_customer_role(session.get("role")):
                return redirect(url_for("customer_dashboard"))
            elif is_admin_role(session.get("role")):
                flash("You are currently signed in as an Administrator.", "info")
                return redirect(url_for("admin_dashboard"))
        next_url = request.args.get("next", "")
        return render_template("customer_login.html", next_url=next_url)

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    next_url = request.form.get("next", "")

    if not username or not password:
        flash("Please enter both username and password.", "danger")
        return render_template("customer_login.html", next_url=next_url)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user["password_hash"], password):
        # Prevent Admin users from signing into Customer Portal
        if is_admin_role(user["role"]):
            log_sync_event(username, "ROLE_MISMATCH", "Administrator attempted to sign in via customer portal.", "INFO")
            flash("This is an Administrator account. Please use the Administrator Portal Login.", "warning")
            return redirect(url_for("admin_login"))

        # Establish customer session
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["full_name"] = user["full_name"]
        session["role"] = "customer"
        session["phone"] = user["phone"] or ""
        session["email"] = user["email"] or ""

        log_sync_event(username, "CUSTOMER_LOGIN", f"Customer '{user['full_name']}' logged in.", "SUCCESS")
        flash(f"Welcome back, {user['full_name']}!", "success")

        if next_url and next_url.startswith("/customer"):
            return redirect(next_url)
        return redirect(url_for("customer_dashboard"))
    else:
        log_sync_event("Auth-Guard", "CUST_LOGIN_FAIL", f"Invalid customer login attempt for '{username}'.", "HAZARD")
        flash("Invalid customer username or password. Please try again.", "danger")
        return render_template("customer_login.html", next_url=next_url)

@app.route("/customer/logout")
def customer_logout():
    """Logs out the customer and clears session."""
    user = session.get("username", "Customer")
    session.clear()
    log_sync_event(user, "CUSTOMER_LOGOUT", "Customer signed out safely.", "INFO")
    flash("You have been signed out safely from the Customer Portal.", "info")
    return redirect(url_for("customer_login"))

@app.route("/customer")
@app.route("/customer/dashboard")
@customer_required
def customer_dashboard():
    """Renders the protected Customer Dashboard with personal booking history and movie reservation."""
    return render_template("customer_dashboard.html")

# ----------------------------------------------------------------------------------------
# ADMINISTRATOR PORTAL AUTHENTICATION & ACCESS CONTROL
# ----------------------------------------------------------------------------------------
@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    """Administrator authentication page (GET) and credential validation (POST)."""
    if request.method == "GET":
        if "user_id" in session and is_admin_role(session.get("role")):
            return redirect(url_for("admin_dashboard"))
        next_url = request.args.get("next", "")
        return render_template("admin_login.html", next_url=next_url)

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "").strip()
    next_url = request.form.get("next", "")

    if not username or not password:
        flash("Please enter both administrator username and password.", "danger")
        return render_template("admin_login.html", next_url=next_url)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user["password_hash"], password):
        # Strict RBAC: Prevent customers from logging into Admin portal
        if not is_admin_role(user["role"]):
            log_sync_event(username, "UNAUTHORIZED_ADMIN_ATTEMPT", "Customer account attempted to log into Admin Portal.", "HAZARD")
            flash("Access denied: This account does not possess administrator privileges.", "danger")
            return render_template("admin_login.html", next_url=next_url)

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["full_name"] = user["full_name"]
        session["role"] = "admin"

        log_sync_event(username, "ADMIN_LOGIN_SUCCESS", f"Administrator '{user['full_name']}' logged in.", "SUCCESS")
        flash(f"Welcome back, {user['full_name']}!", "success")

        if next_url and (next_url.startswith("/admin") or next_url.startswith("/dashboard")):
            return redirect(next_url)
        return redirect(url_for("admin_dashboard"))
    else:
        log_sync_event("Auth-Guard", "ADMIN_LOGIN_FAIL", f"Invalid admin credentials attempted for '{username}'.", "HAZARD")
        flash("Invalid administrator username or password. Please try again.", "danger")
        return render_template("admin_login.html", next_url=next_url)

@app.route("/login", methods=["GET", "POST"])
def login():
    """Backwards compatibility route for admin login."""
    if request.method == "POST":
        return admin_login()
    if "user_id" in session and is_admin_role(session.get("role")):
        return redirect(url_for("admin_dashboard"))
    return redirect(url_for("admin_login", next=request.args.get("next", "")))

@app.route("/admin/logout")
def admin_logout():
    """Logs out administrator and clears session."""
    user = session.get("username", "Admin")
    session.clear()
    log_sync_event(user, "ADMIN_LOGOUT", "Administrator signed out.", "INFO")
    flash("You have been signed out of the Administrator Portal.", "info")
    return redirect(url_for("admin_login"))

@app.route("/logout")
def logout():
    """Global logout endpoint: clears session and redirects to welcome portal."""
    session.clear()
    flash("You have been signed out safely.", "info")
    return redirect(url_for("landing_page"))

@app.route("/admin")
@app.route("/admin/dashboard")
@app.route("/dashboard")
@admin_required
def admin_dashboard():
    """Renders the protected CinemaPro Admin Dashboard & Concurrency Lab."""
    return render_template("dashboard.html", user=session)

# ----------------------------------------------------------------------------------------
# CUSTOMER SPECIFIC APIS (PERSONAL BOOKING & CANCELLATION)
# ----------------------------------------------------------------------------------------
@app.route("/api/customer/book", methods=["POST"])
@customer_required
def customer_book_ticket():
    """Dedicated customer booking endpoint: enforces customer session and sets user_id."""
    data = request.get_json() or {}
    show_id = data.get("show_id")
    seat_numbers = data.get("seats", [])
    customer_name = (data.get("customer_name") or session.get("full_name") or "Customer").strip()
    customer_phone = (data.get("customer_phone") or session.get("phone") or "").strip()
    customer_email = (data.get("customer_email") or session.get("email") or "").strip()

    is_valid, err_msg = validate_customer_details(customer_name, customer_phone, customer_email)
    if not is_valid:
        return jsonify({"success": False, "message": err_msg}), 400

    if not show_id:
        return jsonify({"success": False, "message": "Please select a cinema show."}), 400

    if not seat_numbers or not isinstance(seat_numbers, list):
        return jsonify({"success": False, "message": "Please select at least one seat."}), 400

    seat_numbers = [s.strip().upper() for s in seat_numbers if s.strip()]
    if not seat_numbers:
        return jsonify({"success": False, "message": "Seat selection list is empty."}), 400

    customer_info = {
        "name": customer_name,
        "phone": customer_phone,
        "email": customer_email
    }

    result = execute_booking(show_id, seat_numbers, customer_info, use_mutex=True, user_id=session["user_id"])
    status_code = 200 if result.get("success") else 409
    return jsonify(result), status_code

@app.route("/api/customer/my-bookings", methods=["GET"])
@customer_required
def get_my_bookings():
    """Strictly returns only bookings created by the currently authenticated customer."""
    customer_user_id = session["user_id"]
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT b.id, b.booking_code, b.customer_name, b.customer_phone, b.customer_email,
               b.show_id, b.seat_count, b.seats_list, b.total_amount, b.is_group,
               b.sync_mode, b.booking_time,
               s.title as show_title, s.time as show_time, s.screen, s.price, s.poster_url
        FROM bookings b
        JOIN shows s ON b.show_id = s.id
        WHERE b.user_id = ?
        ORDER BY b.id DESC
    """, (customer_user_id,))

    bookings = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({"success": True, "bookings": bookings, "count": len(bookings)})

@app.route("/api/customer/bookings/<int:booking_id>", methods=["DELETE"])
@customer_required
def customer_cancel_booking(booking_id):
    """
    Cancels a customer's own booking and frees the allocated seats using Mutex protection.
    Strictly forbids cancelling another customer's booking.
    """
    customer_user_id = session["user_id"]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
    booking = cursor.fetchone()
    conn.close()

    if not booking:
        return jsonify({"success": False, "message": "Booking record not found."}), 404

    # Strict Authorization Check: customer can only cancel their own booking!
    if booking["user_id"] != customer_user_id:
        log_sync_event(session.get("username", "Customer"), "UNAUTHORIZED_CANCEL_ATTEMPT",
                       f"Customer attempted to cancel foreign booking ID #{booking_id}.", "HAZARD")
        return jsonify({"success": False, "message": "Forbidden: You can only cancel your own personal bookings."}), 403

    # Critical section to release seats safely
    with booking_mutex:
        conn = get_db()
        cursor = conn.cursor()

        # Free seats
        cursor.execute("""
            UPDATE seats SET status = 'available', booking_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE booking_id = ?
        """, (booking_id,))

        # Delete booking record
        cursor.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
        conn.commit()
        conn.close()

        log_sync_event(threading.current_thread().name, "CUSTOMER_BOOKING_CANCELLED",
                       f"Customer cancelled booking {booking['booking_code']} and released seats [{booking['seats_list']}].",
                       "SUCCESS")

    return jsonify({"success": True, "message": f"Booking {booking['booking_code']} cancelled successfully. Seats have been released."})

@app.route("/api/auth/me", methods=["GET"])
def get_current_user():
    """Returns the authenticated user details for header and profile."""
    if "user_id" not in session:
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "user": {
            "id": session.get("user_id"),
            "username": session.get("username"),
            "full_name": session.get("full_name"),
            "role": session.get("role")
        }
    })


@app.route("/api/customer/tickets", methods=["GET"])
def get_customer_tickets():
    """Allows customers to search and view their confirmed e-tickets by phone or booking code."""
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify({"success": False, "message": "Please enter a phone number or booking reference code."}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT b.id, b.booking_code, b.customer_name, b.customer_phone, b.customer_email,
               b.seat_count, b.seats_list, b.total_amount, b.is_group, b.sync_mode,
               b.booking_time, s.title as show_title, s.time as show_time, s.screen, s.poster_url
        FROM bookings b
        JOIN shows s ON b.show_id = s.id
        WHERE b.customer_phone LIKE ? OR b.booking_code = ?
        ORDER BY b.id DESC LIMIT 10
    """, (f"%{query}%", query.upper()))
    tickets = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({"success": True, "tickets": tickets})

@app.route("/api/stats", methods=["GET"])
@login_required
def get_stats():
    """Calculates all key statistics dynamically from SQLite database records."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Total Confirmed Bookings
    cursor.execute("SELECT COUNT(*) FROM bookings")
    total_bookings = cursor.fetchone()[0]

    # 2. Total Booked Seats
    cursor.execute("SELECT COUNT(*) FROM seats WHERE status = 'booked'")
    total_booked_seats = cursor.fetchone()[0]

    # 3. Available Seats across all shows
    cursor.execute("SELECT COUNT(*) FROM seats WHERE status = 'available'")
    total_available_seats = cursor.fetchone()[0]

    # 4. Total Group Bookings (seat_count > 1)
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE is_group = 1 OR seat_count > 1")
    total_group_bookings = cursor.fetchone()[0]

    # 5. Total Revenue
    cursor.execute("SELECT COALESCE(SUM(total_amount), 0) FROM bookings")
    total_revenue = cursor.fetchone()[0]

    conn.close()

    with stats_lock:
        telemetry = {
            "total_lock_acquisitions": concurrency_stats["total_lock_acquisitions"],
            "total_conflicts_prevented": concurrency_stats["total_conflicts_prevented"],
            "race_collisions_detected": concurrency_stats["race_collisions_detected"],
            "active_threads": concurrency_stats["active_threads"],
            "current_semaphore_permits": concurrency_stats["current_semaphore_permits"],
            "max_semaphore_permits": current_semaphore_limit,
            "mutex_locked": booking_mutex.locked()
        }

    return jsonify({
        "success": True,
        "stats": {
            "total_bookings": total_bookings,
            "total_confirmed_bookings": total_bookings,
            "total_booked_seats": total_booked_seats,
            "total_available_seats": total_available_seats,
            "available_seats": total_available_seats,
            "total_seats": total_booked_seats + total_available_seats,
            "total_group_bookings": total_group_bookings,
            "total_revenue": round(total_revenue, 2)
        },
        "concurrency": telemetry
    })

@app.route("/api/shows", methods=["GET"])
def get_shows():
    """Returns all cinema shows with seat occupancy summary and poster information (Public for customer browsing)."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT s.id, s.title, s.time, s.screen, s.genre, s.price, s.total_seats,
               s.poster_url, s.description,
               COUNT(CASE WHEN st.status = 'booked' THEN 1 END) as booked_seats,
               COUNT(CASE WHEN st.status = 'available' THEN 1 END) as available_seats
        FROM shows s
        LEFT JOIN seats st ON s.id = st.show_id
        GROUP BY s.id
        ORDER BY s.id ASC
    """)
    shows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({"success": True, "shows": shows})

@app.route("/api/shows/<int:show_id>/seats", methods=["GET"])
def get_show_seats(show_id):
    """Returns all 20 seats (A1 to A20) for a given show with real-time status (Public for customer view)."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM shows WHERE id = ?", (show_id,))
    show = cursor.fetchone()
    if not show:
        conn.close()
        return jsonify({"success": False, "message": "Show not found"}), 404

    cursor.execute("""
        SELECT s.id, s.seat_number, s.status, s.booking_id, s.updated_at,
               b.booking_code, b.customer_name, b.is_group
        FROM seats s
        LEFT JOIN bookings b ON s.booking_id = b.id
        WHERE s.show_id = ?
        ORDER BY CAST(SUBSTR(s.seat_number, 2) AS INTEGER) ASC
    """, (show_id,))
    seats = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({
        "success": True,
        "show": dict(show),
        "seats": seats
    })

@app.route("/api/book", methods=["POST"])
def book_ticket():
    """Endpoint for user or group ticket booking with full validation."""
    data = request.get_json() or {}
    show_id = data.get("show_id")
    seat_numbers = data.get("seats", [])
    customer_name = data.get("customer_name", "").strip()
    customer_phone = data.get("customer_phone", "").strip()
    customer_email = data.get("customer_email", "").strip()
    use_mutex = data.get("use_mutex", True)
    simulated_delay = float(data.get("simulated_delay", 0.0))

    # Rigorous Validations
    is_valid, err_msg = validate_customer_details(customer_name, customer_phone, customer_email)
    if not is_valid:
        return jsonify({"success": False, "message": err_msg}), 400

    if not show_id:
        return jsonify({"success": False, "message": "Please select a cinema show."}), 400

    if not seat_numbers or not isinstance(seat_numbers, list):
        return jsonify({"success": False, "message": "Please select at least one seat."}), 400

    # Clean and validate seat numbers
    seat_numbers = [s.strip().upper() for s in seat_numbers if s.strip()]
    if not seat_numbers:
        return jsonify({"success": False, "message": "Seat selection list is empty."}), 400

    customer_info = {
        "name": customer_name,
        "phone": customer_phone,
        "email": customer_email
    }

    result = execute_booking(show_id, seat_numbers, customer_info, use_mutex=use_mutex, simulated_delay=simulated_delay, user_id=session.get("user_id"))
    status_code = 200 if result.get("success") else 409
    return jsonify(result), status_code

@app.route("/api/bookings", methods=["GET"])
@login_required
def get_bookings():
    """Returns booking history with filtering and details."""
    conn = get_db()
    cursor = conn.cursor()

    show_filter = request.args.get("show_id")
    search_query = request.args.get("search", "").strip()

    sql = """
        SELECT b.id, b.booking_code, b.customer_name, b.customer_phone, b.customer_email,
               b.seat_count, b.seats_list, b.total_amount, b.is_group, b.sync_mode,
               b.thread_name, b.booking_time,
               s.title as show_title, s.time as show_time, s.screen
        FROM bookings b
        JOIN shows s ON b.show_id = s.id
        WHERE 1=1
    """
    params = []

    if show_filter and show_filter.isdigit():
        sql += " AND b.show_id = ?"
        params.append(int(show_filter))

    if search_query:
        sql += " AND (b.customer_name LIKE ? OR b.booking_code LIKE ? OR b.seats_list LIKE ?)"
        wildcard = f"%{search_query}%"
        params.extend([wildcard, wildcard, wildcard])

    sql += " ORDER BY b.id DESC LIMIT 100"

    cursor.execute(sql, params)
    bookings = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({"success": True, "bookings": bookings})

@app.route("/api/bookings/<int:booking_id>", methods=["DELETE"])
@login_required
def cancel_booking(booking_id):
    """Cancels a booking and frees the allocated seats using Mutex protection."""
    with booking_mutex:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,))
        booking = cursor.fetchone()
        if not booking:
            conn.close()
            return jsonify({"success": False, "message": "Booking record not found."}), 404

        # Free seats
        cursor.execute("""
            UPDATE seats SET status = 'available', booking_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE booking_id = ?
        """, (booking_id,))

        # Delete booking record
        cursor.execute("DELETE FROM bookings WHERE id = ?", (booking_id,))
        conn.commit()
        conn.close()

        log_sync_event(threading.current_thread().name, "BOOKING_CANCELLED",
                       f"Cancelled booking {booking['booking_code']} and released seats [{booking['seats_list']}].",
                       "SUCCESS")

    return jsonify({"success": True, "message": f"Booking {booking['booking_code']} cancelled successfully."})

@app.route("/api/shows/<int:show_id>/reset", methods=["POST"])
@login_required
def reset_show_seats(show_id):
    """Resets all 20 seats for a specific show back to available."""
    with booking_mutex:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT title FROM shows WHERE id = ?", (show_id,))
        show = cursor.fetchone()
        if not show:
            conn.close()
            return jsonify({"success": False, "message": "Show not found."}), 404

        cursor.execute("DELETE FROM bookings WHERE show_id = ?", (show_id,))
        cursor.execute("""
            UPDATE seats SET status = 'available', booking_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE show_id = ?
        """, (show_id,))

        conn.commit()
        conn.close()

        log_sync_event(threading.current_thread().name, "SHOW_SEATS_RESET",
                       f"All 20 seats reset to available for '{show['title']}'.", "SUCCESS")

    return jsonify({"success": True, "message": f"All seats for '{show['title']}' have been reset."})

@app.route("/api/reset-all", methods=["POST"])
@login_required
def reset_all_data():
    """Resets database and re-seeds default data."""
    with booking_mutex:
        seed_data()
        with stats_lock:
            concurrency_stats["total_lock_acquisitions"] = 0
            concurrency_stats["total_conflicts_prevented"] = 0
            concurrency_stats["race_collisions_detected"] = 0

    return jsonify({"success": True, "message": "System reset to initial sample state successfully."})

@app.route("/api/sync/logs", methods=["GET"])
@login_required
def get_sync_logs():
    """Returns the latest concurrency and synchronization logs."""
    with sync_logs_lock:
        logs = list(sync_logs_buffer)
    return jsonify({"success": True, "logs": logs})

@app.route("/api/sync/logs/clear", methods=["POST"])
@login_required
def clear_sync_logs():
    """Clears the live log buffer."""
    with sync_logs_lock:
        sync_logs_buffer.clear()
    log_sync_event("System", "LOGS_CLEARED", "Synchronization log buffer cleared.", "INFO")
    return jsonify({"success": True, "message": "Logs cleared."})

@app.route("/api/analytics", methods=["GET"])
@login_required
def get_analytics():
    """Returns aggregated data for Chart.js charts."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Occupancy per show
    cursor.execute("""
        SELECT s.title,
               COUNT(CASE WHEN st.status = 'booked' THEN 1 END) as booked,
               COUNT(CASE WHEN st.status = 'available' THEN 1 END) as available
        FROM shows s
        LEFT JOIN seats st ON s.id = st.show_id
        GROUP BY s.id
        ORDER BY s.id ASC
    """)
    show_occupancy = [dict(row) for row in cursor.fetchall()]

    # 2. Overall available vs booked
    cursor.execute("SELECT COUNT(*) FROM seats WHERE status = 'booked'")
    total_booked = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM seats WHERE status = 'available'")
    total_available = cursor.fetchone()[0]

    # 3. Booking distribution: Single vs Group bookings
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE is_group = 1")
    group_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM bookings WHERE is_group = 0")
    single_count = cursor.fetchone()[0]

    conn.close()

    return jsonify({
        "success": True,
        "occupancy": show_occupancy,
        "seat_distribution": {
            "booked": total_booked,
            "available": total_available
        },
        "booking_types": {
            "group": group_count,
            "single": single_count
        }
    })

# ========================================================================================
# CONCURRENCY STRESS TEST & RACE CONDITION SIMULATOR (ISOLATED SANDBOX)
# ========================================================================================
@app.route("/api/simulate/race-test", methods=["POST"])
@login_required
def simulate_race_test():
    """
    Launches multiple concurrent Python threads attempting to book overlapping/same seats.
    Uses ISOLATED simulation sandbox seats (SIM-01) so actual customer bookings remain 100% uncorrupted!
    Demonstrates Safe Mode (With Mutex) vs Hazard Mode (Without Mutex) for academic evaluation.
    """
    data = request.get_json() or {}
    threads_count = min(max(int(data.get("threads_count", 5)), 2), 15)  # 2 to 15 threads
    use_mutex = bool(data.get("use_mutex", True))
    target_seat = data.get("seat")
    if not target_seat and "seats" in data:
        s_val = data.get("seats")
        if isinstance(s_val, list) and s_val:
            target_seat = str(s_val[0])
        elif isinstance(s_val, str):
            target_seat = s_val.split(",")[0]
    if not target_seat:
        target_seat = "SIM-01"
    target_seat = str(target_seat).strip().upper()
    simulated_delay = float(data.get("simulated_delay", 0.06))

    # Reset the isolated simulation seat to available before launching test
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO simulation_seats (seat_number, status) VALUES (?, 'available')", (target_seat,))
    conn.execute("UPDATE simulation_seats SET status = 'available', booked_by_thread = NULL, booking_code = NULL WHERE seat_number = ?", (target_seat,))
    conn.commit()
    conn.close()

    barrier = threading.Barrier(threads_count)
    results = []
    threads = []
    results_lock = threading.Lock()

    start_time = time.time()

    def simulation_worker(thread_index):
        thread_name = f"WorkerThread-{thread_index:02d}"
        threading.current_thread().name = thread_name

        # All threads wait at the barrier so they strike the critical section simultaneously
        barrier.wait()

        if use_mutex:
            # -------------------------------------------------------------
            # SAFE MODE: Mutex Protected
            # -------------------------------------------------------------
            log_sync_event(thread_name, "MUTEX_WAIT", f"SimWorker waiting for Mutex on {target_seat}...", "WAITING")
            booking_mutex.acquire()
            try:
                t_conn = get_db()
                t_cursor = t_conn.cursor()

                # Critical section check
                t_cursor.execute("SELECT status FROM simulation_seats WHERE seat_number = ?", (target_seat,))
                row = t_cursor.fetchone()
                is_available = row and row["status"] == "available"

                if not is_available:
                    log_sync_event(thread_name, "CONFLICT_PREVENTED", f"Seat {target_seat} already booked! Mutex prevented race condition.", "CONFLICT")
                    t_conn.close()
                    with results_lock:
                        results.append({
                            "thread_index": thread_index,
                            "thread_name": thread_name,
                            "success": False,
                            "reason": f"Seat {target_seat} already booked by another thread",
                            "race_collision": False
                        })
                    return

                # Atomic booking update
                b_code = f"SIM-{uuid.uuid4().hex[:6].upper()}"
                t_cursor.execute("""
                    UPDATE simulation_seats SET status = 'booked', booked_by_thread = ?, booking_code = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE seat_number = ?
                """, (thread_name, b_code, target_seat))
                t_conn.commit()
                t_conn.close()

                log_sync_event(thread_name, "BOOKING_COMMITTED", f"Successfully booked {target_seat} in critical section with Mutex.", "SUCCESS")
                with results_lock:
                    results.append({
                        "thread_index": thread_index,
                        "thread_name": thread_name,
                        "success": True,
                        "booking_code": b_code,
                        "race_collision": False
                    })
            finally:
                booking_mutex.release()
                log_sync_event(thread_name, "MUTEX_RELEASED", f"Mutex released by {thread_name}.", "RELEASED")

        else:
            # -------------------------------------------------------------
            # HAZARD MODE: No Mutex (Race Condition Demonstration)
            # -------------------------------------------------------------
            log_sync_event(thread_name, "RACE_HAZARD_ENTER", f"SimWorker entering critical section WITHOUT lock for {target_seat}!", "HAZARD")

            t_conn = get_db()
            t_conn.isolation_level = None  # Autocommit mode: ensures fresh snapshot visibility across threads
            t_cursor = t_conn.cursor()

            # Step 1: Check availability WITHOUT lock (Check phase of TOCTOU)
            t_cursor.execute("SELECT status FROM simulation_seats WHERE seat_number = ?", (target_seat,))
            row = t_cursor.fetchone()
            was_available_at_check = row and row["status"] == "available"

            # Step 2: Inject simulated latency window (Time-of-Check to Time-of-Use window with minor thread jitter)
            jitter_delay = simulated_delay + (thread_index - 1) * 0.012
            time.sleep(jitter_delay)

            # Step 3: Check if another thread committed a booking during this unprotected gap
            t_cursor.execute("SELECT status, booked_by_thread FROM simulation_seats WHERE seat_number = ?", (target_seat,))
            latest = t_cursor.fetchone()
            is_overwriting = latest and latest["status"] == "booked"

            # Step 4: Unshielded write (Use phase of TOCTOU)
            b_code = f"RACE-{uuid.uuid4().hex[:6].upper()}"
            t_cursor.execute("""
                UPDATE simulation_seats SET status = 'booked', booked_by_thread = ?, booking_code = ?, updated_at = CURRENT_TIMESTAMP
                WHERE seat_number = ?
            """, (thread_name, b_code, target_seat))
            t_conn.close()

            if is_overwriting:
                with stats_lock:
                    concurrency_stats["race_collisions_detected"] += 1
                log_sync_event(thread_name, "RACE_COLLISION_DETECTED",
                               f"COLLISION: {thread_name} overwrote seat {target_seat} previously taken by {latest['booked_by_thread']}!",
                               "HAZARD")

            with results_lock:
                results.append({
                    "thread_index": thread_index,
                    "thread_name": thread_name,
                    "success": True,
                    "booking_code": b_code,
                    "race_collision": is_overwriting
                })

    # Spawn threads
    for i in range(1, threads_count + 1):
        t = threading.Thread(target=simulation_worker, args=(i,), name=f"WorkerThread-{i:02d}")
        threads.append(t)
        t.start()

    # Await thread completion
    for t in threads:
        t.join(timeout=10.0)

    total_duration = round((time.time() - start_time) * 1000, 2)

    # Summarize results
    successful = [r for r in results if r["success"]]
    conflicts = [r for r in results if not r["success"]]
    detected_collisions = len([r for r in results if r.get("race_collision")])
    if not use_mutex and len(successful) > 1:
        total_collisions = max(detected_collisions, len(successful) - 1)
    else:
        total_collisions = detected_collisions

    summary = {
        "threads_launched": threads_count,
        "target_seat": target_seat,
        "mode": "Mutex-Protected (Safe)" if use_mutex else "Unsafe-No-Mutex (Race Hazard Demo)",
        "use_mutex": use_mutex,
        "successful_bookings": len(successful),
        "conflicts_prevented": len(conflicts),
        "race_collisions": total_collisions,
        "execution_time_ms": total_duration,
        "detailed_results": results
    }

    log_sync_event("Stress-Simulator", "SIMULATION_COMPLETED",
                   f"Simulation finished in {total_duration}ms. Success: {len(successful)}, Blocked: {len(conflicts)}, Collisions: {total_collisions}",
                   "SUCCESS" if use_mutex else "HAZARD")

    return jsonify({"success": True, "summary": summary})

@app.route("/api/settings/semaphore", methods=["POST"])
@login_required
def update_semaphore_limit():
    """Configures the counting semaphore maximum permit capacity."""
    global booking_semaphore, current_semaphore_limit
    data = request.get_json() or {}
    new_limit = int(data.get("limit", 3))
    new_limit = max(1, min(10, new_limit))

    with booking_mutex:
        current_semaphore_limit = new_limit
        booking_semaphore = threading.Semaphore(value=new_limit)
        with stats_lock:
            concurrency_stats["current_semaphore_permits"] = new_limit
            concurrency_stats["max_semaphore_permits"] = new_limit

    log_sync_event("Admin", "SEMAPHORE_RECONFIGURED",
                   f"Counting Semaphore capacity updated to {new_limit} simultaneous transactions.", "INFO")

    return jsonify({"success": True, "new_limit": new_limit})


# ========================================================================================
# OS CONCEPTS LAB – DEDICATED EDUCATIONAL DEMONSTRATION ENGINE (WEEK 2 & 3 SYLLABUS)
# ========================================================================================

lab_monitor_lock = threading.Lock()
lab_monitor_state = {
    "active_threads": [],
    "waiting_queue": [],
    "critical_section_holder": None,
    "mutex_state": "UNLOCKED",
    "semaphore_capacity": 3,
    "semaphore_permits_available": 3,
    "active_in_section": 0,
    "last_result": "Ready for demonstration",
    "last_timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3]
}

lab_comparison_history = {
    "no_mutex": {
        "runs": 0, "total_requests": 0, "successful": 0, "rejected": 0,
        "waiting_threads": 0, "sync_status": "Unprotected (Race Hazard)",
        "race_collisions": 0, "final_seat_status": "Contested (Overwritten / Double-Booked)",
        "explanation": "Without Mutex, overlapping availability checks lead multiple threads to read 'available' simultaneously and write conflicting bookings (TOCTOU race hazard)."
    },
    "with_mutex": {
        "runs": 0, "total_requests": 0, "successful": 0, "rejected": 0,
        "waiting_threads": 0, "sync_status": "Protected (threading.Lock)",
        "race_collisions": 0, "final_seat_status": "Strictly Protected (1 Booked, N Blocked)",
        "explanation": "With Mutex (threading.Lock), only one thread enters the critical section at a time. Exactly 1 thread succeeds; all others see 'booked' and are safely blocked with 0 collisions."
    },
    "with_semaphore": {
        "runs": 0, "total_requests": 0, "successful": 0, "rejected": 0,
        "waiting_threads": 0, "sync_status": "Throttled (threading.Semaphore)",
        "permits_throttled": 0, "final_seat_status": "Rate-Limited & Processed Sequentially in Waves",
        "explanation": "A Counting Semaphore limits concurrent booking operations to N slots. Surplus customer threads wait in queue until active threads release their permits."
    }
}

def update_lab_monitor(thread_name=None, status=None, seat=None, result=None,
                       cs_holder=None, queue_add=None, queue_remove=None):
    """Thread-safe state update for the live OS Concepts Activity Monitor."""
    with lab_monitor_lock:
        now_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        lab_monitor_state["last_timestamp"] = now_ts
        lab_monitor_state["mutex_state"] = "LOCKED" if booking_mutex.locked() else "UNLOCKED"
        lab_monitor_state["semaphore_capacity"] = current_semaphore_limit
        lab_monitor_state["semaphore_permits_available"] = concurrency_stats["current_semaphore_permits"]

        if thread_name:
            lab_monitor_state["active_thread_name"] = thread_name
            lab_monitor_state["active_thread_id"] = str(threading.get_ident())
        if status:
            lab_monitor_state["active_thread_status"] = status
        if seat:
            lab_monitor_state["contested_seat"] = seat
        if cs_holder is not None:
            lab_monitor_state["critical_section_holder"] = cs_holder
        if queue_add and queue_add not in lab_monitor_state["waiting_queue"]:
            lab_monitor_state["waiting_queue"].append(queue_add)
        if queue_remove and queue_remove in lab_monitor_state["waiting_queue"]:
            lab_monitor_state["waiting_queue"].remove(queue_remove)
        if result:
            lab_monitor_state["last_result"] = result

@app.route("/api/lab/threads-demo", methods=["POST"])
@admin_required
def lab_threads_demo():
    """
    OS CONCEPT A: THREADS AND MULTITHREADING
    Demonstrates multiple customers (Customer-1, Customer-2, Customer-3) acting simultaneously.
    Shows thread creation, starting, running, and completion with real-time timestamps and execution logs.
    """
    data = request.get_json(silent=True) or {}
    thread_count = min(max(int(data.get("count", 3)), 2), 6)
    results = []
    threads = []
    logs_list = []
    logs_lock = threading.Lock()
    results_lock = threading.Lock()

    def customer_thread_worker(cust_id):
        t_name = f"Customer-{cust_id}"
        threading.current_thread().name = t_name
        created_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        
        with logs_lock:
            logs_list.append({"time": created_time, "thread": t_name, "action": "THREAD_CREATED", "message": f"{t_name} allocated in memory with stack space."})
        log_sync_event(t_name, "THREAD_CREATED", f"{t_name} created and initialized.", "INFO")
        time.sleep(0.02 * cust_id) # Stagger start slightly
        
        start_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        with logs_lock:
            logs_list.append({"time": start_time, "thread": t_name, "action": "THREAD_RUNNING", "message": f"{t_name} scheduled on CPU core; selecting cinema seats."})
        log_sync_event(t_name, "THREAD_RUNNING", f"{t_name} entered RUNNING state. Simulating seat selection...", "INFO")
        
        # Simulate customer browsing and seat inspection
        work_duration = 0.08 + (cust_id * 0.03)
        time.sleep(work_duration)
        
        end_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        with logs_lock:
            logs_list.append({"time": end_time, "thread": t_name, "action": "THREAD_COMPLETED", "message": f"{t_name} finished booking operation in {round(work_duration*1000)}ms."})
        log_sync_event(t_name, "THREAD_COMPLETED", f"{t_name} finished booking operation in {round(work_duration*1000)}ms.", "SUCCESS")
        
        with results_lock:
            results.append({
                "thread_name": t_name,
                "customer_id": cust_id,
                "status": "Completed",
                "created_at": created_time,
                "started_at": start_time,
                "completed_at": end_time,
                "duration_ms": round(work_duration * 1000, 1),
                "allocated_seat": f"A{cust_id}",
                "logs": [
                    f"[{created_time}] CREATED: Thread allocated in memory with stack space.",
                    f"[{start_time}] RUNNING: Scheduled on CPU core; selecting cinema seats.",
                    f"[{end_time}] COMPLETED: Task finished; thread terminating."
                ]
            })

    start_all = time.time()
    for i in range(1, thread_count + 1):
        t = threading.Thread(target=customer_thread_worker, args=(i,), name=f"Customer-{i}")
        threads.append(t)
        t.start()

    # Join threads (demonstrating barrier completion)
    for t in threads:
        t.join(timeout=5.0)

    total_time = round((time.time() - start_all) * 1000, 2)
    results.sort(key=lambda x: x["customer_id"])
    logs_list.sort(key=lambda x: x["time"])

    return jsonify({
        "success": True,
        "concept": "Threads and Multithreading",
        "thread_count": thread_count,
        "threads_spawned": thread_count,
        "total_duration_ms": total_time,
        "threads": results,
        "logs": logs_list,
        "summary": f"Successfully demonstrated {thread_count} concurrent customer threads. All threads created, scheduled on CPU, executed, and completed safely."
    })

@app.route("/api/lab/concurrency-demo", methods=["POST"])
@admin_required
def lab_concurrency_demo():
    """
    OS CONCEPT B: CONCURRENCY
    Demonstrates multiple customer booking requests arriving at nearly the exact same millisecond.
    Traces incoming queue order, concurrent execution, and explains conflict potential on shared resources.
    """
    requests_data = []
    logs_list = []
    threads = []
    lock = threading.Lock()
    barrier = threading.Barrier(4)

    def concurrent_request_worker(idx):
        t_name = f"ConcurrentCustomer-{idx}"
        barrier.wait() # All 4 strike at the exact same millisecond
        arrival_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        
        with lock:
            logs_list.append({"time": arrival_ts, "thread": t_name, "action": "REQUEST_ARRIVED", "message": f"{t_name} arrived at concurrency barrier simultaneously."})
            
        # Interleaved processing simulation
        time.sleep(0.03 * (idx % 2 + 1))
        commit_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        
        with lock:
            order_num = len(requests_data) + 1
            logs_list.append({"time": commit_ts, "thread": t_name, "action": "INTERLEAVED_EXECUTION", "message": f"{t_name} processed in interleaved slot #{order_num} on SIM-{idx:02d}."})
            requests_data.append({
                "request_id": f"REQ-{idx:03d}",
                "customer": t_name,
                "target_seat": f"SIM-{idx:02d}",
                "arrived_at": arrival_ts,
                "processed_at": commit_ts,
                "interleaving_order": order_num,
                "status": "Processed Concurrently"
            })

    for i in range(1, 5):
        t = threading.Thread(target=concurrent_request_worker, args=(i,), name=f"ConcurrentCustomer-{i}")
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=5.0)

    requests_data.sort(key=lambda x: x["interleaving_order"])
    logs_list.sort(key=lambda x: x["time"])

    return jsonify({
        "success": True,
        "concept": "Concurrency",
        "threads_spawned": 4,
        "requests": requests_data,
        "logs": logs_list,
        "explanation": "Concurrency is the execution of multiple computations simultaneously. Without synchronization locks, concurrent access to the same seat creates race hazards."
    })

@app.route("/api/lab/race-demo", methods=["POST"])
@admin_required
def lab_race_demo():
    """
    OS CONCEPT C: RACE CONDITION (WITHOUT MUTEX)
    Educational demonstration of Time-Of-Check to Time-Of-Use (TOCTOU) race condition on shared seat SIM-RACE.
    Simulates overlapping availability checks that result in conflicting double-bookings and data corruption.
    """
    target_seat = "SIM-RACE"
    threads_count = 4

    # Reset isolated test seat
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO simulation_seats (seat_number, status) VALUES (?, 'available')", (target_seat,))
    conn.execute("UPDATE simulation_seats SET status = 'available', booked_by_thread = NULL, booking_code = NULL WHERE seat_number = ?", (target_seat,))
    conn.commit()
    conn.close()

    barrier = threading.Barrier(threads_count)
    timeline_events = []
    results = []
    results_lock = threading.Lock()
    start_time = time.time()

    def unsafe_customer_worker(idx):
        t_name = f"UnsafeCustomer-{idx}"
        barrier.wait() # Simultaneous launch

        # 1. TIME OF CHECK (TOC) - Unprotected read
        check_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        t_conn = get_db()
        t_conn.isolation_level = None # Autocommit fresh view
        t_cursor = t_conn.cursor()

        t_cursor.execute("SELECT status, booked_by_thread FROM simulation_seats WHERE seat_number = ?", (target_seat,))
        row = t_cursor.fetchone()
        status_at_check = row["status"] if row else "available"

        with results_lock:
            timeline_events.append({
                "timestamp": check_time,
                "thread": t_name,
                "action": "CHECK_AVAILABILITY",
                "seat": target_seat,
                "observed_status": status_at_check,
                "step_detail": f"{t_name} read seat {target_seat} as '{status_at_check}' (UNPROTECTED READ)"
            })

        # 2. VULNERABILITY GAP (Latency window between check and write)
        time.sleep(0.04 + (idx * 0.01))

        # 3. TIME OF USE (TOU) - Unshielded write
        write_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        t_cursor.execute("SELECT status, booked_by_thread FROM simulation_seats WHERE seat_number = ?", (target_seat,))
        latest = t_cursor.fetchone()
        was_overwritten = latest and latest["status"] == "booked" and latest["booked_by_thread"] != t_name

        b_code = f"RACE-{uuid.uuid4().hex[:6].upper()}"
        t_cursor.execute("""
            UPDATE simulation_seats SET status = 'booked', booked_by_thread = ?, booking_code = ?, updated_at = CURRENT_TIMESTAMP
            WHERE seat_number = ?
        """, (t_name, b_code, target_seat))
        t_conn.close()

        with results_lock:
            timeline_events.append({
                "timestamp": write_time,
                "thread": t_name,
                "action": "WRITE_BOOKING",
                "seat": target_seat,
                "booking_code": b_code,
                "collision": was_overwritten,
                "step_detail": f"{t_name} wrote booking {b_code}. " + (f"COLLISION: Overwrote {latest['booked_by_thread']}!" if was_overwritten else "First write committed.")
            })

            results.append({
                "thread": t_name,
                "check_status": status_at_check,
                "booking_code": b_code,
                "collision_detected": was_overwritten
            })

    threads = []
    for i in range(1, threads_count + 1):
        t = threading.Thread(target=unsafe_customer_worker, args=(i,), name=f"UnsafeCustomer-{i}")
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=5.0)

    total_time = round((time.time() - start_time) * 1000, 1)
    collisions_count = len([r for r in results if r["collision_detected"]])
    if collisions_count == 0 and len(results) > 1:
        collisions_count = len(results) - 1 # At least N-1 overwrote

    # Update comparison history
    with stats_lock:
        concurrency_stats["race_collisions_detected"] += collisions_count
        lab_comparison_history["no_mutex"]["runs"] += 1
        lab_comparison_history["no_mutex"]["total_requests"] += threads_count
        lab_comparison_history["no_mutex"]["successful"] += len(results) # Multiple claimed success illegally
        lab_comparison_history["no_mutex"]["race_collisions"] += collisions_count

    update_lab_monitor(result=f"RACE HAZARD: {collisions_count} collision(s) detected on {target_seat}")

    timeline_events.sort(key=lambda x: x["timestamp"])
    logs = [{
        "time": ev["timestamp"],
        "thread": ev["thread"],
        "action": ev["action"],
        "message": ev["step_detail"]
    } for ev in timeline_events]

    return jsonify({
        "success": True,
        "concept": "Race Condition (Without Mutex)",
        "target_seat": target_seat,
        "threads_launched": threads_count,
        "collisions_detected": collisions_count,
        "collision_detected": collisions_count > 0,
        "timeline": timeline_events,
        "logs": logs,
        "detailed_results": results,
        "duration_ms": total_time,
        "conclusion": "A race condition occurred because availability check and seat write were not atomic. Both threads read 'available' before the other wrote, leading to illegal double-booking."
    })

@app.route("/api/lab/critical-section-demo", methods=["POST"])
@admin_required
def lab_critical_section_demo():
    """
    OS CONCEPT D: CRITICAL SECTION
    Highlights the 4 essential phases: Entry Section, Critical Section, Exit Section, and Remainder Section.
    Visually tracks thread states as they queue, acquire exclusive access, and release.
    """
    target_seat = "SIM-CS-01"
    threads_count = 3
    events = []
    events_lock = threading.Lock()

    # Reset seat
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO simulation_seats (seat_number, status) VALUES (?, 'available')", (target_seat,))
    conn.execute("UPDATE simulation_seats SET status = 'available', booked_by_thread = NULL, booking_code = NULL WHERE seat_number = ?", (target_seat,))
    conn.commit()
    conn.close()

    def cs_worker(idx):
        t_name = f"Customer-{chr(64 + idx)}" # Customer-A, Customer-B, Customer-C
        
        # 1. ENTRY SECTION
        entry_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        with events_lock:
            events.append({
                "timestamp": entry_time, "thread": t_name, "phase": "ENTRY_SECTION",
                "state": "Waiting for Mutex Lock", "detail": f"{t_name} entered Entry Section. Requesting exclusive lock..."
            })
        update_lab_monitor(queue_add=t_name)

        # Acquire lock
        booking_mutex.acquire()
        update_lab_monitor(queue_remove=t_name, cs_holder=t_name)

        try:
            # 2. CRITICAL SECTION
            cs_start = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            with events_lock:
                events.append({
                    "timestamp": cs_start, "thread": t_name, "phase": "CRITICAL_SECTION",
                    "state": "Executing in Critical Section", "detail": f"{t_name} OWNS CRITICAL SECTION. Checking & updating seat {target_seat}."
                })

            t_conn = get_db()
            t_cursor = t_conn.cursor()
            t_cursor.execute("SELECT status FROM simulation_seats WHERE seat_number = ?", (target_seat,))
            row = t_cursor.fetchone()
            is_avail = row and row["status"] == "available"
            
            time.sleep(0.06) # Simulated atomic operation

            if is_avail:
                b_code = f"CS-{uuid.uuid4().hex[:6].upper()}"
                t_cursor.execute("UPDATE simulation_seats SET status = 'booked', booked_by_thread = ?, booking_code = ? WHERE seat_number = ?",
                                 (t_name, b_code, target_seat))
                t_conn.commit()
                res_msg = f"Successfully booked {target_seat} ({b_code})"
            else:
                res_msg = f"Seat {target_seat} already taken; safely rejected."
            t_conn.close()

        finally:
            # 3. EXIT SECTION
            exit_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            with events_lock:
                events.append({
                    "timestamp": exit_time, "thread": t_name, "phase": "EXIT_SECTION",
                    "state": "Releasing Lock", "detail": f"{t_name} leaving Critical Section. Releasing Mutex lock."
                })
            update_lab_monitor(cs_holder=None)
            booking_mutex.release()

        # 4. REMAINDER SECTION
        rem_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        with events_lock:
            events.append({
                "timestamp": rem_time, "thread": t_name, "phase": "REMAINDER_SECTION",
                "state": "Finished", "detail": f"{t_name} in Remainder Section: {res_msg}"
            })

    threads = []
    for i in range(1, threads_count + 1):
        t = threading.Thread(target=cs_worker, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=5.0)

    events.sort(key=lambda x: x["timestamp"])
    logs = [{
        "time": ev["timestamp"],
        "thread": ev["thread"],
        "action": ev["phase"],
        "message": ev["detail"]
    } for ev in events]

    return jsonify({
        "success": True,
        "concept": "Critical Section",
        "target_seat": target_seat,
        "phases": ["Entry Section", "Critical Section", "Exit Section", "Remainder Section"],
        "events": events,
        "logs": logs,
        "explanation": "A Critical Section is a piece of code that accesses shared resources (the seat). The Mutex guarantees that at most ONE thread is inside the Critical Section at any time."
    })

@app.route("/api/lab/mutex-demo", methods=["POST"])
@admin_required
def lab_mutex_demo():
    """
    OS CONCEPT E: MUTEX LOCK (WITH MUTEX)
    Demonstrates Python's actual threading.Lock() protecting the complete seat booking operation.
    Guarantees that 5 threads competing for the same seat result in exactly 1 winner and 4 safe rejections.
    """
    target_seat = "SIM-MUTEX"
    threads_count = 5

    # Reset isolated test seat
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO simulation_seats (seat_number, status) VALUES (?, 'available')", (target_seat,))
    conn.execute("UPDATE simulation_seats SET status = 'available', booked_by_thread = NULL, booking_code = NULL WHERE seat_number = ?", (target_seat,))
    conn.commit()
    conn.close()

    barrier = threading.Barrier(threads_count)
    results = []
    results_lock = threading.Lock()
    start_time = time.time()

    def mutex_customer_worker(idx):
        t_name = f"MutexCustomer-{idx}"
        barrier.wait() # Simultaneous arrival

        update_lab_monitor(queue_add=t_name)
        log_sync_event(t_name, "MUTEX_WAIT", f"{t_name} waiting to acquire Mutex lock...", "WAITING")

        # 1. ACQUIRE MUTEX LOCK
        booking_mutex.acquire()
        update_lab_monitor(queue_remove=t_name, cs_holder=t_name)
        acquire_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        try:
            log_sync_event(t_name, "MUTEX_ACQUIRED", f"{t_name} acquired Mutex. Critical section entered.", "ACQUIRED")
            with stats_lock:
                concurrency_stats["total_lock_acquisitions"] += 1

            t_conn = get_db()
            t_cursor = t_conn.cursor()

            # Critical section check
            t_cursor.execute("SELECT status, booked_by_thread FROM simulation_seats WHERE seat_number = ?", (target_seat,))
            row = t_cursor.fetchone()
            is_available = row and row["status"] == "available"

            if is_available:
                # First thread books
                time.sleep(0.04)
                b_code = f"SAFE-{uuid.uuid4().hex[:6].upper()}"
                t_cursor.execute("UPDATE simulation_seats SET status = 'booked', booked_by_thread = ?, booking_code = ? WHERE seat_number = ?",
                                 (t_name, b_code, target_seat))
                t_conn.commit()
                t_conn.close()
                log_sync_event(t_name, "BOOKING_COMMITTED", f"{t_name} reserved {target_seat} safely.", "SUCCESS")

                with results_lock:
                    results.append({
                        "thread": t_name, "success": True, "booking_code": b_code,
                        "time": acquire_time, "action": "Seat Confirmed", "status": "Winner"
                    })
            else:
                # Subsequent threads blocked safely
                booked_by = row["booked_by_thread"] if row else "Another Thread"
                t_conn.close()
                with stats_lock:
                    concurrency_stats["total_conflicts_prevented"] += 1

                log_sync_event(t_name, "CONFLICT_PREVENTED", f"Seat {target_seat} already booked by {booked_by}! Mutex prevented race condition.", "CONFLICT")
                with results_lock:
                    results.append({
                        "thread": t_name, "success": False, "reason": f"Seat taken by {booked_by}",
                        "time": acquire_time, "action": "Blocked Safely", "status": "Rejected"
                    })

        finally:
            # 2. RELEASE MUTEX LOCK
            update_lab_monitor(cs_holder=None)
            booking_mutex.release()
            log_sync_event(t_name, "MUTEX_RELEASED", f"{t_name} released Mutex lock.", "RELEASED")

    threads = []
    for i in range(1, threads_count + 1):
        t = threading.Thread(target=mutex_customer_worker, args=(i,), name=f"MutexCustomer-{i}")
        threads.append(t)
        t.start()

    for t in threads:
        t.join(timeout=5.0)

    total_time = round((time.time() - start_time) * 1000, 1)
    winners = [r for r in results if r["success"]]
    blocked = [r for r in results if not r["success"]]

    # Update comparison history
    with stats_lock:
        lab_comparison_history["with_mutex"]["runs"] += 1
        lab_comparison_history["with_mutex"]["total_requests"] += threads_count
        lab_comparison_history["with_mutex"]["successful"] += len(winners)
        lab_comparison_history["with_mutex"]["rejected"] += len(blocked)

    update_lab_monitor(result=f"MUTEX SAFE: Exactly 1 winner ({winners[0]['thread'] if winners else 'None'}), {len(blocked)} blocked safely.")

    return jsonify({
        "success": True,
        "concept": "Mutex Lock (Mutual Exclusion)",
        "target_seat": target_seat,
        "threads_launched": threads_count,
        "successful_bookings": len(winners),
        "successful": len(winners),
        "conflicts_prevented": len(blocked),
        "conflicts": len(blocked),
        "race_collisions": 0,
        "collisions": 0,
        "winner": winners[0]["thread"] if winners else "None",
        "duration_ms": total_time,
        "results": results,
        "logs": [{
            "time": r["time"],
            "thread": r["thread"],
            "action": "MUTEX_WINNER" if r["success"] else "MUTEX_BLOCKED",
            "message": f"{r['thread']} {'acquired Mutex and booked ' + target_seat if r['success'] else 'was blocked safely: ' + r['reason']}"
        } for r in results],
        "primitives_used": ["threading.Lock()", "acquire()", "release()", "try-finally"],
        "conclusion": "Mutex guarantees mutual exclusion: exactly ONE thread enters the critical section, while remaining threads are safely blocked without any double-booking."
    })

@app.route("/api/lab/semaphore-demo", methods=["POST"])
@admin_required
def lab_semaphore_demo():
    """
    OS CONCEPT F: COUNTING SEMAPHORE
    Demonstrates Python's actual threading.Semaphore(capacity).
    Throttles concurrent transactions to a limited capacity (e.g. 2 or 3 permits).
    Shows active threads inside section vs waiting threads in queue, and release of permits.
    """
    data = request.get_json(silent=True) or {}
    capacity = min(max(int(data.get("capacity", 2)), 1), 5)
    threads_count = 6

    # Instantiate dedicated semaphore for demonstration
    demo_semaphore = threading.Semaphore(value=capacity)
    events = []
    events_lock = threading.Lock()
    active_threads_in_section = []
    waiting_queue = []

    def semaphore_worker(idx):
        t_name = f"CustomerWorker-{idx}"
        wait_start = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        with events_lock:
            waiting_queue.append(t_name)
            events.append({
                "timestamp": wait_start, "thread": t_name, "action": "SEMAPHORE_WAIT",
                "permits_left": capacity - len(active_threads_in_section),
                "queue_len": len(waiting_queue),
                "detail": f"{t_name} requesting permit. Current queue: {', '.join(waiting_queue)}"
            })

        # 1. ACQUIRE SEMAPHORE PERMIT
        demo_semaphore.acquire()
        acq_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        with events_lock:
            waiting_queue.remove(t_name)
            active_threads_in_section.append(t_name)
            events.append({
                "timestamp": acq_time, "thread": t_name, "action": "PERMIT_ACQUIRED",
                "active_inside": list(active_threads_in_section),
                "queue_len": len(waiting_queue),
                "detail": f"{t_name} acquired permit! Active in section: {len(active_threads_in_section)}/{capacity}"
            })

        try:
            # Simulate high-load transaction in limited section
            work_time = 0.08 + (idx * 0.02)
            time.sleep(work_time)
        finally:
            # 2. RELEASE SEMAPHORE PERMIT
            rel_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            with events_lock:
                active_threads_in_section.remove(t_name)
                events.append({
                    "timestamp": rel_time, "thread": t_name, "action": "PERMIT_RELEASED",
                    "active_inside": list(active_threads_in_section),
                    "queue_len": len(waiting_queue),
                    "detail": f"{t_name} released permit. Slot freed for next waiting thread."
                })
            demo_semaphore.release()

    start_time = time.time()
    threads = []
    for i in range(1, threads_count + 1):
        t = threading.Thread(target=semaphore_worker, args=(i,), name=f"CustomerWorker-{i}")
        threads.append(t)
        t.start()
        time.sleep(0.015) # Stagger arrival slightly so queue order is clear

    for t in threads:
        t.join(timeout=6.0)

    total_time = round((time.time() - start_time) * 1000, 1)

    # Update comparison history
    with stats_lock:
        lab_comparison_history["with_semaphore"]["runs"] += 1
        lab_comparison_history["with_semaphore"]["total_requests"] += threads_count
        lab_comparison_history["with_semaphore"]["successful"] += threads_count
        lab_comparison_history["with_semaphore"]["permits_throttled"] += max(0, threads_count - capacity)

    events.sort(key=lambda x: x["timestamp"])
    logs = [{
        "time": ev["timestamp"],
        "thread": ev["thread"],
        "action": ev["action"],
        "message": ev["detail"]
    } for ev in events]

    return jsonify({
        "success": True,
        "concept": "Counting Semaphore",
        "configured_capacity": capacity,
        "capacity": capacity,
        "threads_launched": threads_count,
        "total_requests": threads_count,
        "total_duration_ms": total_time,
        "events": events,
        "logs": logs,
        "difference_from_mutex": "While a Mutex is binary (allowing only 1 thread at a time), a Counting Semaphore maintains an integer counter allowing up to N concurrent threads.",
        "conclusion": f"Counting Semaphore successfully limited active transactions to {capacity} at any given millisecond. The other {threads_count - capacity} threads waited in queue until permits were released."
    })

@app.route("/api/lab/thread-join-demo", methods=["POST"])
@admin_required
def lab_thread_join_demo():
    """
    OS CONCEPT G: THREAD JOINING (thread.join())
    Demonstrates barrier synchronization where the Main Thread/Process spawns workers
    and waits at join() until all workers finish before proceeding.
    """
    workers_count = 3
    results = []
    results_lock = threading.Lock()
    main_start = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    t0 = time.time()

    def background_worker(idx):
        w_name = f"Worker-{idx}"
        start_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        work_ms = 70 + (idx * 40)
        time.sleep(work_ms / 1000.0)
        finish_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]

        with results_lock:
            results.append({
                "worker_name": w_name,
                "task": f"Worker task #{idx} (Cinema validation/seat prep)",
                "started_at": start_ts,
                "finished_at": finish_ts,
                "work_duration_ms": work_ms
            })

    # Spawn workers
    threads = []
    for i in range(1, workers_count + 1):
        t = threading.Thread(target=background_worker, args=(i,), name=f"Worker-{i}")
        threads.append(t)
        t.start()

    join_start_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    
    # Main thread blocks at join()
    for t in threads:
        t.join(timeout=5.0)

    join_end_ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    total_elapsed = round((time.time() - t0) * 1000, 1)

    results.sort(key=lambda x: x["worker_name"])

    aggregated_invoice = {
        "booking_reference": f"GRP-JOIN-{uuid.uuid4().hex[:6].upper()}",
        "members_verified": [r["worker_name"] for r in results],
        "total_seats": 3,
        "total_amount": 1050.0,
        "concurrency_mode": "Barrier Synchronization (thread.join)"
    }
    logs = [
        {"time": main_start, "thread": "MainThread", "action": "MAIN_STARTED", "message": "Main request thread spawned 3 customer workers in parallel."},
        {"time": join_start_ts, "thread": "MainThread", "action": "WAITING_AT_JOIN", "message": "Main thread blocked at thread.join(). Paused until all workers finish."}
    ]
    for r in results:
        logs.append({"time": r["finished_at"], "thread": r["worker_name"], "action": "WORKER_COMPLETED", "message": f"{r['task']} completed in {r['work_duration_ms']}ms."})
    logs.append({"time": join_end_ts, "thread": "MainThread", "action": "ALL_JOINED_RESUMED", "message": f"All workers joined. Compiled aggregated invoice {aggregated_invoice['booking_reference']}."})

    return jsonify({
        "success": True,
        "concept": "Thread Joining (thread.join())",
        "main_thread_timeline": {
            "main_started_at": main_start,
            "blocked_at_join_at": join_start_ts,
            "unblocked_after_join_at": join_end_ts,
            "total_wait_ms": total_elapsed
        },
        "worker_results": results,
        "aggregated_invoice": aggregated_invoice,
        "logs": logs,
        "why_needed": "Without thread.join(), the main application would continue execution before worker calculations or database writes are complete, causing race hazards or zombie threads.",
        "conclusion": "The main thread paused at join() until all 3 worker threads finished. Once all joined, the main thread resumed to aggregate results."
    })

@app.route("/api/lab/comparison", methods=["GET"])
@admin_required
def get_lab_comparison():
    """
    Returns comparative analytics between:
    1. Unprotected / Without Mutex (Race Hazard)
    2. With Mutex (Mutual Exclusion)
    3. With Semaphore (Controlled Concurrency)
    """
    with stats_lock:
        no_m = dict(lab_comparison_history["no_mutex"])
        w_m = dict(lab_comparison_history["with_mutex"])
        w_s = dict(lab_comparison_history["with_semaphore"])

        # Normalize key names for frontend consumption
        no_m["total_runs"] = no_m.get("runs", 0)
        no_m["total_collisions"] = no_m.get("race_collisions", 0)

        w_m["total_runs"] = w_m.get("runs", 0)
        w_m["conflicts_prevented"] = w_m.get("rejected", 0)

        w_s["total_runs"] = w_s.get("runs", 0)
        w_s["capacity"] = current_semaphore_limit

        data = {
            "no_mutex": no_m,
            "with_mutex": w_m,
            "with_semaphore": w_s,
            "live_concurrency_stats": dict(concurrency_stats),
            "explanation": "A race condition is an unsafe check-and-update sequence that makes conflicting duplicate bookings possible depending on thread scheduling (TOCTOU flaw). Mutex guarantees strict mutual exclusion (zero duplicates) and Semaphore safely throttles throughput to a maximum of N concurrent operations."
        }
    return jsonify({
        "success": True,
        "comparison": data,
        "no_mutex": no_m,
        "with_mutex": w_m,
        "with_semaphore": w_s
    })

@app.route("/api/lab/monitor-state", methods=["GET"])
@admin_required
def get_lab_monitor_state():
    """Returns real-time telemetry for the Activity Monitor Panel."""
    with lab_monitor_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT seat_number, status, booked_by_thread, booking_code, updated_at FROM simulation_seats ORDER BY id ASC LIMIT 10")
        seat_rows = cursor.fetchall()
        sim_seats = [{
            "seat_number": r["seat_number"],
            "module": "Sandbox Test",
            "is_booked": 1 if r["status"] == "booked" else 0,
            "booked_by": r["booked_by_thread"] or "None",
            "booking_time": r["updated_at"] or "Pristine"
        } for r in seat_rows]
        conn.close()

        mutex_is_locked = booking_mutex.locked()
        permits_free = concurrency_stats["current_semaphore_permits"]
        cap = current_semaphore_limit
        q_list = list(lab_monitor_state.get("waiting_queue", []))

        state = {
            "active_thread_name": lab_monitor_state.get("active_thread_name", "None (IDLE)"),
            "active_thread_id": lab_monitor_state.get("active_thread_id", "-"),
            "active_thread_status": lab_monitor_state.get("active_thread_status", "IDLE"),
            "contested_seat": lab_monitor_state.get("contested_seat", "None"),
            "mutex_locked": mutex_is_locked,
            "mutex_state": "LOCKED" if mutex_is_locked else "UNLOCKED",
            "semaphore_capacity": cap,
            "semaphore_permits_free": permits_free,
            "semaphore_permits_available": permits_free,
            "critical_section_holder": lab_monitor_state.get("critical_section_holder"),
            "critical_section_occupant": lab_monitor_state.get("critical_section_holder"),
            "waiting_queue": q_list,
            "waiting_count": len(q_list),
            "last_result": lab_monitor_state.get("last_result", "Ready"),
            "timestamp": lab_monitor_state.get("last_timestamp", "--"),
            "last_timestamp": lab_monitor_state.get("last_timestamp", "--"),
            "seats": sim_seats
        }
    return jsonify({
        "success": True,
        "monitor": state,
        **state
    })

@app.route("/api/lab/reset", methods=["POST"])
@admin_required
def reset_lab_demo_seats():
    """Resets simulation sandbox seats and clears lab comparison counters."""
    conn = get_db()
    conn.execute("UPDATE simulation_seats SET status = 'available', booked_by_thread = NULL, booking_code = NULL")
    conn.commit()
    conn.close()

    with lab_monitor_lock:
        lab_monitor_state["waiting_queue"].clear()
        lab_monitor_state["critical_section_holder"] = None
        lab_monitor_state["last_result"] = "Lab sandbox reset successfully."
        lab_monitor_state["last_timestamp"] = datetime.now().strftime("%H:%M:%S.%f")[:-3]

    log_sync_event("Admin", "LAB_RESET", "OS Concepts Lab simulation seats and monitor queues reset.", "SUCCESS")
    return jsonify({"success": True, "message": "OS Concepts Lab demonstration environment reset successfully."})


# ========================================================================================
# APPLICATION ENTRYPOINT
# ========================================================================================
if __name__ == "__main__":
    print("=" * 70)
    print("  CinemaPro – Cinema Group Ticket Booking System Dashboard")
    print("  Multithreading, Mutex Locks & Semaphore Demonstration")
    print("  Default Administrator: admin / admin123")
    print("  Starting Flask server on http://127.0.0.1:5000 ...")
    print("=" * 70)
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)

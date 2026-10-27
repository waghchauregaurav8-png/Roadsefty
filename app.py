import os
import sqlite3
import uuid
import csv
import io
from datetime import datetime
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask import (
    Flask, render_template, request, jsonify, 
    redirect, url_for, send_from_directory, session, Response
)

app = Flask(__name__)
app.secret_key = 'road_reality_admin_secure_key_2026'

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'road_safety.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # 1. Existing Hazard Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hazard_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT NOT NULL,
            hazard_type TEXT NOT NULL, photo TEXT, description TEXT NOT NULL,
            severity TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, upvotes INTEGER DEFAULT 0
        )
    ''')
    try:
        cursor.execute('ALTER TABLE hazard_reports ADD COLUMN upvotes INTEGER DEFAULT 0')
    except sqlite3.OperationalError:
        pass
    
    # 2. NEW User Accounts Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ==========================================
# SECURITY DECORATORS
# ==========================================
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

def user_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session and 'admin_logged_in' not in session:
            return redirect(url_for('user_login'))
        return f(*args, **kwargs)
    return decorated_function

# ==========================================
# USER AUTHENTICATION ROUTES
# ==========================================
@app.route('/login', methods=['GET', 'POST'])
def user_login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()
        
        if user and check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            session['user_email'] = user['email']
            return redirect(url_for('home'))
        else:
            return render_template('user_login.html', error="Invalid Email or Password.")
    
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('user_login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        conn = get_db_connection()
        try:
            conn.execute('INSERT INTO users (email, password) VALUES (?, ?)', 
                         (email, generate_password_hash(password)))
            conn.commit()
            return redirect(url_for('user_login'))
        except sqlite3.IntegrityError:
            return render_template('register.html', error="Email already registered.")
        finally:
            conn.close()
    return render_template('register.html')

@app.route('/logout')
def user_logout():
    session.pop('user_id', None)
    session.pop('user_email', None)
    return redirect(url_for('user_login'))

# ==========================================
# ADMIN AUTHENTICATION ROUTES (Separate)
# ==========================================
@app.route('/admin-login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        password = request.form.get('password')
        if password == 'admin123':  
            session['admin_logged_in'] = True
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error="ACCESS DENIED: Invalid Override Code.")
    
    if 'admin_logged_in' in session:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/admin-logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('user_login'))

# ==========================================
# PROTECTED PUBLIC ROUTES
# ==========================================
@app.route('/')
@user_required
def home():
    return render_template('index.html')

@app.route('/safety')
@user_required
def safety():
    return render_template('safety.html')

@app.route('/quiz')
@user_required
def quiz():
    return render_template('quiz.html')

@app.route('/report')
@user_required
def report():
    return render_template('report.html')

@app.route('/emergency')
@user_required
def emergency():
    return render_template('emergency.html')

# ==========================================
# SECURE ADMIN DASHBOARD
# ==========================================
@app.route('/dashboard')
@admin_required
def dashboard():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM hazard_reports ORDER BY created_at DESC')
    reports = cursor.fetchall()
    
    total = len(reports)
    critical_count = sum(1 for r in reports if r['severity'].lower() == 'critical')
    high_count = sum(1 for r in reports if r['severity'].lower() == 'high')
    medium_count = sum(1 for r in reports if r['severity'].lower() == 'medium')
    low_count = sum(1 for r in reports if r['severity'].lower() == 'low')
    conn.close()
    
    return render_template('dashboard.html', reports=reports, total=total, 
                           critical_count=critical_count, high_count=high_count, 
                           medium_count=medium_count, low_count=low_count)

# ==========================================
# API, SUBMISSION & EXPORT ROUTES
# ==========================================
@app.route('/export-csv')
@admin_required
def export_csv():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM hazard_reports ORDER BY created_at DESC')
    reports = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Reporter Name', 'Mobile', 'Hazard Type', 'Severity', 'Description', 'Latitude', 'Longitude', 'Date Reported', 'Verifications (Upvotes)'])
    
    for r in reports:
        writer.writerow([r['id'], r['full_name'], r['mobile'], r['hazard_type'], r['severity'], r['description'], r['latitude'], r['longitude'], r['created_at'], r.get('upvotes', 0)])

    response = Response(output.getvalue(), mimetype='text/csv')
    response.headers['Content-Disposition'] = 'attachment; filename=PWD_Hazard_Report.csv'
    return response

@app.route('/api/upvote/<int:report_id>', methods=['POST'])
def upvote_hazard(report_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE hazard_reports SET upvotes = COALESCE(upvotes, 0) + 1 WHERE id = ?', (report_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/hazards')
def api_hazards():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, hazard_type, severity, latitude, longitude, description, created_at, photo, upvotes FROM hazard_reports ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    
    hazards = [{'id': r['id'], 'hazard_type': r['hazard_type'], 'severity': r['severity'], 'latitude': r['latitude'], 'longitude': r['longitude'], 'description': r['description'], 'created_at': r['created_at'], 'photo': r['photo'], 'upvotes': r['upvotes']} for r in rows]
    return jsonify(hazards)

@app.route('/submit-report', methods=['POST'])
def submit_report():
    try:
        full_name = request.form.get('full_name', '').strip()
        email = request.form.get('email', '').strip()
        mobile = request.form.get('mobile', '').strip()
        hazard_type = request.form.get('hazard_type', '').strip()
        description = request.form.get('description', '').strip()
        severity = request.form.get('severity', '').strip()
        latitude = request.form.get('latitude', '').strip()
        longitude = request.form.get('longitude', '').strip()

        lat, lng = float(latitude), float(longitude)
        
        filename_saved = None
        if 'photo' in request.files:
            file = request.files['photo']
            if file and file.filename != '':
                ext = file.filename.rsplit('.', 1)[1].lower()
                unique_name = f"{uuid.uuid4().hex}_{int(datetime.utcnow().timestamp())}.{ext}"
                filename_saved = secure_filename(unique_name)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename_saved))

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''INSERT INTO hazard_reports (full_name, email, mobile, hazard_type, photo, description, severity, latitude, longitude, upvotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)''', (full_name, email, mobile, hazard_type, filename_saved, description, severity, lat, lng))
        conn.commit()
        report_id = cursor.lastrowid
        conn.close()

        return jsonify({'success': True, 'report_id': report_id, 'redirect_url': url_for('success_page', report_id=report_id)})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Server error: {str(e)}'}), 500

@app.route('/success')
def success_page():
    report_id = request.args.get('report_id')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM hazard_reports WHERE id = ?', (report_id,))
    report = cursor.fetchone()
    conn.close()
    return render_template('success.html', report=report)

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
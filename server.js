const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'vama_clinic'
});

// Connect to MySQL
db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed: ' + err.message);
        
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.log('🔄 Creating database...');
            createDatabase();
            return;
        }
        
        console.error('🔧 MySQL Error:', err.message);
        return;
    }
    console.log('✅ Connected to MySQL database');
    initializeDatabase();
});

function createDatabase() {
    const tempConnection = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root'
    });

    tempConnection.connect((err) => {
        if (err) {
            console.error('❌ Cannot connect to MySQL:', err.message);
            return;
        }

        tempConnection.query('CREATE DATABASE IF NOT EXISTS vama_clinic', (err) => {
            if (err) {
                console.error('❌ Error creating database:', err.message);
                return;
            }
            console.log('✅ Database vama_clinic created');
            tempConnection.end();
            
            // Reconnect with database
            db.changeUser({ database: 'vama_clinic' }, (err) => {
                if (err) {
                    console.error('Error selecting database:', err.message);
                } else {
                    console.log('✅ Database selected: vama_clinic');
                    initializeDatabase();
                }
            });
        });
    });
}

function initializeDatabase() {
    console.log('🔧 Initializing database tables...');
    
    // Drop and recreate tables to ensure correct structure
    const setupQueries = [
        'DROP TABLE IF EXISTS follow_ups',
        'DROP TABLE IF EXISTS consultation_reports', 
        'DROP TABLE IF EXISTS echo_reports',
        'DROP TABLE IF EXISTS patients',
        
        `CREATE TABLE patients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(20) NOT NULL UNIQUE,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            sex VARCHAR(10) NOT NULL,
            date_of_birth DATE NOT NULL,
            email VARCHAR(255),
            mobile_no VARCHAR(20) NOT NULL,
            address TEXT,
            weight DECIMAL(5,2),
            height DECIMAL(5,2),
            blood_pressure VARCHAR(20),
            heart_rate INT,
            spo2 INT,
            appointment_date DATE,
            appointment_time VARCHAR(20),
            status VARCHAR(20) DEFAULT 'scheduled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE echo_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(20),
            report_date DATE,
            diagnosis TEXT,
            impression TEXT,
            indication VARCHAR(255),
            ref_dr VARCHAR(255),
            advise TEXT,
            next_follow_up VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE consultation_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(20),
            report_date DATE,
            content TEXT,
            indication VARCHAR(255),
            advise TEXT,
            next_follow_up VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE follow_ups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(20),
            follow_up_date DATE,
            follow_up_time VARCHAR(20),
            reason TEXT,
            status VARCHAR(20) DEFAULT 'scheduled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    executeQueriesSequentially(setupQueries, 0);
}

function executeQueriesSequentially(queries, index) {
    if (index >= queries.length) {
        console.log('🎉 Database setup complete!');
        checkDataCounts();
        return;
    }
    
    console.log(`🔄 Executing query ${index + 1}/${queries.length}...`);
    db.query(queries[index], (err) => {
        if (err) {
            console.error(`❌ Query ${index + 1} failed:`, err.message);
        } else {
            console.log(`✅ Query ${index + 1} completed`);
        }
        
        // Execute next query
        executeQueriesSequentially(queries, index + 1);
    });
}

function checkDataCounts() {
    const tables = ['patients', 'echo_reports', 'consultation_reports', 'follow_ups'];
    
    tables.forEach(table => {
        db.query(`SELECT COUNT(*) as count FROM ${table}`, (err, results) => {
            if (err) {
                console.error(`❌ Error counting ${table}:`, err.message);
            } else {
                console.log(`📊 ${table}: ${results[0].count} records`);
            }
        });
    });
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
    db.query('SELECT 1 as test', (err) => {
        if (err) {
            res.status(500).json({ 
                status: 'Error', 
                database: 'Disconnected',
                error: err.message 
            });
        } else {
            res.json({ 
                status: 'OK', 
                database: 'Connected',
                timestamp: new Date().toISOString()
            });
        }
    });
});

// Get all patients
app.get('/api/patients', (req, res) => {
    const query = 'SELECT * FROM patients ORDER BY created_at DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error fetching patients:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Get all patients for frontend
app.get('/api/all-patients', (req, res) => {
    const query = 'SELECT * FROM patients ORDER BY created_at DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error in /api/all-patients:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log(`✅ Sent ${results.length} patients to frontend`);
        res.json(results);
    });
});

// Add new patient - FIXED VERSION
app.post('/api/patients', (req, res) => {
    console.log('📥 Received patient data:', req.body);
    
    const {
        id, firstName, lastName, sex, dob, email, mobile, address,
        weight, height, bloodPressure, heartRate, spo2, appointmentDate, appointmentTime
    } = req.body;

    // Basic validation
    if (!id || !firstName || !lastName || !sex || !dob || !mobile || !address) {
        return res.status(400).json({ 
            error: 'Missing required fields',
            received: req.body
        });
    }

    const query = `
        INSERT INTO patients 
        (patient_id, first_name, last_name, sex, date_of_birth, email, mobile_no, address, 
         weight, height, blood_pressure, heart_rate, spo2, appointment_date, appointment_time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        id, firstName, lastName, sex, dob, email || null, mobile, address,
        weight || null, height || null, bloodPressure || null, heartRate || null, spo2 || null,
        appointmentDate || null, appointmentTime || null
    ];

    console.log('💾 Executing patient insert...');

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('❌ Database error:', err.message);
            console.error('❌ Error code:', err.code);
            
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ 
                    error: 'Patient ID already exists. Please use a different ID.' 
                });
            }
            
            // If table structure error, recreate tables
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                console.log('🔄 Table structure outdated, recreating tables...');
                initializeDatabase();
                return res.status(500).json({ 
                    error: 'Database structure updated. Please try again in a moment.' 
                });
            }
            
            return res.status(500).json({ 
                error: 'Database error: ' + err.message,
                code: err.code
            });
        }
        
        console.log('✅ Patient saved successfully! ID:', id);
        console.log('📋 Insert ID:', results.insertId);
        
        res.json({ 
            success: true,
            message: 'Patient registered successfully', 
            patientId: id,
            insertId: results.insertId
        });
    });
});

// Get all echo reports
app.get('/api/all-echo-reports', (req, res) => {
    const query = 'SELECT * FROM echo_reports ORDER BY report_date DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error in /api/all-echo-reports:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Save echo report - FIXED VERSION
app.post('/api/echo-reports', (req, res) => {
    console.log('📥 Saving echo report for patient:', req.body.patientId);
    
    const {
        patientId, reportDate, diagnosis, impression, 
        indication, refDr, advise, nextFollowUp
    } = req.body;

    if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required' });
    }

    const query = `
        INSERT INTO echo_reports 
        (patient_id, report_date, diagnosis, impression, indication, ref_dr, advise, next_follow_up)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        patientId, 
        reportDate || new Date().toISOString().split('T')[0],
        diagnosis || '',
        impression || '', 
        indication || '', 
        refDr || '', 
        advise || '', 
        nextFollowUp || ''
    ];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('❌ Error saving echo report:', err);
            
            // If table structure error, recreate tables
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                console.log('🔄 Echo reports table structure outdated, recreating...');
                initializeDatabase();
                return res.status(500).json({ 
                    error: 'Database structure updated. Please try again in a moment.' 
                });
            }
            
            res.status(500).json({ error: err.message });
            return;
        }
        
        console.log('✅ Echo report saved! ID:', results.insertId);
        res.json({ 
            success: true,
            message: 'Echo report saved successfully',
            reportId: results.insertId
        });
    });
});

// Get echo reports for patient
app.get('/api/echo-reports/:patientId', (req, res) => {
    const patientId = req.params.patientId;
    const query = 'SELECT * FROM echo_reports WHERE patient_id = ? ORDER BY report_date DESC';
    
    db.query(query, [patientId], (err, results) => {
        if (err) {
            console.error('❌ Error fetching echo reports:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Get all consultation reports
app.get('/api/all-consultation-reports', (req, res) => {
    const query = 'SELECT * FROM consultation_reports ORDER BY report_date DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error in /api/all-consultation-reports:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Save consultation report - FIXED VERSION
app.post('/api/consultation-reports', (req, res) => {
    console.log('📥 Saving consultation report for patient:', req.body.patientId);
    
    const {
        patientId, reportDate, content, indication, advise, nextFollowUp
    } = req.body;

    if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required' });
    }

    const query = `
        INSERT INTO consultation_reports 
        (patient_id, report_date, content, indication, advise, next_follow_up)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
        patientId,
        reportDate || new Date().toISOString().split('T')[0],
        content || '',
        indication || '',
        advise || '',
        nextFollowUp || ''
    ];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('❌ Error saving consultation report:', err);
            
            // If table structure error, recreate tables
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                console.log('🔄 Consultation reports table structure outdated, recreating...');
                initializeDatabase();
                return res.status(500).json({ 
                    error: 'Database structure updated. Please try again in a moment.' 
                });
            }
            
            res.status(500).json({ error: err.message });
            return;
        }
        
        console.log('✅ Consultation report saved! ID:', results.insertId);
        res.json({ 
            success: true,
            message: 'Consultation report saved successfully',
            reportId: results.insertId
        });
    });
});

// Get consultation reports for patient
app.get('/api/consultation-reports/:patientId', (req, res) => {
    const patientId = req.params.patientId;
    const query = 'SELECT * FROM consultation_reports WHERE patient_id = ? ORDER BY report_date DESC';
    
    db.query(query, [patientId], (err, results) => {
        if (err) {
            console.error('❌ Error fetching consultation reports:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Get all follow-ups
app.get('/api/all-follow-ups', (req, res) => {
    const query = 'SELECT * FROM follow_ups ORDER BY follow_up_date ASC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error in /api/all-follow-ups:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found: ' + req.originalUrl });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('🚨 Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🏥 VAMA Clinic System Ready!`);
    console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.end();
    process.exit(0);
});
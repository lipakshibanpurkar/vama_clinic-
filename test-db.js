const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            port: 3306, // MySQL default port
            user: 'root',
            password: 'root',
            database: 'vama_clinic'
        });

        console.log('✅ MySQL Connection Successful!');
        await connection.end();
        return true;
    } catch (error) {
        console.log('❌ MySQL Connection Failed:', error.message);
        console.log('💡 Try these passwords: "", "root", "password"');
        return false;
    }
}

testConnection();


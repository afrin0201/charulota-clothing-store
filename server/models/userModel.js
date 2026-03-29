const { getConnection, oracledb } = require('../config/db');

const userModel = {

async register(name, email, password, address, phone) {
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `INSERT INTO Customer (customer_id, name, email, password, address, phone_number) 
             VALUES (customer_seq.NEXTVAL, :name, :email, :pass, :addr, :phone)`,
            { name, email, pass: password, addr: address, phone },
            { autoCommit: true }
        );
    } finally {
        if (conn) await conn.close();
    }
},

    async findByEmail(email) {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `SELECT * FROM Customer WHERE email = :email`,
                [email],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return result.rows[0];
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = userModel;
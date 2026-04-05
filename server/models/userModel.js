const { getConnection, oracledb } = require('../config/db');
const bcrypt = require('bcrypt');

const userModel = {

    async register(name, email, password, address, phone) {
        const hashed = await bcrypt.hash(password, 10);
        let conn;
        try {
            conn = await getConnection();
            await conn.execute(
                `INSERT INTO Customer (customer_id, name, email, password, address, phone_number) 
                 VALUES (customer_seq.NEXTVAL, :name, :email, :pass, :addr, :phone)`,
                { name, email, pass: hashed, addr: address, phone }
            );
            await conn.commit();
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
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
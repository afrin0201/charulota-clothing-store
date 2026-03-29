const oracledb = require('oracledb');
const { getConnection } = require('../config/db');
const adminModel = {
    async login(email, password) {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `SELECT admin_id, name, password FROM Admin WHERE email = :email`,
                { email },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (result.rows.length === 0) return null;

            const admin = result.rows[0];
            // In production, use bcrypt.compare here!
            if (admin.PASSWORD === password) {
                return { id: admin.ADMIN_ID, name: admin.NAME };
            }
            return null;
        } finally {
            if (conn) await conn.close();
        }
    },
async addProduct(name, brand, price, category, description, colorId, sizeId, stock) {
    let conn;
    try {
        conn = await getConnection();

        const result = await conn.execute(`SELECT item_seq.NEXTVAL FROM dual`);
        const sharedId = result.rows[0][0]; 

        await conn.execute(
            `INSERT INTO Product (product_id, product_name, brand, base_price, category_id, description)
             VALUES (:id, :name, :brand, :price, :cat, :p_desc)`, // Changed :desc to :p_desc
            { 
                id: sharedId, 
                name: name, 
                brand: brand, 
                price: Number(price), 
                cat: Number(category), 
                p_desc: description 
            }
        );

        await conn.execute(
            `INSERT INTO Product_Variant (variant_id, product_id, color_id, size_id, stock_quantity)
             VALUES (:vid, :pid, :cid, :sid, :stock)`,
            { 
                vid: sharedId, 
                pid: sharedId, 
                cid: Number(colorId), 
                sid: Number(sizeId), 
                stock: Number(stock) 
            }
        );

        await conn.commit();
        console.log("Product and Variant created successfully with ID:", sharedId);
        return sharedId;
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Admin Insert Failed:", err.message);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},
    async approveOrder(orderId) {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `UPDATE Orders SET order_status = 'Shipped' WHERE order_id = :oid`,
                { oid: Number(orderId) }
            );
            await conn.commit();
            return result.rowsAffected;
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

  async  updateStock(variantId, newTotalQuantity) {
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `UPDATE Product_Variant 
             SET stock_quantity = :qty 
             WHERE variant_id = :vid`,
            { qty: Number(newTotalQuantity), vid: Number(variantId) },
            { autoCommit: true }
        );
        return { success: true };
    } finally {
        if (conn) await conn.close();
    }
},

    async getAllOrders() {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `SELECT o.order_id, o.customer_id, c.name, o.total_amount, o.order_status, o.order_date
                 FROM Orders o
                 JOIN Customer c ON o.customer_id = c.customer_id
                 ORDER BY o.order_date DESC`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return result.rows;
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = adminModel;
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
             VALUES (:id, :name, :brand, :price, :cat, :p_desc)`, 
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
    async getDiscountsList() {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT d.DISCOUNT_ID, d.DISCOUNT_CODE, d.PERCENTAGE, d.START_DATE, d.END_DATE,
                    p.PRODUCT_NAME
             FROM Discount d
             JOIN Product p ON p.DISCOUNT_ID = d.DISCOUNT_ID
             ORDER BY d.START_DATE DESC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return result.rows;
    } finally {
        if (conn) await conn.close();
    }
},

async saveDiscount(productId, discountCode, percent, start, end) {
    let conn;
    try {
        conn = await getConnection();

        const result = await conn.execute(`SELECT DISCOUNT_SEQ.NEXTVAL FROM dual`);
        const discountId = result.rows[0][0];
          console.log("=== DISCOUNT DEBUG ===");
        console.log("discountId:", discountId);
        console.log("discountCode:", discountCode);
        console.log("percent:", percent);
        console.log("start:", start);
        console.log("end:", end);
        console.log("types:", typeof discountId, typeof discountCode, typeof percent, typeof start, typeof end);

        await conn.execute(
            `INSERT INTO Discount (DISCOUNT_ID, DISCOUNT_CODE, PERCENTAGE, START_DATE, END_DATE)
             VALUES (:discId, :discCode, :discPct, TO_DATE(:discStart, 'YYYY-MM-DD'), TO_DATE(:discEnd, 'YYYY-MM-DD'))`,
            {
                discId:    discountId,
                discCode:  discountCode,
                discPct:   Number(percent),
                discStart: start,
                discEnd:   end
            }
        );

        await conn.execute(
            `UPDATE Product SET DISCOUNT_ID = :discId WHERE PRODUCT_ID = :prodId`,
            { discId: discountId, prodId: Number(productId) }
        );

        await conn.commit();
        return discountId;
    } catch (err) {
        if (conn) await conn.rollback();
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},

async removeDiscount(discountId) {
    let conn;
    try {
        conn = await getConnection();

        // 1. Unlink from product first
        await conn.execute(
            `UPDATE Product SET DISCOUNT_ID = NULL WHERE DISCOUNT_ID = :did`,
            { did: Number(discountId) }
        );

        // 2. Delete the discount record
        await conn.execute(
            `DELETE FROM Discount WHERE DISCOUNT_ID = :did`,
            { did: Number(discountId) }
        );

        await conn.commit();
        return { success: true };
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
    } catch (err) {
        throw err;
    } finally {
        if (conn) await conn.close();
    }}
};

module.exports = adminModel;
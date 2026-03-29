const { getConnection, oracledb } = require('../config/db');

const cartModel = {
    async addItem(customerId, variantId, quantity) {
        console.log("--- DATA RECEIVED BY BACKEND ---");
        console.log("Customer ID:", customerId, "| Type:", typeof customerId);
        console.log("Variant ID:", variantId, "| Type:", typeof variantId);

        let conn;
        try {
            conn = await getConnection();

            const cId = Number(customerId);
            const vId = Number(variantId);
            const qty = Number(quantity);

            if (isNaN(cId) || isNaN(vId)) {
                throw new Error("Invalid ID: Customer or Variant ID is not a number");
            }

   
            await conn.execute(
                `BEGIN
                    INSERT INTO Cart (cart_id, customer_id, created_date) 
                    VALUES (:cid, :cid, SYSDATE);
                 EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
                    NULL; -- Cart already exists, ignore error
                 END;`,
                { cid: cId }
            );
            await conn.execute(
                `MERGE INTO Cart_Item target
                 USING (SELECT :cid as c_id, :vid as v_id FROM dual) src
                 ON (target.cart_id = src.c_id AND target.variant_id = src.v_id)
                 WHEN MATCHED THEN
                    UPDATE SET target.quantity = target.quantity + :qty
                 WHEN NOT MATCHED THEN
                    INSERT (cart_item_id, cart_id, variant_id, quantity)
                    VALUES (item_seq.NEXTVAL, src.c_id, src.v_id, :qty)`,
                { cid: cId, vid: vId, qty: qty }
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
async getCustomerOrders(customerId) {
    let conn;
    try {
        conn = await getConnection();
        const query = `
            SELECT 
                o.order_id, 
                o.order_date, 
                o.total_amount, 
                o.order_status, 
                p.product_name, 
                oi.quantity, 
                oi.unit_price
            FROM Orders o
            JOIN Order_Item oi ON o.order_id = oi.order_id
            JOIN Product_Variant pv ON oi.variant_id = pv.variant_id
            JOIN Product p ON pv.product_id = p.product_id
            WHERE o.customer_id = :cid
            ORDER BY o.order_id DESC`; 

        const result = await conn.execute(query, { cid: customerId });
        return result.rows; 
    } catch (err) {
        console.error("Database Error:", err);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},

async removeItemOneByOne(customerId, variantId) {
    let conn;
    try {
        conn = await getConnection();
        
        const cartRes = await conn.execute(
            `SELECT cart_id FROM Cart WHERE customer_id = :cid`,
            { cid: customerId }
        );

        if (cartRes.rows.length === 0) throw new Error("No cart found for user");
        const cartId = cartRes.rows[0][0];

        await conn.execute(
            `UPDATE Cart_Item 
             SET quantity = quantity - 1 
             WHERE cart_id = :ctid AND variant_id = :vid AND quantity > 0`,
            { ctid: cartId, vid: variantId }
        );

        await conn.execute(
            `DELETE FROM Cart_Item 
             WHERE cart_id = :ctid AND variant_id = :vid AND quantity <= 0`,
            { ctid: cartId, vid: variantId }
        );

        await conn.commit(); 
        return { success: true };
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Database Error:", err);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},
   async checkout(customerId) {
    let conn;
    try {
        conn = await getConnection();
        const cId = Number(customerId);

        const cartData = await conn.execute(
            `SELECT ci.variant_id, ci.quantity, p.base_price 
             FROM Cart_Item ci 
             JOIN Product_Variant pv ON ci.variant_id = pv.variant_id 
             JOIN Product p ON pv.product_id = p.product_id 
             WHERE ci.cart_id = :cid`,
            { cid: cId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (cartData.rows.length === 0) throw new Error("Cart is empty");

        const totalAmount = cartData.rows.reduce((sum, row) => {
            const qty = row.QUANTITY || row.quantity;
            const price = row.BASE_PRICE || row.base_price;
            return sum + (qty * price);
        }, 0);
        const orderId = Math.floor(Date.now() / 1000); 
        await conn.execute(
            `INSERT INTO Orders (order_id, customer_id, order_date, total_amount, order_status, discount_id)
             VALUES (:oid, :cid, SYSDATE, :total, 'Pending', NULL)`,
            { oid: orderId, cid: cId, total: totalAmount }
        );
        for (const row of cartData.rows) {
            const vId = row.VARIANT_ID || row.variant_id;
            const qty = row.QUANTITY || row.quantity;
            const price = row.BASE_PRICE || row.base_price;

            // A. Check Stock in Product_Variant
            const stockCheck = await conn.execute(
                `SELECT STOCK_QUANTITY FROM Product_Variant WHERE variant_id = :vid`,
                { vid: vId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            
            const currentStock = stockCheck.rows[0].STOCK_QUANTITY;
            if (currentStock < qty) {
                throw new Error(`Insufficient stock for Variant ID ${vId}. Available: ${currentStock}`);
            }

            await conn.execute(
                `INSERT INTO Order_Item (order_item_id, order_id, variant_id, quantity, unit_price)
                 VALUES (item_seq.NEXTVAL, :oid, :vid, :qty, :price)`,
                { oid: orderId, vid: vId, qty: qty, price: price }
            );

            await conn.execute(
                `UPDATE Product_Variant 
                 SET STOCK_QUANTITY = STOCK_QUANTITY - :qty 
                 WHERE variant_id = :vid`,
                { qty: qty, vid: vId }
            );
        }
        await conn.execute(
            `INSERT INTO Payment (payment_id, order_id, method, status, payment_date)
             VALUES (item_seq.NEXTVAL, :oid, 'Credit Card', 'Completed', SYSDATE)`,
            { oid: orderId }
        );

        await conn.execute(`DELETE FROM Cart_Item WHERE cart_id = :cid`, { cid: cId });

        await conn.commit();
        return { success: true, orderId: orderId };

    } catch (err) {
        if (conn) await conn.rollback();
        console.error("Detailed Checkout Error:", err);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
},
    async getCartItems(customerId) {
        let conn;
        try {
            conn = await getConnection();
            const query = `
                SELECT 
                    p.product_id, 
                    p.product_name, 
                    p.base_price, 
                    ci.quantity, 
                    ci.variant_id
                FROM Cart_Item ci
                JOIN Cart c ON ci.cart_id = c.cart_id
                JOIN Product_Variant pv ON ci.variant_id = pv.variant_id
                JOIN Product p ON pv.product_id = p.product_id
                WHERE c.customer_id = :cid`;

            const result = await conn.execute(
                query,
                [customerId],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return result.rows;
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = cartModel;
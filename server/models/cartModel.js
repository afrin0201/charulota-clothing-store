const { getConnection, oracledb } = require('../config/db');

async function updateCartTimestamp(conn, cartId) {
    await conn.execute(
        `UPDATE Cart SET last_updated = SYSDATE WHERE cart_id = :cid`,
        { cid: cartId }
    );
}

async function getActiveCartId(conn, customerId) {
    const res = await conn.execute(
        `SELECT c.cart_id FROM Cart c
         WHERE c.customer_id = :cid
         AND EXISTS (SELECT 1 FROM Cart_Item ci WHERE ci.cart_id = c.cart_id)
         ORDER BY c.cart_id DESC
         FETCH FIRST 1 ROWS ONLY`,
        { cid: Number(customerId) }
    );
    if (res.rows.length > 0) return res.rows[0][0];
    return null;
}

const cartModel = {
    async addItem(customerId, variantId, quantity) {
        let conn;
        try {
            conn = await getConnection();

            const cId = Number(customerId);
            const vId = Number(variantId);
            const qty = Number(quantity);

            if (isNaN(cId) || isNaN(vId)) {
                throw new Error("Invalid ID: Customer or Variant ID is not a number");
            }

            const stockCheck = await conn.execute(
                `SELECT fn_check_stock(:vid, :qty) AS is_available FROM dual`,
                { vid: vId, qty: qty },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (stockCheck.rows[0].IS_AVAILABLE === 0) {
                throw new Error('Not enough stock available.');
            }

            // Try to find existing cart with items first
            let cartId = await getActiveCartId(conn, cId);

            if (!cartId) {
                // No active cart — create one or reuse existing empty cart
                await conn.execute(
                    `BEGIN
                        INSERT INTO Cart (cart_id, customer_id, created_date)
                        VALUES (cart_seq.NEXTVAL, :cid, SYSDATE);
                     EXCEPTION WHEN DUP_VAL_ON_INDEX THEN
                        NULL;
                     END;`,
                    { cid: cId }
                );
                const cartRes = await conn.execute(
                    `SELECT cart_id FROM Cart WHERE customer_id = :cid ORDER BY cart_id DESC FETCH FIRST 1 ROWS ONLY`,
                    { cid: cId }
                );
                cartId = cartRes.rows[0][0];
            }

            await conn.execute(
                `MERGE INTO Cart_Item target
                 USING (SELECT :cid as c_id, :vid as v_id FROM dual) src
                 ON (target.cart_id = src.c_id AND target.variant_id = src.v_id)
                 WHEN MATCHED THEN
                    UPDATE SET target.quantity = target.quantity + :qty
                 WHEN NOT MATCHED THEN
                    INSERT (cart_item_id, cart_id, variant_id, quantity)
                    VALUES (item_seq.NEXTVAL, src.c_id, src.v_id, :qty)`,
                { cid: cartId, vid: vId, qty: qty }
            );

            await updateCartTimestamp(conn, cartId);
            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async removeItemOneByOne(customerId, variantId) {
        let conn;
        try {
            conn = await getConnection();

            const vId = Number(variantId);

            // Find the cart that actually contains this specific item
            const cartRes = await conn.execute(
                `SELECT ci.cart_id FROM Cart_Item ci
                 JOIN Cart c ON ci.cart_id = c.cart_id
                 WHERE c.customer_id = :cid AND ci.variant_id = :vid`,
                { cid: Number(customerId), vid: vId }
            );

            if (cartRes.rows.length === 0) throw new Error("Item not found in any cart");
            const cartId = cartRes.rows[0][0];

            await conn.execute(
                `UPDATE Cart_Item 
                 SET quantity = quantity - 1 
                 WHERE cart_id = :ctid AND variant_id = :vid AND quantity > 0`,
                { ctid: cartId, vid: vId }
            );

            await conn.execute(
                `DELETE FROM Cart_Item 
                 WHERE cart_id = :ctid AND variant_id = :vid AND quantity <= 0`,
                { ctid: cartId, vid: vId }
            );

            await updateCartTimestamp(conn, cartId);
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

    async checkout(customerId, paymentMethod = 'Credit Card') {
        let conn;
        try {
            conn = await getConnection();
            const cId = Number(customerId);

            const cartData = await conn.execute(
                `SELECT ci.variant_id, ci.quantity, ci.cart_id,
                    CASE 
                        WHEN d.PERCENTAGE IS NOT NULL 
                             AND SYSDATE BETWEEN d.START_DATE AND d.END_DATE 
                        THEN ROUND(p.base_price * (1 - (d.PERCENTAGE / 100)), 2)
                        ELSE p.base_price 
                    END AS unit_price
                 FROM Cart_Item ci
                 JOIN Cart c ON ci.cart_id = c.cart_id
                 JOIN Product_Variant pv ON ci.variant_id = pv.variant_id
                 JOIN Product p ON pv.product_id = p.product_id
                 LEFT JOIN Discount d ON p.discount_id = d.discount_id
                 WHERE c.customer_id = :cid`,
                { cid: cId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (cartData.rows.length === 0) throw new Error("Cart is empty");

            // Stock check
            for (const row of cartData.rows) {
                const stockCheck = await conn.execute(
                    `SELECT stock_quantity FROM Product_Variant WHERE variant_id = :vid`,
                    { vid: row.VARIANT_ID },
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                const currentStock = stockCheck.rows[0].STOCK_QUANTITY;
                if (currentStock < row.QUANTITY) {
                    throw new Error(
                        `Insufficient stock for variant ${row.VARIANT_ID}. ` +
                        `Requested: ${row.QUANTITY}, Available: ${currentStock}`
                    );
                }
            }

            const totalAmount = cartData.rows.reduce((sum, row) => {
                return sum + (row.QUANTITY * row.UNIT_PRICE);
            }, 0);

            const orderIdRes = await conn.execute(`SELECT order_seq.NEXTVAL FROM dual`);
            const orderId = orderIdRes.rows[0][0];

            await conn.execute(
                `INSERT INTO Orders (order_id, customer_id, order_date, total_amount, order_status, discount_id)
                 VALUES (:oid, :cid, SYSDATE, :total, 'Pending', NULL)`,
                { oid: orderId, cid: cId, total: totalAmount }
            );

            for (const row of cartData.rows) {
                await conn.execute(
                    `INSERT INTO Order_Item (order_item_id, order_id, variant_id, quantity, unit_price)
                     VALUES (item_seq.NEXTVAL, :oid, :vid, :qty, :price)`,
                    { oid: orderId, vid: row.VARIANT_ID, qty: row.QUANTITY, price: row.UNIT_PRICE }
                );
              
            }

            const paymentIdRes = await conn.execute(`SELECT payment_seq.NEXTVAL FROM dual`);
            const paymentId = paymentIdRes.rows[0][0];
            await conn.execute(
                `INSERT INTO Payment (payment_id, order_id, method, status, payment_date)
                 VALUES (:pid, :oid, :method, 'Completed', SYSDATE)`,
                { pid: paymentId, oid: orderId, method: paymentMethod }
            );

            // Delete ALL cart items across ALL carts for this customer
            await conn.execute(
                `DELETE FROM Cart_Item WHERE cart_id IN (
                    SELECT cart_id FROM Cart WHERE customer_id = :cid
                )`,
                { cid: cId }
            );

            await conn.commit();
            return { success: true, orderId: orderId };
        } catch (err) {
            if (conn) await conn.rollback();
            console.error("Checkout Error:", err.message);
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async getCartItems(customerId) {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `SELECT 
                    p.product_id, 
                    p.product_name, 
                    p.base_price, 
                    ci.quantity, 
                    ci.variant_id
                 FROM Cart_Item ci
                 JOIN Cart c ON ci.cart_id = c.cart_id
                 JOIN Product_Variant pv ON ci.variant_id = pv.variant_id
                 JOIN Product p ON pv.product_id = p.product_id
                 WHERE c.customer_id = :cid`,
                { cid: customerId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return result.rows;
        } finally {
            if (conn) await conn.close();
        }
    },

    async getCustomerOrders(customerId) {
        let conn;
        try {
            conn = await getConnection();
            const result = await conn.execute(
                `SELECT 
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
                 ORDER BY o.order_date DESC, o.order_id DESC`,
                { cid: customerId }
            );
            return result.rows;
        } catch (err) {
            console.error("Database Error:", err);
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = cartModel;
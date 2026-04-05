const express = require('express');
const path = require('path');
const app = express();
const { getConnection, oracledb } = require('./config/db');
const authController = require('./controllers/authController');
const productController = require('./controllers/productController');
const userModel = require('./models/userModel');
const cartModel = require('./models/cartModel');
const adminModel = require('./models/adminModel');
const qaModel = require('./models/qaModel');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'charulota_secret_key_2026';
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Please log in first.' });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.customer = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
    }
}
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/products', productController.getProducts);
app.post('/api/cart/add', verifyToken, async (req, res) => {
    const { customerId, variantId, quantity } = req.body;
    try {
        const result = await cartModel.addItem(customerId, variantId, quantity);
        res.status(200).json({ message: "Added to database!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});
app.get('/api/cart/:customerId', verifyToken, async (req, res) => {
    try {
        const items = await cartModel.getCartItems(req.params.customerId);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/cart/remove-one',verifyToken, async (req, res) => {
    const { customerId, variantId } = req.body;
    try {
         await cartModel.removeItemOneByOne(Number(customerId), Number(variantId));
        res.json({ success: true });
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/cart/checkout', verifyToken, async (req, res) => {
    const { customerId, paymentMethod } = req.body;
    try {
        await cartModel.checkout(customerId, paymentMethod);
        res.json({ message: "Payment successful and order placed!" });
    } catch (err) {
        res.status(500).json({ error: "Checkout failed: " + err.message });
    }
});
app.get('/api/my-orders/:customerId', verifyToken, async (req, res) => {
    try {
        const orders = await cartModel.getCustomerOrders(req.params.customerId);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/admin/add-product', async (req, res) => {
    
    const { name, brand, price, category, description, colorId, sizeId, stock } = req.body;

    try {
        const id = await adminModel.addProduct(
            name,
            brand,
            price,
            category,
            description,
            colorId,
            sizeId,
            stock
        );
        res.json({ success: true, productId: id });
    } catch (err) {
        console.error("Route Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await adminModel.login(email, password);
        if (admin) {
            res.json({ success: true, admin });
        } else {
            res.status(401).json({ error: "Invalid Admin Credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/admin/approve-order', async (req, res) => {
    try {
        await adminModel.approveOrder(req.body.orderId);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/public/login.html'));
});



app.post('/api/qa/ask', async (req, res) => {
    const { customerId, productId, text } = req.body;
    try {
        await qaModel.askQuestion(customerId, productId, text);
        res.json({ success: true, message: "Question submitted!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/qa/:productId', async (req, res) => {
    try {
        const qa = await qaModel.getProductQA(req.params.productId);
        res.json(Array.isArray(qa) ? qa : []);
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json([]); 
    }
});
app.post('/api/qa/answer', async (req, res) => {
    const { questionId, adminId, text } = req.body;
    try {
        await qaModel.answerQuestion(questionId, adminId, text);
        res.json({ success: true, message: "Answer posted!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/all-orders', async (req, res) => {
    try {
        const orders = await adminModel.getAllOrders();
        // console.log("--- DEBUG: DATABASE ROWS ---");
        // console.log(orders); 
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/customer/:id', verifyToken, async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT phone_number, address FROM Customer WHERE customer_id = :id`,
            { id: Number(req.params.id) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows && result.rows.length > 0) {
            res.json({
                PHONE_NUMBER: result.rows[0].PHONE_NUMBER || '',
                ADDRESS:      result.rows[0].ADDRESS || ''
            });
        } else {
            res.status(404).json({ error: "Customer not found" });
        }
    } catch (err) {
        console.error("Fetch Profile Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    } finally {
        if (conn) await conn.close();
    }
});
app.put('/api/customer/update-profile', verifyToken, async (req, res) => {
    const { customerId, phone_number, address } = req.body;
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `UPDATE Customer 
             SET phone_number = :phone, address = :addr 
             WHERE customer_id = :id`,
            { phone: phone_number, addr: address, id: customerId },
            { autoCommit: true }
        );
        res.json({ success: true, message: "Profile updated successfully!" });
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/admin/pending-questions', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT 
                q.question_id, 
                TO_CHAR(q.question_text) as question_text, 
                p.product_name 
             FROM Question q 
             JOIN Product p ON q.product_id = p.product_id 
             LEFT JOIN Answer a ON q.question_id = a.question_id 
             WHERE a.answer_id IS NULL`, 
            [], 
            { outFormat: oracledb.OUT_FORMAT_ARRAY }
        );

        const cleanData = result.rows.map(row => ({
            question_id: row[0],
            question_text: row[1], 
            product_name: row[2]
        }));

        res.json(cleanData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to load questions" });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/admin/debug-all-questions', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute("SELECT * FROM Question", [], { 
            outFormat: oracledb.OUT_FORMAT_ARRAY 
        });
        res.json(result.rows); 
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.post('/api/products/review', verifyToken, async (req, res) => {
  const { customerId, productId, rating, text } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `INSERT INTO Review (review_id, product_id, customer_id, rating, review_comment, review_date)
       VALUES (review_seq.NEXTVAL, :pid, :cid, :rating, :text, SYSDATE)`,
      { pid: Number(productId), cid: Number(customerId), rating: Number(rating), text },
      { autoCommit: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Review Error:', err);
    res.status(500).json({ error: 'Failed to post review.' });
  } finally {
    if (conn) await conn.close();
  }
});

// GET — fetch reviews for a product
app.get('/api/products/reviews/:productId', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT r.review_id, r.rating,
              DBMS_LOB.SUBSTR(r.review_comment, 4000, 1) AS REVIEW_TEXT,
              r.review_date,
              c.name AS CUSTOMER_NAME
       FROM   Review r
       JOIN   Customer c ON c.customer_id = r.customer_id
       WHERE  r.product_id = :pid
       ORDER  BY r.review_date DESC`,
      { pid: Number(req.params.productId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const reviews = result.rows.map(r => ({
      REVIEW_ID:     r.REVIEW_ID,
      RATING:        r.RATING,
      REVIEW_TEXT:   r.REVIEW_TEXT || '',
      REVIEW_DATE:   r.REVIEW_DATE,
      CUSTOMER_NAME: r.CUSTOMER_NAME || 'Customer'
    }));

    res.json(reviews);
  } catch (err) {
    console.error('Fetch Reviews Error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  } finally {
    if (conn) await conn.close();
  }
});
app.get('/api/admin/inventory', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT 
                p.product_name, 
                c.color_name, 
                s.size_label, -- Corrected from size_name to size_label
                v.variant_id, 
                v.stock_quantity 
             FROM Product p
             JOIN Product_Variant v ON p.product_id = v.product_id
             JOIN Color c ON v.color_id = c.color_id
             JOIN Product_Size s ON v.size_id = s.size_id
             ORDER BY p.product_name ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Inventory Fetch Error:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/admin/get-stock', async (req, res) => {
    const { productId, colorId, sizeId } = req.query;
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT variant_id, stock_quantity 
             FROM Product_Variant 
             WHERE product_id = :p AND color_id = :c AND size_id = :s`,
            { p: productId, c: colorId, s: sizeId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.json({ stock_quantity: 0, variant_id: null });
        }

        const row = result.rows[0];
        res.json({
            variant_id: row.VARIANT_ID || row.variant_id,
            stock_quantity: row.STOCK_QUANTITY || row.stock_quantity
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    } finally { 
        if (conn) await conn.close(); 
    }
});


app.get('/api/products/details/:id', async (req, res) => {
    const productId = req.params.id;
    let conn;
    try {
        conn = await getConnection();
        const colorsResult = await conn.execute(
            `SELECT DISTINCT c.color_id, c.color_name 
             FROM Product_Variant v 
             JOIN Color c ON v.color_id = c.color_id 
             WHERE v.product_id = :id AND v.stock_quantity > 0`,
            [productId], 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const sizesResult = await conn.execute(
            `SELECT DISTINCT s.size_id, s.size_label 
             FROM Product_Variant v 
             JOIN Product_Size s ON v.size_id = s.size_id 
             WHERE v.product_id = :id AND v.stock_quantity > 0`,
            [productId], 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            colors: colorsResult.rows,
            sizes: sizesResult.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.get('/api/admin/products-list', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(`SELECT product_id, product_name FROM Product`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json(result.rows);
    } finally { if (conn) await conn.close(); }
});
app.get('/api/admin/get-color-stock', async (req, res) => {
    const { productId, colorId } = req.query;
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT s.SIZE_LABEL, v.VARIANT_ID, NVL(v.STOCK_QUANTITY, 0) as STOCK_QUANTITY
             FROM PRODUCT_SIZE s
             LEFT JOIN PRODUCT_VARIANT v ON s.SIZE_ID = v.SIZE_ID 
             AND v.PRODUCT_ID = :p AND v.COLOR_ID = :c
             ORDER BY TO_NUMBER(s.SIZE_LABEL) ASC`,
            { p: productId, c: colorId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    } finally { 
        if (conn) await conn.close(); 
    }
});

app.get('/api/admin/colors-list', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT COLOR_ID, COLOR_NAME FROM COLOR ORDER BY COLOR_NAME`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows); 
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.post('/api/admin/update-stock', async (req, res) => {
    const { productId, colorId, sizeLabel, newStock } = req.body;
    let conn;
    try {
        conn = await getConnection();
        
        const sql = `
            MERGE INTO Product_Variant v
            USING (
                SELECT 
                    TO_NUMBER(:p) as pid, 
                    TO_NUMBER(:c) as cid, 
                    s.size_id as sid 
                FROM Product_Size s 
                WHERE s.size_label = :sl
            ) src
            ON (v.product_id = src.pid AND v.color_id = src.cid AND v.size_id = src.sid)
            WHEN MATCHED THEN
                UPDATE SET v.stock_quantity = TO_NUMBER(:stock)
            WHEN NOT MATCHED THEN
                INSERT (variant_id, product_id, color_id, size_id, stock_quantity)
                VALUES (product_variant_seq.NEXTVAL, src.pid, src.cid, src.sid, TO_NUMBER(:stock))
        `;

        await conn.execute(sql, { 
            p: productId, 
            c: colorId, 
            sl: sizeLabel, 
            stock: newStock 
        }, { autoCommit: true });

        res.json({ success: true });
    } catch (err) {
        console.error("ORACLE ERROR:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/products/check-purchase', async (req, res) => {
    const { cid, pid } = req.query;
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT o.order_id 
             FROM Order_Item oi
             JOIN Orders o ON oi.order_id = o.order_id
             JOIN Product_Variant pv ON oi.variant_id = pv.variant_id
             WHERE o.customer_id = :cid 
             AND pv.product_id = :pid
             AND o.order_status IN ('Delivered', 'Completed')`, 
           { cid: Number(cid), pid: Number(pid) }, // 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

     
        res.json({ eligible: result.rows.length > 0 });
    } catch (err) {
        console.error("Eligibility Check Error:", err);
        res.status(500).json({ error: "Check failed" });
    } finally {
        if (conn) await conn.close();
    }
})

app.get('/api/admin/discounts-list', async (req, res) => {
    try {
        const data = await adminModel.getDiscountsList();
        res.json(data);
    } catch (err) {
        console.error("Fetch Discounts Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/save-discount', async (req, res) => {
    try {
        const { productId, code, percent, start, end } = req.body;
        
        await adminModel.saveDiscount(productId, code, percent, start, end);
        
        res.json({ success: true, message: "Discount applied successfully!" });
    } catch (err) {
        console.error("Save Discount Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/remove-discount', async (req, res) => {
    try {
        const { discountId } = req.body;
        await adminModel.removeDiscount(discountId);
        res.json({ success: true, message: "Discount removed." });
    } catch (err) {
        console.error("Remove Discount Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/products/purchase-history', async (req, res) => {
    const { customerId, productId } = req.query;
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT o.order_id, o.order_date, oi.quantity, o.order_status
             FROM Orders o
             JOIN Order_Item oi ON o.order_id = oi.order_id
             JOIN Product_Variant pv ON oi.variant_id = pv.variant_id
             WHERE o.customer_id = :cid 
             AND pv.product_id = :pid
             ORDER BY o.order_date DESC`,
            { cid: customerId, pid: productId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(result.rows); 
    } catch (err) {
        console.error("Purchase History Error:", err);
        res.status(500).json({ error: "Failed to fetch purchase history" });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/products/new-arrivals', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT 
                p.PRODUCT_ID,
                p.PRODUCT_NAME,
                p.BASE_PRICE AS ORIGINAL_PRICE,
                CASE 
                    WHEN d.PERCENTAGE IS NOT NULL 
                         AND SYSDATE BETWEEN d.START_DATE AND d.END_DATE 
                    THEN ROUND(p.BASE_PRICE * (1 - (d.PERCENTAGE / 100)), 2)
                    ELSE p.BASE_PRICE 
                END AS CURRENT_PRICE,
                d.PERCENTAGE AS DISCOUNT_PERCENT,
                p.BRAND,
                p.PHOTOS
             FROM Product p
             LEFT JOIN Discount d ON p.DISCOUNT_ID = d.DISCOUNT_ID
             WHERE p.CREATED_AT >= SYSDATE - 7
             ORDER BY p.CREATED_AT DESC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.post('/api/wishlist/add', verifyToken, async (req, res) => {
    const { customerId, variantId } = req.body;
    let conn;
    try {
        conn = await getConnection();
        let result = await conn.execute(
            `SELECT wishlist_id FROM Wishlist WHERE customer_id = :cid`,
            { cid: customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        let wishlistId;
        if (result.rows.length === 0) {
            const idRes = await conn.execute(`SELECT wishlist_seq.NEXTVAL FROM dual`);
            wishlistId = idRes.rows[0][0];
            await conn.execute(
                `INSERT INTO Wishlist (wishlist_id, customer_id, created_date) VALUES (:wid, :cid, SYSDATE)`,
                { wid: wishlistId, cid: customerId }
            );
        } else {
            wishlistId = result.rows[0].WISHLIST_ID;
        }
        const check = await conn.execute(
            `SELECT wishlist_item_id FROM Wishlist_Item WHERE wishlist_id = :wid AND variant_id = :vid`,
            { wid: wishlistId, vid: variantId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (check.rows.length > 0) {
            return res.status(400).json({ error: "Already in wishlist" });
        }
        const itemIdRes = await conn.execute(`SELECT wishlist_item_seq.NEXTVAL FROM dual`);
        const itemId = itemIdRes.rows[0][0];
        await conn.execute(
            `INSERT INTO Wishlist_Item (wishlist_item_id, wishlist_id, variant_id, quantity)
             VALUES (:iid, :wid, :vid, 1)`,
            { iid: itemId, wid: wishlistId, vid: variantId }
        );
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        console.error("Wishlist add error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});


app.post('/api/wishlist/remove', async (req, res) => {
    const { wishlistItemId } = req.body;
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `DELETE FROM Wishlist_Item WHERE wishlist_item_id = :id`,
            { id: wishlistItemId },
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.post('/api/wishlist/move-to-cart', async (req, res) => {
    const { customerId, variantId, wishlistItemId } = req.body;
    let conn;
    try {
        conn = await getConnection();
        const cartRes = await conn.execute(
            `SELECT cart_id FROM Cart WHERE customer_id = :cid`,
            { cid: customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        let cartId;
        if (cartRes.rows.length === 0) {
            const newCartId = (await conn.execute(`SELECT item_seq.NEXTVAL FROM dual`)).rows[0][0];
            await conn.execute(
                `INSERT INTO Cart (cart_id, customer_id, created_date, last_updated) VALUES (:cid2, :cid, SYSDATE, SYSDATE)`,
                { cid2: newCartId, cid: customerId }
            );
            cartId = newCartId;
        } else {
            cartId = cartRes.rows[0].CART_ID;
        }
        const existing = await conn.execute(
            `SELECT cart_item_id, quantity FROM Cart_Item WHERE cart_id = :cid AND variant_id = :vid`,
            { cid: cartId, vid: variantId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (existing.rows.length > 0) {
            await conn.execute(
                `UPDATE Cart_Item SET quantity = quantity + 1 WHERE cart_item_id = :id`,
                { id: existing.rows[0].CART_ITEM_ID }
            );
        } else {
            const newItemId = (await conn.execute(`SELECT item_seq.NEXTVAL FROM dual`)).rows[0][0];
            await conn.execute(
                `INSERT INTO Cart_Item (cart_item_id, cart_id, variant_id, quantity) VALUES (:id, :cid, :vid, 1)`,
                { id: newItemId, cid: cartId, vid: variantId }
            );
        }
        await conn.execute(
            `DELETE FROM Wishlist_Item WHERE wishlist_item_id = :id`,
            { id: wishlistItemId }
        );
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.get('/api/wishlist/:customerId', verifyToken, async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        let result = await conn.execute(
            `SELECT wishlist_id FROM Wishlist WHERE customer_id = :cid`,
            { cid: req.params.customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        let wishlistId;
        if (result.rows.length === 0) {
            const idRes = await conn.execute(`SELECT wishlist_seq.NEXTVAL FROM dual`);
            wishlistId = idRes.rows[0][0];
            await conn.execute(
                `INSERT INTO Wishlist (wishlist_id, customer_id, created_date) VALUES (:wid, :cid, SYSDATE)`,
                { wid: wishlistId, cid: req.params.customerId }
            );
            await conn.commit();
        } else {
            wishlistId = result.rows[0].WISHLIST_ID;
        }
        const items = await conn.execute(
    `SELECT wi.wishlist_item_id, wi.variant_id, p.product_id,
            p.product_name, p.brand, p.photos,
            p.base_price AS original_price,
            fn_get_current_price(p.product_id) AS current_price,
            d.percentage AS discount_percent,
            c.color_name, s.size_label
     FROM Wishlist_Item wi
     JOIN Product_Variant v ON wi.variant_id = v.variant_id
     JOIN Product p ON v.product_id = p.product_id
     JOIN Color c ON v.color_id = c.color_id
     JOIN Product_Size s ON v.size_id = s.size_id
     LEFT JOIN Discount d ON p.discount_id = d.discount_id
     WHERE wi.wishlist_id = :wid`,
    { wid: wishlistId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
        res.json({ wishlistId, items: items.rows });
    } catch (err) {
        console.error("Wishlist fetch error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
// Cancel order
app.post('/api/orders/cancel', async (req, res) => {
    const { orderId, customerId } = req.body;
    let conn;
    try {
        conn = await getConnection();

        // Verify order belongs to customer and is still Pending
        const check = await conn.execute(
            `SELECT order_status FROM Orders 
             WHERE order_id = :oid AND customer_id = :cid`,
            { oid: orderId, cid: customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (check.rows.length === 0)
            return res.status(404).json({ error: "Order not found." });

        const status = check.rows[0].ORDER_STATUS;
        if (status !== 'Pending')
            return res.status(400).json({ error: "Only Pending orders can be cancelled." });

        // Restore stock
        const items = await conn.execute(
            `SELECT variant_id, quantity FROM Order_Item WHERE order_id = :oid`,
            { oid: orderId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        for (const item of items.rows) {
            await conn.execute(
                `UPDATE Product_Variant SET stock_quantity = stock_quantity + :qty 
                 WHERE variant_id = :vid`,
                { qty: item.QUANTITY, vid: item.VARIANT_ID }
            );
        }

        await conn.execute(
            `UPDATE Orders SET order_status = 'Cancelled' WHERE order_id = :oid`,
            { oid: orderId }
        );

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// Return request
app.post('/api/orders/return', async (req, res) => {
    const { orderId, customerId, reason } = req.body;
    let conn;
    try {
        conn = await getConnection();

        const check = await conn.execute(
            `SELECT order_status FROM Orders 
             WHERE order_id = :oid AND customer_id = :cid`,
            { oid: orderId, cid: customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (check.rows.length === 0)
            return res.status(404).json({ error: "Order not found." });

        const status = check.rows[0].ORDER_STATUS;
        if (status !== 'Shipped' && status !== 'Delivered')
            return res.status(400).json({ error: "Only Shipped or Delivered orders can be returned." });

        // Check if return already requested
        const existing = await conn.execute(
            `SELECT return_id FROM Return_Request WHERE order_id = :oid`,
            { oid: orderId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (existing.rows.length > 0)
            return res.status(400).json({ error: "Return already requested for this order." });

        const idRes = await conn.execute(`SELECT item_seq.NEXTVAL FROM dual`);
        const returnId = idRes.rows[0][0];

        await conn.execute(
            `INSERT INTO Return_Request (return_id, order_id, return_date, return_reason, status)
             VALUES (:rid, :oid, SYSDATE, :reason, 'Pending')`,
            { rid: returnId, oid: orderId, reason: reason || 'No reason provided' }
        );

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.get('/api/admin/return-requests', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT 
                r.RETURN_ID,
                r.ORDER_ID,
                TO_CHAR(r.RETURN_DATE) AS RETURN_DATE,
                TO_CHAR(r.RETURN_REASON) AS RETURN_REASON,
                r.STATUS,
                c.CUSTOMER_ID,
                c.NAME AS CUSTOMER_NAME
             FROM Return_Request r
             JOIN Orders o   ON r.ORDER_ID    = o.ORDER_ID
             JOIN Customer c ON o.CUSTOMER_ID = c.CUSTOMER_ID
             ORDER BY r.RETURN_DATE DESC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

       const clean = result.rows.map(r => ({
            RETURN_ID:     r.RETURN_ID,
            ORDER_ID:      r.ORDER_ID,
            RETURN_DATE:   r.RETURN_DATE,
            RETURN_REASON: r.RETURN_REASON || '',
            STATUS:        r.STATUS,
            CUSTOMER_ID:   r.CUSTOMER_ID,
            CUSTOMER_NAME: r.CUSTOMER_NAME
        }));

        res.json(clean);
    } catch (err) {
        console.error("Return requests fetch error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

// POST approve or reject a return
app.post('/api/admin/resolve-return', async (req, res) => {
    const { returnId, status } = req.body;
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `UPDATE Return_Request SET STATUS = :status WHERE RETURN_ID = :rid`,
            { status, rid: Number(returnId) },
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Resolve return error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
// Mark order as delivered
app.post('/api/admin/mark-delivered', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(
            `UPDATE Orders SET order_status = 'Delivered' WHERE order_id = :oid`,
            { oid: Number(req.body.orderId) },
            { autoCommit: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});
app.get('/api/my-orders-detail/:customerId', verifyToken, async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT o.order_id, o.order_date, o.total_amount, o.order_status,
                    p.product_id, p.product_name, p.photos,
                    oi.quantity, oi.unit_price,
                    pm.method AS payment_method
             FROM Orders o
             JOIN Order_Item oi ON o.order_id = oi.order_id
             JOIN Product_Variant pv ON oi.variant_id = pv.variant_id
             JOIN Product p ON pv.product_id = p.product_id
             LEFT JOIN Payment pm ON o.order_id = pm.order_id
             WHERE o.customer_id = :cid
             ORDER BY o.order_date DESC`,
            { cid: req.params.customerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (conn) await conn.close();
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000/login.html'));
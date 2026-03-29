const express = require('express');
const path = require('path');
const app = express();
const { getConnection, oracledb } = require('./config/db');
const authController = require('./controllers/authController');
const productController = require('./controllers/productController');
const cartModel = require('./models/cartModel');
const adminModel = require('./models/adminModel');

const qaModel = require('./models/qaModel');

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/public')));

app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/products', productController.getProducts);
app.post('/api/cart/add', async (req, res) => {
    const { customerId, variantId, quantity } = req.body;
    try {
        const result = await cartModel.addItem(customerId, variantId, quantity);
        res.status(200).json({ message: "Added to database!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});
app.get('/api/cart/:customerId', async (req, res) => {
    try {
        const items = await cartModel.getCartItems(req.params.customerId);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/cart/remove-one', async (req, res) => {
    const { customerId, variantId } = req.body;
    try {
        await cartModel.removeItemOneByOne(customerId, variantId); 
        res.json({ success: true });
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/cart/checkout', async (req, res) => {
    const { customerId } = req.body;
    try {
        await cartModel.checkout(customerId);
        res.json({ message: "Payment successful and order placed!" });
    } catch (err) {
        res.status(500).json({ error: "Checkout failed: " + err.message });
    }
});
app.get('/api/my-orders/:customerId', async (req, res) => {
    try {
        const orders = await cartModel.getCustomerOrders(req.params.customerId);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/admin/add-product', async (req, res) => {
    // 1. Extract ALL fields from the frontend form
    const { name, brand, price, category, description, colorId, sizeId, stock } = req.body;

    try {
        // 2. Pass ALL fields to the model
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
        console.log("--- DEBUG: DATABASE ROWS ---");
        console.log(orders); 
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/customer/:id', async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `SELECT phone_number, address FROM Customer WHERE customer_id = :id`,
            { id: req.params.id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT } 
        );

      
        if (result.rows && result.rows.length > 0) {
            res.json(result.rows[0]); 
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
app.put('/api/customer/update-profile', async (req, res) => {
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
app.post('/api/products/review', async (req, res) => {
    const { customerId, productId, rating, text } = req.body;
    
    let conn;

    try {
        conn = await getConnection();
       const purchaseCheck = await conn.execute(
    `SELECT oi.variant_id 
     FROM Order_Item oi
     JOIN Orders o ON oi.order_id = o.order_id
     JOIN Product_Variant pv ON oi.variant_id = pv.variant_id
     WHERE o.customer_id = :cid 
     AND pv.product_id = :pid 
     AND o.order_status IN ('Pending', 'Shipped')`, 
    { cid: customerId, pid: productId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
);

        if (purchaseCheck.rows.length === 0) {
            return res.status(403).json({ 
                error: "Access Denied: You can only review products you have purchased." 
            });
        }

        await conn.execute(
            `INSERT INTO Product_Review (review_id, customer_id, product_id, rating, review_text, review_date)
             VALUES (review_seq.NEXTVAL, :cid, :pid, :rating, :txt, SYSDATE)`,
            { cid: customerId, pid: productId, rating: rating, txt: text },
            { autoCommit: true }
        );

        res.json({ message: "Review posted successfully!" });

    } catch (err) {
        console.error("Review Error:", err);
        res.status(500).json({ error: "Database error occurred." });
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
});
app.get('/api/products/purchase-history', async (req, res) => {
    const { customerId, productId } = req.query;
    let conn;
    try {
        conn = await getConnection();
        // This query finds all successful orders for this product by this customer
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

        res.json(result.rows); // Returns an array of past purchases
    } catch (err) {
        console.error("Purchase History Error:", err);
        res.status(500).json({ error: "Failed to fetch purchase history" });
    } finally {
        if (conn) await conn.close();
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000/login.html'));
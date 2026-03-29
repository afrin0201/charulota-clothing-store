
const { getConnection, oracledb } = require('../config/db');

const productModel = {
async getAll(categoryName, searchTerm) {
    let conn;
    try {
        conn = await getConnection();
        let query = `
            SELECT 
                p.PRODUCT_ID, 
                p.PRODUCT_NAME, 
                p.BASE_PRICE, 
                p.BRAND,
                p.PHOTOS,
                DBMS_LOB.SUBSTR(p.DESCRIPTION, 4000, 1) AS DESCRIPTION,
                MIN(v.VARIANT_ID) AS VARIANT_ID 
            FROM Product p
            LEFT JOIN Product_Variant v ON p.product_id = v.product_id
            LEFT JOIN Category c ON p.category_id = c.category_id
            WHERE 1=1
        `;
        
        let params = {};

        if (categoryName && categoryName !== 'All') {
            query += ` AND c.category_name = :cat`;
            params.cat = categoryName;
        }

        if (searchTerm) {
            query += ` AND (UPPER(p.product_name) LIKE UPPER(:search) OR UPPER(p.brand) LIKE UPPER(:search))`;
            params.search = `%${searchTerm}%`; 
        }
        query += ` GROUP BY 
                    p.PRODUCT_ID, 
                    p.PRODUCT_NAME, 
                    p.BASE_PRICE, 
                    p.BRAND, 
                    p.PHOTOS,
                    DBMS_LOB.SUBSTR(p.DESCRIPTION, 4000, 1)`;

        const result = await conn.execute(query, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    } catch (err) {
        console.error("Database Error:", err);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
}
};
module.exports = productModel;
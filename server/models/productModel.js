const { getConnection, oracledb } = require('../config/db');

const productModel = {
    async getAll({ categoryName, searchTerm, size, color, maxPrice }) {
        let conn;
        try {
            conn = await getConnection();

            let query = `
                SELECT 
                    p.PRODUCT_ID, 
                    p.PRODUCT_NAME, 
                    DBMS_LOB.SUBSTR(p.DESCRIPTION, 4000, 1) AS DESCRIPTION,
                    p.BASE_PRICE AS ORIGINAL_PRICE,
                    fn_get_current_price(p.PRODUCT_ID) AS CURRENT_PRICE,
                    d.PERCENTAGE AS DISCOUNT_PERCENT,
                    p.BRAND,
                    p.PHOTOS,
                    MIN(v.VARIANT_ID) AS VARIANT_ID,
                    ROUND(AVG(r.RATING), 2) AS AVG_RATING,
                    COUNT(r.REVIEW_ID) AS REVIEW_COUNT
                FROM Product p
                LEFT JOIN Product_Variant v ON p.PRODUCT_ID  = v.PRODUCT_ID
                LEFT JOIN Category c        ON p.CATEGORY_ID = c.CATEGORY_ID
                LEFT JOIN Product_Size sz   ON v.SIZE_ID      = sz.SIZE_ID
                LEFT JOIN Color col         ON v.COLOR_ID     = col.COLOR_ID
                LEFT JOIN Discount d        ON p.DISCOUNT_ID  = d.DISCOUNT_ID
                                           AND SYSDATE BETWEEN d.START_DATE AND d.END_DATE
                LEFT JOIN Review r          ON p.PRODUCT_ID   = r.PRODUCT_ID
                WHERE 1=1
            `;

            let params = {};

            if (categoryName && categoryName !== 'All' && categoryName !== 'All Collection') {
                query += " AND UPPER(c.CATEGORY_NAME) = UPPER(:catVal)";
                params.catVal = categoryName;
            }
            if (searchTerm && searchTerm.trim() !== '') {
                query += " AND (UPPER(p.PRODUCT_NAME) LIKE UPPER(:searchVal) OR UPPER(p.BRAND) LIKE UPPER(:searchVal))";
                params.searchVal = `%${searchTerm}%`;
            }
            if (size && size !== '') {
                query += " AND sz.SIZE_ID = :sizeVal";
                params.sizeVal = size;
            }
            if (color && color !== '') {
                query += " AND col.COLOR_ID = :colorVal";
                params.colorVal = color;
            }
            if (maxPrice && maxPrice !== '') {
                query += " AND p.BASE_PRICE <= :maxPrice";
                params.maxPrice = maxPrice;
            }

            query += `
                GROUP BY 
                    p.PRODUCT_ID, 
                    p.PRODUCT_NAME, 
                    DBMS_LOB.SUBSTR(p.DESCRIPTION, 4000, 1),
                    p.BASE_PRICE,
                    p.BRAND, 
                    p.PHOTOS,
                    d.PERCENTAGE
            `;

            const result = await conn.execute(query, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            return result.rows;

        } catch (err) {
            console.error("Database Error Detail:", err);
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    }
};

module.exports = productModel;
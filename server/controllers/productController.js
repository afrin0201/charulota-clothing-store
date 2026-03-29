const productModel = require('../models/productModel');

const productController = {
    getProducts: async (req, res) => {
        try {
            const categoryName = req.query.cat || 'All'; 
            const search = req.query.search || '';

            const rows = await productModel.getAll(categoryName, search);
            
            const cleanData = (rows || []).map(row => ({
                PRODUCT_ID: row.PRODUCT_ID,
                PRODUCT_NAME: row.PRODUCT_NAME,
                DESCRIPTION: typeof row.DESCRIPTION === 'string' ? row.DESCRIPTION : 'Premium Handcrafted Item',
                BASE_PRICE: row.BASE_PRICE,
                BRAND: row.BRAND,
                VARIANT_ID: row.VARIANT_ID,
            
                PHOTOS: row.PHOTOS 
            }));

            res.setHeader('Content-Type', 'application/json');
            return res.status(200).json(cleanData);
        } catch (err) {
            console.error("Controller Error:", err.message);
            res.status(500).json({ error: "Failed to fetch products" });
        }
    }
};

module.exports = productController;
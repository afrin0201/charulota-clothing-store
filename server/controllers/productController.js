const productModel = require('../models/productModel');

const productController = {
    getProducts: async (req, res) => {
        try {
            const { cat, search, size, color, price } = req.query;

          
            const rows = await productModel.getAll({
                categoryName: cat || 'All',
                searchTerm: search || '',
                size: size || '',
                color: color || '',
                maxPrice: price || ''
            });
            
           const cleanData = (rows || []).map(row => ({
    PRODUCT_ID:       row.PRODUCT_ID,
    PRODUCT_NAME:     row.PRODUCT_NAME,
    DESCRIPTION:      typeof row.DESCRIPTION === 'string' ? row.DESCRIPTION : 'Premium Handcrafted Item',
    ORIGINAL_PRICE:   row.ORIGINAL_PRICE,   // was BASE_PRICE
    CURRENT_PRICE:    row.CURRENT_PRICE,     // discounted price (or same as original)
    DISCOUNT_PERCENT: row.DISCOUNT_PERCENT,  // null if no discount
    BRAND:            row.BRAND,
    VARIANT_ID:       row.VARIANT_ID,
    PHOTOS:           row.PHOTOS,
      AVG_RATING:       row.AVG_RATING || null,
    REVIEW_COUNT:     row.REVIEW_COUNT || 0
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
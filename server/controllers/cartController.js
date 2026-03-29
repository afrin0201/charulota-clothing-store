const cartModel = require('../models/cartModel');

const cartController = {
    addToCart: async (req, res) => {
        try {
            const { variantId, quantity } = req.body;
            const customerId = req.session.userId; 

            if (!customerId) return res.status(401).json({ error: "Please login first" });

            await cartModel.addItem(customerId, variantId, quantity || 1);
            res.status(200).json({ message: "Added to bag successfully!" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = cartController;
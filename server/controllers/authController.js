const userModel = require('../models/userModel');

exports.register = async (req, res) => {
    try {
        const { name, email, password, address, phone_number } = req.body;
        await userModel.register(name, email, password, address, phone_number);

        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        if (err.message.includes("ORA-00001")) {
            res.status(400).json({ message: "This email or phone number is already registered." });
        } else {
            res.status(500).json({ message: "Database Error: " + err.message });
        }
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findByEmail(email);

        if (!user || user.PASSWORD !== password) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        res.json({ 
            message: "Login successful", 
            user: { 
                name: user.NAME, 
                id: user.CUSTOMER_ID,
                phone: user.PHONE_NUMBER 
            } 
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
const customerModel = require('../models/customerModel');

async function createCustomer(req, res) {
  try {
    await customerModel.addCustomer(req.body);
    res.status(201).json({ message: 'Customer added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listCustomers(req, res) {
  try {
    const data = await customerModel.getAllCustomers();
    
    let cleanData;
    if (Array.isArray(data)) {
        cleanData = data; 
    } else if (data && data.rows) {
        cleanData = data.rows; 
    } else {
        cleanData = []; 
    }
    
   
    res.json(cleanData); 
    
  } catch (err) {
    console.error("Controller Error:", err);
  
    res.status(500).json({ error: err.message });
  }
}
module.exports = { createCustomer, listCustomers };
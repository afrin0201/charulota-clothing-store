const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// URL: http://localhost:3000/api/auth/register
router.post('/register', authController.register);

module.exports = router;
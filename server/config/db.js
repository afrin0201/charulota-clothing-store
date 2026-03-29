const oracledb = require('oracledb');
const path = require('path');

// Since .env is in the same folder as this file (config/), we use __dirname
require('dotenv').config({ path: path.join(__dirname, '.env') }); 

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECTION_STRING
};

async function getConnection() {
  // Let's verify if it's working now
  if (!dbConfig.connectString) {
    console.log("❌ Still missing! Check if your file is named exactly .env (no .txt)");
    console.log("Looking in:", path.join(__dirname, '.env'));
    throw new Error("Database connection string is missing.");
  }
  return await oracledb.getConnection(dbConfig);
}

module.exports = { getConnection, oracledb };
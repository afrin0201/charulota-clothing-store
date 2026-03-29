const { getConnection, oracledb } = require('../config/db');

async function getAllCustomers() {
  let conn;
  try {
    conn = await getConnection();
const result = await conn.execute(
  `SELECT * FROM Customer`, 
  [], 
  { outFormat: oracledb.OUT_FORMAT_OBJECT }
);

console.log("Rows fetched:", result.rows.length); 

  } catch (err) {
    throw err;
  } finally {
    if (conn) await conn.close();
  }
}

async function addCustomer(customer) {
  let conn;
  try {
    conn = await getConnection();
    const { name, email } = customer;
    await conn.execute(
      `INSERT INTO Customer (name, email) VALUES (:name, :email)`,
      { name, email },
      { autoCommit: true }
    );
  } catch (err) {
    throw err;
  } finally {
    if (conn) await conn.close();
  }
}

module.exports = { getAllCustomers, addCustomer };